import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

export type StorageBackend = "jsonl" | "sqlite";

export interface MemorySlotRecord {
  schema_version: "1.0.0";
  slot_id: string;
  user_id: string;
  slot_name: string;
  content_json: string;
  source_candidate_ids_json: string;
  updated_at: string;
}

export interface MemorySlotPatchRecord {
  schema_version: "1.0.0";
  patch_id: string;
  slot_id: string;
  user_id: string;
  slot_name: string;
  operation: "set" | "merge" | "remove";
  patch_json: string;
  source_candidate_ids_json: string;
  created_at: string;
}

export interface StorageRepository {
  readonly backend: StorageBackend;
  append(entity: string, record: Record<string, unknown>): void;
  readAll<T = Record<string, unknown>>(entity: string): T[];
  replaceAll(entity: string, records: Record<string, unknown>[]): void;
  getSingleton<T = Record<string, unknown>>(entity: string): T | null;
  setSingleton(entity: string, value: Record<string, unknown>): void;
  upsertSlot(slot: MemorySlotRecord): void;
  listSlots(userId?: string): MemorySlotRecord[];
  appendSlotPatch(patch: MemorySlotPatchRecord): void;
  listSlotPatches(userId?: string): MemorySlotPatchRecord[];
  close(): void;
}

export interface StorageRepositoryConfig {
  backend: StorageBackend;
  dataDir: string;
  sqlitePath?: string;
}

interface SqliteStatement {
  run(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
}

interface SqliteLikeDatabase {
  exec(sql: string): void;
  prepare?: (sql: string) => SqliteStatement;
  query?: (sql: string) => SqliteStatement;
  pragma?: (value: string) => unknown;
  transaction?: <T extends (...args: never[]) => unknown>(fn: T) => T;
  close(): void;
}

function safeParseJson(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readJsonl(filePath: string): Record<string, unknown>[] {
  if (!existsSync(filePath)) return [];
  const raw = readFileSync(filePath, "utf8");
  if (!raw.trim().length) return [];
  const out: Record<string, unknown>[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.length) continue;
    const parsed = safeParseJson(trimmed);
    if (parsed) out.push(parsed);
  }
  return out;
}

function writeJsonl(filePath: string, rows: Record<string, unknown>[]): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const body = rows.length ? `${rows.map((row) => JSON.stringify(row)).join("\n")}\n` : "";
  writeFileSync(filePath, body, "utf8");
}

function readJsonFile(filePath: string): Record<string, unknown> | null {
  if (!existsSync(filePath)) return null;
  const raw = readFileSync(filePath, "utf8");
  if (!raw.trim().length) return null;
  return safeParseJson(raw);
}

function writeJsonFile(filePath: string, value: Record<string, unknown>): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function jsonlPath(dataDir: string, entity: string): string {
  return join(dataDir, `${entity}.jsonl`);
}

function singletonPath(dataDir: string, entity: string): string {
  return join(dataDir, `${entity}.json`);
}

function sleepSync(ms: number): void {
  const timeout = Math.max(0, Math.floor(ms));
  if (timeout <= 0) return;
  if (typeof SharedArrayBuffer !== "undefined" && typeof Atomics !== "undefined") {
    const arr = new Int32Array(new SharedArrayBuffer(4));
    Atomics.wait(arr, 0, 0, timeout);
    return;
  }
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    // busy wait fallback for runtimes without Atomics.wait
  }
}

function withFileLock<T>(filePath: string, fn: () => T): T {
  const lockPath = `${filePath}.lock`;
  const timeoutMs = 5000;
  const retryMs = 25;
  const staleLockMs = 30000;
  const startedAt = Date.now();

  mkdirSync(dirname(filePath), { recursive: true });

  while (true) {
    try {
      mkdirSync(lockPath);
      break;
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code !== "EEXIST") throw error;

      try {
        const stats = statSync(lockPath);
        if (Date.now() - stats.mtimeMs > staleLockMs) {
          rmSync(lockPath, { recursive: true, force: true });
          continue;
        }
      } catch {
        // lock may have disappeared between attempts
      }

      if (Date.now() - startedAt >= timeoutMs) {
        throw new Error(`Timed out acquiring JSONL lock for ${filePath}`);
      }
      sleepSync(retryMs);
    }
  }

  try {
    return fn();
  } finally {
    rmSync(lockPath, { recursive: true, force: true });
  }
}

