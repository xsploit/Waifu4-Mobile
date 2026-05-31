import type { PersonaProfile } from './types';
import {
  deleteLadybugSemanticMemory,
  loadLadybugSemanticMemory,
  saveLadybugSemanticMemory,
  searchLadybugSemanticMemory,
} from './ladybug-memory-client';

export type SemanticMemoryRecord = {
  id: string;
  createdAt: number;
  personaId: string;
  scopeKey: string;
  text: string;
  userText: string;
  assistantText: string;
  embedding: number[] | null;
};

export type SemanticMemoryMatch = SemanticMemoryRecord & {
  score: number;
};

export type SemanticMemoryWriteResult = {
  record: SemanticMemoryRecord;
  totalIndexed: number;
  vectorDims: number;
};

const LEGACY_MEMORY_KEY_PREFIX = 'yourwifey:semantic-memory:v1:';
const DB_NAME = 'yourwifey-memory';
// v2 replays the schema guard so older/broken IndexedDB stores get the scope index before vector recall is used.
const DB_VERSION = 2;
const SEMANTIC_STORE = 'semanticRecords';
const SCOPE_INDEX = 'scopeKey';
const MAX_RECORDS_PER_SCOPE = 160;
const LEGACY_MAX_RECORDS_PER_SCOPE = 80;
const semanticMemoryWriteQueues = new Map<string, Promise<void>>();
const semanticMemoryRecordCache = new Map<string, SemanticMemoryRecord[]>();
const semanticMemorySearchCache = new Map<string, { matches: SemanticMemoryMatch[]; signature: string }>();
const semanticTokenCache = new Map<string, Set<string>>();
const MAX_TOKEN_CACHE_ENTRIES = 512;
const SEMANTIC_MEMORY_DECAY_WINDOW_MS = 1000 * 60 * 60 * 24 * 90;
const SALIENT_MEMORY_TERMS = new Set([
  'always',
  'boundary',
  'care',
  'dont',
  "don't",
  'favorite',
  'goal',
  'hate',
  'important',
  'like',
  'likes',
  'love',
  'loves',
  'need',
  'needs',
  'never',
  'prefer',
  'prefers',
  'remember',
  'trust',
  'want',
  'wants',
]);
const EMOTIONAL_MEMORY_TERMS = new Set([
  'angry',
  'annoyed',
  'care',
  'caring',
  'embarrassed',
  'excited',
  'frustrated',
  'grateful',
  'happy',
  'hurt',
  'mad',
  'nervous',
  'sad',
  'scared',
  'trust',
  'worried',
]);

export function buildSemanticMemoryTurnText(
  userText: string,
  assistantText: string,
  persona: PersonaProfile | null,
) {
  const personaName = persona?.name?.trim() || 'assistant';
  const normalizedUserText = normalizeSemanticMemoryText(userText, 1200);
  const normalizedAssistantText = normalizeSemanticAssistantText(assistantText, 1200);
  return [`User: ${normalizedUserText}`, `${personaName}: ${normalizedAssistantText}`]
    .filter(Boolean)
    .join('\n')
    .slice(0, 2400);
}

export function normalizeSemanticAssistantText(value: unknown, maxLength = 1200) {
  const raw = normalizeSemanticMemoryText(value, maxLength * 2);
  if (!raw) {
    return '';
  }

  const parsed = parseAssistantStructuredText(raw);
  const message = typeof parsed?.['message'] === 'string' ? parsed['message'] : '';
  if (message.trim()) {
    return normalizeSemanticMemoryText(message, maxLength);
  }

  return normalizeSemanticMemoryText(stripAssistantMetadata(raw), maxLength);
}

export function buildSemanticMemoryContext(matches: SemanticMemoryMatch[]) {
  const usable = matches.filter((match) => match.text.trim()).slice(0, 4);
  if (usable.length === 0) {
    return '';
  }

  return usable
    .map((match, index) => `${index + 1}. ${match.text.replace(/\s+/g, ' ').trim()}`)
    .join('\n');
}

