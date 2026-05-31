import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Envelope, MessageType } from "./envelope";

export interface ConsumeResult {
  envelopes: Envelope[];
  nextOffset: string;
}

export interface EnvelopeTransport {
  readonly kind: "jsonl" | "redis";
  publish(envelope: Envelope): Promise<void>;
  consume(fromOffset: string, filter?: MessageType[]): Promise<ConsumeResult>;
  close(): Promise<void>;
}

export interface EnvelopeTransportInitOptions {
  primary: TransportConfig;
  fallback: JsonlTransportConfig;
  timeoutMs?: number;
  onError?: (error: unknown) => void;
}

export type JsonlTransportConfig = {
  type: "jsonl";
  filePath: string;
  validator?: (envelope: unknown) => boolean;
  maxLines?: number;
  retainLines?: number;
};

export type RedisTransportConfig = {
  type: "redis";
  url: string;
  streamKey?: string;
  validator?: (envelope: unknown) => boolean;
};

export type TransportConfig = JsonlTransportConfig | RedisTransportConfig;

function parseJsonLine(raw: string): Envelope | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Envelope;
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  const timeout = Math.max(0, Math.floor(ms));
  if (timeout <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    setTimeout(resolve, timeout);
  });
}

async function withFileLock<T>(filePath: string, fn: () => T): Promise<T> {
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
        throw new Error(`Timed out acquiring envelope file lock for ${filePath}`);
      }
      await sleep(retryMs);
    }
  }

  try {
    return fn();
  } finally {
    rmSync(lockPath, { recursive: true, force: true });
  }
}

interface JsonlOffsetMeta {
  schema_version: "1.0.0";
  base_offset: number;
}

class JsonlEnvelopeTransport implements EnvelopeTransport {
  readonly kind = "jsonl" as const;
  private readonly maxLines: number;
  private readonly retainLines: number;
  private readonly metaPath: string;
  private baseOffset = 0;

  constructor(private readonly config: JsonlTransportConfig) {
    this.maxLines = Math.max(1000, config.maxLines ?? 20000);
    this.retainLines = Math.max(100, Math.min(this.maxLines, config.retainLines ?? 5000));
    mkdirSync(dirname(config.filePath), { recursive: true });
    this.metaPath = `${config.filePath}.meta.json`;
    this.baseOffset = this.loadBaseOffset();
  }

  async publish(envelope: Envelope): Promise<void> {
    if (this.config.validator && !this.config.validator(envelope)) return;
    await withFileLock(this.config.filePath, () => {
      appendFileSync(this.config.filePath, `${JSON.stringify(envelope)}\n`, "utf8");
    });
  }

  async consume(fromOffset: string, filter?: MessageType[]): Promise<ConsumeResult> {
    return await withFileLock(this.config.filePath, () => {
      if (!existsSync(this.config.filePath)) {
        if (this.baseOffset !== 0) {
          this.baseOffset = 0;
          this.saveBaseOffset();
        }
        return { envelopes: [], nextOffset: "0" };
      }

      const raw = readFileSync(this.config.filePath, "utf8");
      const lines = raw.split(/\r?\n/).filter((line) => line.trim().length);
      const requestedOffset = Math.max(0, Number.parseInt(fromOffset || "0", 10) || 0);
      const effectiveOffset = Math.max(requestedOffset, this.baseOffset);
      const start = Math.max(0, effectiveOffset - this.baseOffset);
      const allowed = filter && filter.length ? new Set(filter) : null;
      const envelopes: Envelope[] = [];
      for (let i = start; i < lines.length; i += 1) {
        const parsed = parseJsonLine(lines[i] ?? "");
        if (!parsed) continue;
        if (this.config.validator && !this.config.validator(parsed)) continue;
        if (allowed && !allowed.has(parsed.message_type)) continue;
        envelopes.push(parsed);
      }

      if (effectiveOffset >= this.baseOffset + lines.length && lines.length > this.maxLines) {
        const dropCount = lines.length - this.retainLines;
        const retained = lines.slice(-this.retainLines);
        const body = retained.length ? `${retained.join("\n")}\n` : "";
        writeFileSync(this.config.filePath, body, "utf8");
        this.baseOffset += dropCount;
        this.saveBaseOffset();
        return {
          envelopes,
          nextOffset: String(this.baseOffset + retained.length),
        };
      }

      return {
        envelopes,
        nextOffset: String(this.baseOffset + lines.length),
      };
    });
  }

  async close(): Promise<void> {}

  private loadBaseOffset(): number {
    if (!existsSync(this.metaPath)) return 0;
    try {
      const raw = JSON.parse(readFileSync(this.metaPath, "utf8")) as Partial<JsonlOffsetMeta>;
      const parsed = Number(raw.base_offset ?? 0);
      if (!Number.isFinite(parsed) || parsed < 0) return 0;
      return Math.floor(parsed);
    } catch {
      return 0;
    }
  }

  private saveBaseOffset(): void {
    const payload: JsonlOffsetMeta = {
      schema_version: "1.0.0",
      base_offset: this.baseOffset,
    };
    writeFileSync(this.metaPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Envelope transport init timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

export async function createEnvelopeTransport(config: TransportConfig): Promise<EnvelopeTransport> {
  if (config.type === "jsonl") {
    return new JsonlEnvelopeTransport(config);
  }
  const { createRedisEnvelopeTransport } = await import("./envelope-transport-redis");
  return createRedisEnvelopeTransport(config);
}

export async function initEnvelopeTransport(options: EnvelopeTransportInitOptions): Promise<EnvelopeTransport> {
  if (options.primary.type === "jsonl") {
    return createEnvelopeTransport(options.primary);
  }
  try {
    return await withTimeout(
      createEnvelopeTransport(options.primary),
      Math.max(250, Math.floor(options.timeoutMs ?? 5000)),
    );
  } catch (error) {
    if (typeof options.onError === "function") {
      options.onError(error);
    }
    return createEnvelopeTransport(options.fallback);
  }
}