function createSqliteDatabase(sqlitePath: string): SqliteLikeDatabase {
  const require = createRequire(import.meta.url);
  try {
    const bunSqlite = require("bun:sqlite") as { Database: new (filePath: string, options?: { create?: boolean }) => SqliteLikeDatabase };
    return new bunSqlite.Database(sqlitePath, { create: true });
  } catch {
    // Not running under Bun, continue to better-sqlite3 fallback.
  }
  try {
    const mod = require("better-sqlite3") as { default?: new (filePath: string) => SqliteLikeDatabase };
    const Ctor = mod.default ?? (mod as unknown as new (filePath: string) => SqliteLikeDatabase);
    return new Ctor(sqlitePath);
  } catch {
    throw new Error(
      "SQLite backend unavailable. Use Bun (bun:sqlite) or install better-sqlite3 for Node runtime.",
    );
  }
}

function getStatement(db: SqliteLikeDatabase, sql: string): SqliteStatement {
  if (typeof db.prepare === "function") {
    return db.prepare(sql);
  }
  if (typeof db.query === "function") {
    return db.query(sql);
  }
  throw new Error("SQLite driver does not support prepared statements.");
}

class JsonlStorageRepository implements StorageRepository {
  readonly backend: StorageBackend = "jsonl";

  constructor(private readonly dataDir: string) {}

  append(entity: string, record: Record<string, unknown>): void {
    const filePath = jsonlPath(this.dataDir, entity);
    withFileLock(filePath, () => {
      appendFileSync(filePath, `${JSON.stringify(record)}\n`, "utf8");
    });
  }

  readAll<T = Record<string, unknown>>(entity: string): T[] {
    const filePath = jsonlPath(this.dataDir, entity);
    const rows = withFileLock(filePath, () => readJsonl(filePath));
    return rows as T[];
  }

  replaceAll(entity: string, records: Record<string, unknown>[]): void {
    const filePath = jsonlPath(this.dataDir, entity);
    withFileLock(filePath, () => {
      writeJsonl(filePath, records);
    });
  }

  getSingleton<T = Record<string, unknown>>(entity: string): T | null {
    const filePath = singletonPath(this.dataDir, entity);
    const row = withFileLock(filePath, () => readJsonFile(filePath));
    return row ? (row as T) : null;
  }

  setSingleton(entity: string, value: Record<string, unknown>): void {
    const filePath = singletonPath(this.dataDir, entity);
    withFileLock(filePath, () => {
      writeJsonFile(filePath, value);
    });
  }

  upsertSlot(slot: MemorySlotRecord): void {
    const filePath = jsonlPath(this.dataDir, "memory_slots");
    withFileLock(filePath, () => {
      const rows = readJsonl(filePath) as unknown as MemorySlotRecord[];
      const next = rows.filter((row) => row.slot_id !== slot.slot_id);
      next.push(slot);
      writeJsonl(filePath, next as unknown as Record<string, unknown>[]);
    });
  }

  listSlots(userId?: string): MemorySlotRecord[] {
    const filePath = jsonlPath(this.dataDir, "memory_slots");
    const rows = withFileLock(filePath, () => readJsonl(filePath)) as unknown as MemorySlotRecord[];
    if (!userId) return rows;
    return rows.filter((row) => row.user_id === userId);
  }

  appendSlotPatch(patch: MemorySlotPatchRecord): void {
    this.append("memory_slot_patches", patch as unknown as Record<string, unknown>);
  }

  listSlotPatches(userId?: string): MemorySlotPatchRecord[] {
    const filePath = jsonlPath(this.dataDir, "memory_slot_patches");
    const rows = withFileLock(filePath, () => readJsonl(filePath)) as unknown as MemorySlotPatchRecord[];
    if (!userId) return rows;
    return rows.filter((row) => row.user_id === userId);
  }

  close(): void {}
}

class SQLiteStorageRepository implements StorageRepository {
  readonly backend: StorageBackend = "sqlite";
  private readonly db: SqliteLikeDatabase;

  constructor(sqlitePath: string) {
    mkdirSync(dirname(sqlitePath), { recursive: true });
    this.db = createSqliteDatabase(sqlitePath);
    if (typeof this.db.pragma === "function") {
      this.db.pragma("journal_mode = WAL");
      this.db.pragma("synchronous = NORMAL");
      this.db.pragma("busy_timeout = 5000");
    } else {
      this.db.exec("PRAGMA journal_mode = WAL;");
      this.db.exec("PRAGMA synchronous = NORMAL;");
      this.db.exec("PRAGMA busy_timeout = 5000;");
    }
    this.initializeSchema();
  }