export async function loadSemanticMemory(scopeKey: string): Promise<SemanticMemoryRecord[]> {
  const cacheKey = normalizeScopeKey(scopeKey);
  const cached = semanticMemoryRecordCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const remoteRecords = await loadLadybugSemanticMemory(scopeKey);
  if (remoteRecords) {
    const records = normalizeSemanticMemoryRecords(remoteRecords, MAX_RECORDS_PER_SCOPE);
    setSemanticMemoryRecordCache(cacheKey, records);
    return records;
  }

  const db = await openSemanticMemoryDb();
  if (!db) {
    const records = loadLegacySemanticMemory(scopeKey);
    setSemanticMemoryRecordCache(cacheKey, records);
    return records;
  }

  let records: SemanticMemoryRecord[];
  try {
    records = await loadSemanticMemoryFromIndexedDb(db, scopeKey);
  } catch (error) {
    warnSemanticMemoryFailure(
      'IndexedDB semantic memory load failed; using fallback store.',
      error,
    );
    const records = loadLegacySemanticMemory(scopeKey);
    setSemanticMemoryRecordCache(cacheKey, records);
    return records;
  }
  if (records.length > 0) {
    setSemanticMemoryRecordCache(cacheKey, records);
    return records;
  }

  const legacyRecords = loadLegacySemanticMemory(scopeKey);
  if (legacyRecords.length > 0) {
    await saveSemanticMemoryToIndexedDb(db, scopeKey, legacyRecords);
  }
  setSemanticMemoryRecordCache(cacheKey, legacyRecords);
  return legacyRecords;
}

export async function saveSemanticMemory(scopeKey: string, records: SemanticMemoryRecord[]) {
  const cacheKey = normalizeScopeKey(scopeKey);
  const normalizedRecords = normalizeSemanticMemoryRecords(records, MAX_RECORDS_PER_SCOPE);
  setSemanticMemoryRecordCache(cacheKey, normalizedRecords);
  if (await saveLadybugSemanticMemory(scopeKey, normalizedRecords)) {
    return;
  }

  const db = await openSemanticMemoryDb();
  if (!db) {
    saveLegacySemanticMemory(scopeKey, normalizedRecords);
    return;
  }

  try {
    await saveSemanticMemoryToIndexedDb(db, scopeKey, normalizedRecords);
  } catch (error) {
    warnSemanticMemoryFailure(
      'IndexedDB semantic memory save failed; writing fallback store.',
      error,
    );
    saveLegacySemanticMemory(scopeKey, normalizedRecords);
  }
}

export async function clearSemanticMemory(scopeKey: string) {
  const cacheKey = normalizeScopeKey(scopeKey);
  setSemanticMemoryRecordCache(cacheKey, []);
  await deleteLadybugSemanticMemory(scopeKey).catch((error) => {
    warnSemanticMemoryFailure('Ladybug semantic memory delete failed; clearing local fallback stores.', error);
  });

  const db = await openSemanticMemoryDb();
  if (db) {
    try {
      await saveSemanticMemoryToIndexedDb(db, scopeKey, []);
      deleteLegacySemanticMemory(scopeKey);
      return;
    } catch (error) {
      warnSemanticMemoryFailure(
        'IndexedDB semantic memory clear failed; clearing fallback store.',
        error,
      );
    }
  }

  deleteLegacySemanticMemory(scopeKey);
}

export async function addSemanticMemoryTurn({
  assistantText,
  embedding,
  persona,
  scopeKey,
  userText,
}: {
  assistantText: string;
  embedding: number[] | null;
  persona: PersonaProfile | null;
  scopeKey: string;
  userText: string;
}) {
  const normalizedUserText = normalizeSemanticMemoryText(userText, 1200);
  const normalizedAssistantText = normalizeSemanticAssistantText(assistantText, 1200);
  const text = buildSemanticMemoryTurnText(normalizedUserText, normalizedAssistantText, persona);
  if (text.length < 24) {
    return null;
  }

  return enqueueSemanticMemoryWrite(scopeKey, async () => {
    const records = await loadSemanticMemory(scopeKey);
    const record: SemanticMemoryRecord = {
      id: `${Date.now()}-${hashText(text).toString(36)}`,
      createdAt: Date.now(),
      personaId: persona?.id ?? 'unknown',
      scopeKey,
      text,
      userText: normalizedUserText,
      assistantText: normalizedAssistantText,
      embedding: normalizeEmbedding(embedding),
    };

    const nextRecords = [record, ...records];
    await saveSemanticMemory(scopeKey, nextRecords);
    return {
      record,
      totalIndexed: Math.min(nextRecords.length, MAX_RECORDS_PER_SCOPE),
      vectorDims: record.embedding?.length ?? 0,
    };
  });
}

export async function findSemanticMemoryMatches(
  scopeKey: string,
  query: string,
  queryEmbedding: number[] | null,
  limit = 4,
): Promise<SemanticMemoryMatch[]> {
  const remoteMatches = await searchLadybugSemanticMemory(scopeKey, queryEmbedding, limit);
  if (remoteMatches?.length) {
    return rerankSemanticMemoryMatches(remoteMatches, query, queryEmbedding, limit, Date.now());
  }

  const records = await loadSemanticMemory(scopeKey);
  const signature = createSemanticSearchSignature(records, query, queryEmbedding, limit);
  const cacheKey = `${normalizeScopeKey(scopeKey)}:${hashText(signature).toString(36)}`;
  const cached = semanticMemorySearchCache.get(cacheKey);
  if (cached?.signature === signature) {
    return cached.matches;
  }

  const matches = findSemanticMemoryMatchesInRecords(records, query, queryEmbedding, limit);
  semanticMemorySearchCache.set(cacheKey, { matches, signature });
  pruneMap(semanticMemorySearchCache, 64);
  return matches;
}

export function findSemanticMemoryMatchesInRecords(
  records: SemanticMemoryRecord[],
  query: string,
  queryEmbedding: number[] | null,
  limit = 4,
): SemanticMemoryMatch[] {
  const normalizedQueryEmbedding = normalizeEmbedding(queryEmbedding);
  const queryTerms = tokenize(query);
  const now = Date.now();
  return records
    .map((record) => ({
      ...record,
      score: scoreSemanticMemory(record, queryTerms, normalizedQueryEmbedding, now),
    }))
    .filter((record) => record.score > 0.05)
    .sort((a, b) => b.score - a.score || b.createdAt - a.createdAt)
    .slice(0, limit);
}

export function scoreSemanticMemoryRecord(
  record: SemanticMemoryRecord,
  query: string,
  queryEmbedding: number[] | null,
) {
  return scoreSemanticMemory(record, tokenize(query), normalizeEmbedding(queryEmbedding), Date.now());
}

function scoreSemanticMemory(
  record: SemanticMemoryRecord,
  queryTerms: Set<string>,
  queryEmbedding: number[] | null,
  now: number,
) {
  const vectorScore =
    queryEmbedding && record.embedding ? cosineSimilarity(queryEmbedding, record.embedding) : 0;
  const lexicalScore = jaccardSimilarity(queryTerms, tokenizeSemanticRecord(record));
  const salienceScore = scoreSemanticMemorySalience(record, queryTerms, now);
  return vectorScore * 0.7 + lexicalScore * 0.16 + salienceScore * 0.14;
}

function rerankSemanticMemoryMatches(
  matches: SemanticMemoryMatch[],
  query: string,
  queryEmbedding: number[] | null,
  limit: number,
  now: number,
) {
  const queryTerms = tokenize(query);
  const normalizedEmbedding = normalizeEmbedding(queryEmbedding);
  return matches
    .map((match) => {
      const vectorScore =
        typeof match.score === 'number' && Number.isFinite(match.score)
          ? Math.max(0, Math.min(1, match.score))
          : normalizedEmbedding && match.embedding
            ? cosineSimilarity(normalizedEmbedding, match.embedding)
            : 0;
      const lexicalScore = jaccardSimilarity(queryTerms, tokenizeSemanticRecord(match));
      const salienceScore = scoreSemanticMemorySalience(match, queryTerms, now);
      return {
        ...match,
        score: vectorScore * 0.7 + lexicalScore * 0.16 + salienceScore * 0.14,
      };
    })
    .filter((record) => record.score > 0.05)
    .sort((a, b) => b.score - a.score || b.createdAt - a.createdAt)
    .slice(0, limit);
}