  private transaction<T>(fn: () => T): T {
    if (typeof this.db.transaction === "function") {
      const wrapped = this.db.transaction(fn as () => unknown);
      return wrapped() as T;
    }
    this.db.exec("BEGIN");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS records (
        entity TEXT NOT NULL,
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_records_entity_seq ON records(entity, seq);

      CREATE TABLE IF NOT EXISTS singletons (
        entity TEXT PRIMARY KEY,
        json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS memory_slots (
        slot_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        slot_name TEXT NOT NULL,
        content_json TEXT NOT NULL,
        source_candidate_ids_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_memory_slots_user_slot ON memory_slots(user_id, slot_name);

      CREATE TABLE IF NOT EXISTS memory_slot_patches (
        patch_id TEXT PRIMARY KEY,
        slot_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        slot_name TEXT NOT NULL,
        operation TEXT NOT NULL,
        patch_json TEXT NOT NULL,
        source_candidate_ids_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_memory_slot_patches_user ON memory_slot_patches(user_id, created_at);
    `);
  }

  append(entity: string, record: Record<string, unknown>): void {
    const stmt = getStatement(this.db, "INSERT INTO records(entity, json) VALUES (?, ?)");
    stmt.run(entity, JSON.stringify(record));
  }

  readAll<T = Record<string, unknown>>(entity: string): T[] {
    const stmt = getStatement(this.db, "SELECT json FROM records WHERE entity = ? ORDER BY seq ASC");
    const rows = stmt.all(entity) as Array<{ json: string }>;
    const out: T[] = [];
    for (const row of rows) {
      const parsed = safeParseJson(row.json);
      if (parsed) out.push(parsed as T);
    }
    return out;
  }

  replaceAll(entity: string, records: Record<string, unknown>[]): void {
    const remove = getStatement(this.db, "DELETE FROM records WHERE entity = ?");
    const insert = getStatement(this.db, "INSERT INTO records(entity, json) VALUES (?, ?)");
    this.transaction(() => {
      remove.run(entity);
      for (const row of records) {
        insert.run(entity, JSON.stringify(row));
      }
    });
  }

  getSingleton<T = Record<string, unknown>>(entity: string): T | null {
    const stmt = getStatement(this.db, "SELECT json FROM singletons WHERE entity = ?");
    const row = stmt.get(entity) as { json: string } | undefined;
    if (!row) return null;
    const parsed = safeParseJson(row.json);
    return parsed ? (parsed as T) : null;
  }

  setSingleton(entity: string, value: Record<string, unknown>): void {
    const stmt = getStatement(
      this.db,
      "INSERT INTO singletons(entity, json, updated_at) VALUES (?, ?, ?) ON CONFLICT(entity) DO UPDATE SET json=excluded.json, updated_at=excluded.updated_at",
    );
    stmt.run(entity, JSON.stringify(value), new Date().toISOString());
  }

  upsertSlot(slot: MemorySlotRecord): void {
    const stmt = getStatement(
      this.db,
      "INSERT INTO memory_slots(slot_id, user_id, slot_name, content_json, source_candidate_ids_json, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(slot_id) DO UPDATE SET user_id=excluded.user_id, slot_name=excluded.slot_name, content_json=excluded.content_json, source_candidate_ids_json=excluded.source_candidate_ids_json, updated_at=excluded.updated_at",
    );
    stmt.run(
      slot.slot_id,
      slot.user_id,
      slot.slot_name,
      slot.content_json,
      slot.source_candidate_ids_json,
      slot.updated_at,
    );
  }

  listSlots(userId?: string): MemorySlotRecord[] {
    const stmt = userId
      ? getStatement(this.db, "SELECT * FROM memory_slots WHERE user_id = ? ORDER BY updated_at ASC")
      : getStatement(this.db, "SELECT * FROM memory_slots ORDER BY updated_at ASC");
    const rows = userId ? (stmt.all(userId) as MemorySlotRecord[]) : (stmt.all() as MemorySlotRecord[]);
    return rows;
  }

  appendSlotPatch(patch: MemorySlotPatchRecord): void {
    const stmt = getStatement(
      this.db,
      "INSERT OR REPLACE INTO memory_slot_patches(patch_id, slot_id, user_id, slot_name, operation, patch_json, source_candidate_ids_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    );
    stmt.run(
      patch.patch_id,
      patch.slot_id,
      patch.user_id,
      patch.slot_name,
      patch.operation,
      patch.patch_json,
      patch.source_candidate_ids_json,
      patch.created_at,
    );
  }

  listSlotPatches(userId?: string): MemorySlotPatchRecord[] {
    const stmt = userId
      ? getStatement(this.db, "SELECT * FROM memory_slot_patches WHERE user_id = ? ORDER BY created_at ASC")
      : getStatement(this.db, "SELECT * FROM memory_slot_patches ORDER BY created_at ASC");
    const rows = userId ? (stmt.all(userId) as MemorySlotPatchRecord[]) : (stmt.all() as MemorySlotPatchRecord[]);
    return rows;
  }

  close(): void {
    this.db.close();
  }
}

export function createStorageRepository(config: StorageRepositoryConfig): StorageRepository {
  if (config.backend === "sqlite") {
    const sqlitePath = config.sqlitePath || join(config.dataDir, "grillo.db");
    return new SQLiteStorageRepository(sqlitePath);
  }
  return new JsonlStorageRepository(config.dataDir);
}