function scoreSemanticMemorySalience(
  record: SemanticMemoryRecord,
  queryTerms: Set<string>,
  now: number,
) {
  const recordTerms = tokenizeSemanticRecord(record);
  const recencyScore = Math.exp(-Math.max(0, now - record.createdAt) / SEMANTIC_MEMORY_DECAY_WINDOW_MS);
  const usefulnessScore = ratioOfTerms(recordTerms, SALIENT_MEMORY_TERMS);
  const emotionalScore = ratioOfTerms(recordTerms, EMOTIONAL_MEMORY_TERMS);
  const repetitionScore = queryTerms.size > 0 ? jaccardSimilarity(queryTerms, recordTerms) : 0;
  return Math.max(
    0,
    Math.min(
      1,
      recencyScore * 0.38 + usefulnessScore * 0.28 + emotionalScore * 0.22 + repetitionScore * 0.12,
    ),
  );
}

function ratioOfTerms(terms: Set<string>, salientTerms: Set<string>) {
  if (terms.size === 0) {
    return 0;
  }
  let hits = 0;
  for (const term of terms) {
    if (salientTerms.has(term)) {
      hits += 1;
    }
  }
  return Math.min(1, hits / 3);
}

function enqueueSemanticMemoryWrite<T>(scopeKey: string, task: () => Promise<T>) {
  const key = scopeKey.trim() || 'default';
  const previous = semanticMemoryWriteQueues.get(key) ?? Promise.resolve();
  const queued = previous.catch(() => undefined).then(task);
  const queueTail = queued.then(
    () => undefined,
    () => undefined,
  );
  semanticMemoryWriteQueues.set(key, queueTail);
  void queued
    .finally(() => {
      if (semanticMemoryWriteQueues.get(key) === queueTail) {
        semanticMemoryWriteQueues.delete(key);
      }
    })
    .catch(() => undefined);
  return queued;
}

function cosineSimilarity(a: number[], b: number[]) {
  if (a.length !== b.length) {
    return 0;
  }
  const length = Math.min(a.length, b.length);
  if (length === 0) {
    return 0;
  }

  let dot = 0;
  let aMag = 0;
  let bMag = 0;
  for (let index = 0; index < length; index += 1) {
    const av = a[index] ?? 0;
    const bv = b[index] ?? 0;
    dot += av * bv;
    aMag += av * av;
    bMag += bv * bv;
  }

  if (aMag === 0 || bMag === 0) {
    return 0;
  }
  return dot / (Math.sqrt(aMag) * Math.sqrt(bMag));
}

function jaccardSimilarity(a: Set<string>, b: Set<string>) {
  if (a.size === 0 || b.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const term of a) {
    if (b.has(term)) {
      overlap += 1;
    }
  }

  return overlap / (a.size + b.size - overlap);
}

function tokenize(value: string) {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9_'-]+/g)
      .map((term) => term.trim())
      .filter((term) => term.length >= 3),
  );
}

function tokenizeSemanticRecord(record: SemanticMemoryRecord) {
  const key = `${record.id}:${hashText(record.text).toString(36)}`;
  const cached = semanticTokenCache.get(key);
  if (cached) {
    return cached;
  }

  const terms = tokenize(record.text);
  semanticTokenCache.set(key, terms);
  pruneMap(semanticTokenCache, MAX_TOKEN_CACHE_ENTRIES);
  return terms;
}

function setSemanticMemoryRecordCache(scopeKey: string, records: SemanticMemoryRecord[]) {
  semanticMemoryRecordCache.set(scopeKey, records);
  for (const key of semanticMemorySearchCache.keys()) {
    if (key.startsWith(`${scopeKey}:`)) {
      semanticMemorySearchCache.delete(key);
    }
  }
}

function createSemanticSearchSignature(
  records: SemanticMemoryRecord[],
  query: string,
  queryEmbedding: number[] | null,
  limit: number,
) {
  const embedding = normalizeEmbedding(queryEmbedding);
  const recordSignature = records
    .slice(0, 24)
    .map((record) => `${record.id}:${record.createdAt}:${record.embedding?.length ?? 0}`)
    .join('|');
  const embeddingSignature = embedding
    ? `${embedding.length}:${embedding.slice(0, 8).map((value) => value.toFixed(4)).join(',')}`
    : 'none';
  return `${limit}\n${query.trim().toLowerCase()}\n${embeddingSignature}\n${records.length}\n${recordSignature}`;
}

function normalizeScopeKey(scopeKey: string) {
  return scopeKey.trim() || 'default';
}

function pruneMap<K, V>(map: Map<K, V>, maxEntries: number) {
  while (map.size > maxEntries) {
    const first = map.keys().next().value;
    if (first === undefined) {
      return;
    }
    map.delete(first);
  }
}

function normalizeSemanticMemoryRecord(value: unknown): SemanticMemoryRecord | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const source = value as Partial<SemanticMemoryRecord>;
  const userText = normalizeSemanticMemoryText(source.userText, 1200);
  const assistantText = normalizeSemanticAssistantText(source.assistantText, 1200);
  const text =
    userText || assistantText
      ? buildSemanticMemoryTurnText(userText, assistantText, {
          id: String(source.personaId ?? 'unknown'),
          name: inferAssistantNameFromMemoryText(source.text) || 'assistant',
        } as PersonaProfile)
      : normalizeLegacySemanticMemoryText(source.text);
  if (!source.id || !source.scopeKey || !text.trim()) {
    return null;
  }

  return {
    id: String(source.id),
    createdAt:
      typeof source.createdAt === 'number' && Number.isFinite(source.createdAt)
        ? source.createdAt
        : Date.now(),
    personaId: String(source.personaId ?? 'unknown'),
    scopeKey: String(source.scopeKey),
    text: text.trim().slice(0, 2400),
    userText,
    assistantText,
    embedding: normalizeEmbedding(source.embedding),
  };
}

function normalizeSemanticMemoryText(value: unknown, maxLength: number) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizeLegacySemanticMemoryText(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return '';
  }
  return raw
    .split(/\r?\n/)
    .map((line) => {
      const colonIndex = line.indexOf(':');
      if (colonIndex <= 0) {
        return normalizeSemanticMemoryText(line, 2400);
      }
      const speaker = line.slice(0, colonIndex).trim();
      const content = line.slice(colonIndex + 1).trim();
      const normalizedContent =
        speaker.toLowerCase() === 'user'
          ? normalizeSemanticMemoryText(content, 1200)
          : normalizeSemanticAssistantText(content, 1200);
      return `${speaker}: ${normalizedContent}`;
    })
    .filter((line) => line.replace(/^[^:]+:\s*/, '').trim())
    .join('\n')
    .slice(0, 2400);
}

function stripAssistantMetadata(value: string) {
  return value
    .replace(/<yw-meta>[\s\S]*?<\/yw-meta>/gi, '')
    .replace(/<hidden block>[\s\S]*?<\/hidden block>/gi, '')
    .trim();
}

function parseAssistantStructuredText(value: string): Record<string, unknown> | null {
  const candidates = [value.trim(), stripAssistantMetadata(value).trim()];
  for (const candidate of candidates) {
    if (!candidate.startsWith('{') || !candidate.endsWith('}')) {
      continue;
    }
    try {
      const parsed = JSON.parse(candidate) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function inferAssistantNameFromMemoryText(value: unknown) {
  const raw = String(value ?? '');
  const lines = raw.split(/\r?\n/);
  const assistantLine = lines.find((line) => {
    const label = line.slice(0, line.indexOf(':')).trim().toLowerCase();
    return label && label !== 'user';
  });
  const colonIndex = assistantLine?.indexOf(':') ?? -1;
  return colonIndex > 0 ? assistantLine!.slice(0, colonIndex).trim() : '';
}

function normalizeEmbedding(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  const embedding = value
    .map((item) => (typeof item === 'number' && Number.isFinite(item) ? item : null))
    .filter((item): item is number => item !== null);
  return embedding.length > 0 ? embedding : null;
}

async function openSemanticMemoryDb(): Promise<IDBDatabase | null> {
  const indexedDb = getIndexedDb();
  if (!indexedDb) {
    return null;
  }

  return new Promise((resolve) => {
    const request = indexedDb.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.objectStoreNames.contains(SEMANTIC_STORE)
        ? request.transaction?.objectStore(SEMANTIC_STORE)
        : db.createObjectStore(SEMANTIC_STORE, { keyPath: 'id' });
      if (store && !store.indexNames.contains(SCOPE_INDEX)) {
        store.createIndex(SCOPE_INDEX, 'scopeKey', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      warnSemanticMemoryFailure(
        'IndexedDB semantic memory open failed; using fallback store.',
        request.error,
      );
      resolve(null);
    };
    request.onblocked = () => {
      warnSemanticMemoryFailure('IndexedDB semantic memory open is blocked by another tab.');
      resolve(null);
    };
  });
}

function getIndexedDb() {
  if (typeof indexedDB !== 'undefined') {
    return indexedDB;
  }
  if (typeof window !== 'undefined') {
    return window.indexedDB ?? null;
  }
  return null;
}

function loadSemanticMemoryFromIndexedDb(db: IDBDatabase, scopeKey: string) {
  return new Promise<SemanticMemoryRecord[]>((resolve, reject) => {
    const tx = db.transaction(SEMANTIC_STORE, 'readonly');
    const store = tx.objectStore(SEMANTIC_STORE);
    const index = store.index(SCOPE_INDEX);
    const request = index.openCursor(IDBKeyRange.only(scopeKey));
    const records: SemanticMemoryRecord[] = [];

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        return;
      }
      const record = normalizeSemanticMemoryRecord(cursor.value);
      if (record) {
        records.push(record);
      }
      cursor.continue();
    };
    tx.oncomplete = () => {
      resolve(sortSemanticMemoryRecords(records).slice(0, MAX_RECORDS_PER_SCOPE));
    };
    tx.onerror = () => reject(tx.error ?? new Error('Semantic memory IndexedDB load failed.'));
    tx.onabort = () => reject(tx.error ?? new Error('Semantic memory IndexedDB load aborted.'));
  });
}

function saveSemanticMemoryToIndexedDb(
  db: IDBDatabase,
  scopeKey: string,
  records: SemanticMemoryRecord[],
) {
  const normalized = normalizeSemanticMemoryRecords(records, MAX_RECORDS_PER_SCOPE);
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SEMANTIC_STORE, 'readwrite');
    const store = tx.objectStore(SEMANTIC_STORE);
    const index = store.index(SCOPE_INDEX);
    const request = index.openCursor(IDBKeyRange.only(scopeKey));

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
        return;
      }

      for (const record of normalized) {
        store.put(record);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Semantic memory IndexedDB save failed.'));
    tx.onabort = () => reject(tx.error ?? new Error('Semantic memory IndexedDB save aborted.'));
  });
}

function warnSemanticMemoryFailure(message: string, error?: unknown) {
  if (typeof console === 'undefined') {
    return;
  }
  if (error) {
    console.warn(`[semantic-memory] ${message}`, error);
  } else {
    console.warn(`[semantic-memory] ${message}`);
  }
}

function loadLegacySemanticMemory(scopeKey: string): SemanticMemoryRecord[] {
  const storage = getLocalStorage();
  if (!storage) {
    return [];
  }

  try {
    const parsed = JSON.parse(storage.getItem(getLegacyStorageKey(scopeKey)) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return normalizeSemanticMemoryRecords(parsed, LEGACY_MAX_RECORDS_PER_SCOPE);
  } catch {
    return [];
  }
}

function saveLegacySemanticMemory(scopeKey: string, records: SemanticMemoryRecord[]) {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }

  storage.setItem(
    getLegacyStorageKey(scopeKey),
    JSON.stringify(normalizeSemanticMemoryRecords(records, LEGACY_MAX_RECORDS_PER_SCOPE)),
  );
}

function deleteLegacySemanticMemory(scopeKey: string) {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }

  storage.removeItem(getLegacyStorageKey(scopeKey));
}

function normalizeSemanticMemoryRecords(records: unknown[], limit: number) {
  return sortSemanticMemoryRecords(
    records
      .map(normalizeSemanticMemoryRecord)
      .filter((record): record is SemanticMemoryRecord => Boolean(record)),
  ).slice(0, limit);
}

function sortSemanticMemoryRecords(records: SemanticMemoryRecord[]) {
  return [...records].sort((a, b) => b.createdAt - a.createdAt);
}

function getLegacyStorageKey(scopeKey: string) {
  return `${LEGACY_MEMORY_KEY_PREFIX}${scopeKey.replace(/[^a-z0-9:_-]+/gi, '-').slice(0, 160)}`;
}

function getLocalStorage() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function hashText(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index++) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return hash >>> 0;
}
