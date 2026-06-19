import { getDesktopBackendUrl } from '../desktop/runtime';
import type { GrilloMemoryState } from './grillo-memory';
import type { SemanticMemoryRecord } from './semantic-memory';
import type { RelationshipMemory } from './types';
import type { LadybugMemoryGraphSummary } from '../../shared/ladybugMemoryTypes';
export type { LadybugMemoryGraphSummary } from '../../shared/ladybugMemoryTypes';

export type LadybugMemoryStatus = {
  backend: string;
  candidates?: number;
  dbDir?: string;
  diaryEntries?: number;
  emotionIntensities?: number;
  emotionStates?: number;
  grilloActivities?: number;
  grilloScopes?: number;
  memoryBlocks?: number;
  memorySlotPatches?: number;
  memorySlots?: number;
  participants?: number;
  personas?: number;
  relationshipFacts?: number;
  relationshipProfiles?: number;
  relationshipEdges?: number;
  scopes?: number;
  ok?: boolean;
  semanticRecords?: number;
  semanticScopes?: number;
  semanticVectors?: number;
  snapshots?: number;
  turnEvents?: number;
  workerContextTraces?: number;
};

export type LadybugGrilloTurnPairInput = {
  assistantName?: string;
  assistantText?: string;
  authorName?: string;
  channelId?: string;
  createdAt?: number;
  interfacePath?: string;
  participantKey?: string;
  scopeKey: string;
  source?: string;
  userText?: string;
};

export type LadybugGrilloContextPacket = {
  background_information: string[];
  channel_history: string[];
  generatedAt: number;
  output_description: string[];
  recalled_memories: Array<{ score?: number; text: string }>;
  relationship_memory: string[];
  scopeKey: string;
  thoughts: string[];
};

export type LadybugGrilloRuntimeStatus = {
  enabled: boolean;
  intervalMs: number;
  lastBeatType?: string;
  lastNoOpReason: string;
  lastTickAt: number;
  lastTickDurationMs: number;
  lastTickId: string;
  lastTickReason: string;
  lastToolCalls?: number;
  running: boolean;
  started: boolean;
  startedAt: number;
};

type LadybugGrilloTickResult = {
  beatType?: string;
  durationMs: number;
  noOpReason: string;
  ok: boolean;
  reason: string;
  running: boolean;
  scopeKey: string;
  tickId: string;
  writes: number;
};

type LadybugResponse<T> = T & {
  backend?: string;
  error?: string;
  ok?: boolean;
};

export async function loadLadybugGrilloState(scopeKey: string) {
  const response = await requestLadybugMemory<{
    scopeKey: string;
    state: unknown;
  }>(`/memory/grillo?scopeKey=${encodeURIComponent(scopeKey)}`);
  if (!response || response.ok !== true) {
    return undefined;
  }
  return response.state as GrilloMemoryState | null;
}

export async function saveLadybugGrilloState(scopeKey: string, state: GrilloMemoryState) {
  const response = await requestLadybugMemory('/memory/grillo', {
    body: JSON.stringify({ scopeKey, state }),
    headers: { 'Content-Type': 'application/json' },
    method: 'PUT',
  });
  return response?.ok === true;
}

export async function deleteLadybugGrilloState(scopeKey: string) {
  const response = await requestLadybugMemory(
    `/memory/grillo?scopeKey=${encodeURIComponent(scopeKey)}`,
    { method: 'DELETE' },
  );
  return response?.ok === true;
}

export async function saveLadybugGrilloTurnPair(input: LadybugGrilloTurnPairInput) {
  const response = await requestLadybugMemory<{
    scopeKey: string;
    turnIds: string[];
    writes: number;
  }>('/memory/grillo/turn', {
    body: JSON.stringify(input),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
  return response?.ok === true;
}

export async function loadLadybugGrilloContextPacket(
  scopeKey: string,
  options: { participantKeys?: string[]; query?: string } = {},
) {
  const params = new URLSearchParams({ scopeKey });
  if (options.query?.trim()) {
    params.set('query', options.query.trim());
  }
  for (const participantKey of options.participantKeys ?? []) {
    if (participantKey.trim()) {
      params.append('participantKey', participantKey.trim());
    }
  }
  const response = await requestLadybugMemory<{ packet: LadybugGrilloContextPacket }>(
    `/memory/grillo/context?${params.toString()}`,
  );
  return response?.ok === true ? response.packet : null;
}

export async function loadLadybugGrilloRuntimeStatus() {
  const response = await requestLadybugMemory<{ runtime: LadybugGrilloRuntimeStatus }>(
    '/memory/grillo/runtime',
  );
  return response?.ok === true ? response.runtime : null;
}

export async function updateLadybugGrilloRuntime(options: {
  enabled: boolean;
  intervalMs?: number;
}) {
  const response = await requestLadybugMemory<{ runtime: LadybugGrilloRuntimeStatus }>(
    '/memory/grillo/runtime',
    {
      body: JSON.stringify(options),
      headers: { 'Content-Type': 'application/json' },
      method: 'PUT',
    },
  );
  return response?.ok === true ? response.runtime : null;
}

export async function runLadybugGrilloTick(
  options: {
    beatType?:
      | 'extraction'
      | 'reflection'
      | 'relationship'
      | 'consolidation'
      | 'compaction'
      | 'curiosity'
      | 'tag_elaboration'
      | 'semantic_indexing';
    embeddingMode?: string;
    embeddingModel?: string;
    llmProvider?: string;
    maxToolRounds?: number;
    model?: string;
    reason?: string;
    scopeKey: string;
  },
  init?: Pick<RequestInit, 'headers'>,
) {
  const headers = {
    'Content-Type': 'application/json',
    ...(init?.headers instanceof Headers
      ? Object.fromEntries(init.headers.entries())
      : (init?.headers as Record<string, string> | undefined)),
  };
  const response = await requestLadybugMemory<{ result: LadybugGrilloTickResult }>(
    '/memory/grillo/run/tick',
    {
      body: JSON.stringify(options),
      headers,
      method: 'POST',
    },
  );
  if (response?.ok === false) {
    throw new Error(response.error || 'Backend GRILLO tick failed.');
  }
  return response?.ok === true ? response.result : null;
}

export async function loadLadybugSemanticMemory(scopeKey: string) {
  const response = await requestLadybugMemory<{
    records: unknown;
    scopeKey: string;
  }>(`/memory/semantic?scopeKey=${encodeURIComponent(scopeKey)}`);
  if (!response || response.ok !== true || !Array.isArray(response.records)) {
    return undefined;
  }
  return response.records as SemanticMemoryRecord[];
}

export async function saveLadybugSemanticMemory(
  scopeKey: string,
  records: SemanticMemoryRecord[],
) {
  const response = await requestLadybugMemory('/memory/semantic', {
    body: JSON.stringify({ scopeKey, records }),
    headers: { 'Content-Type': 'application/json' },
    method: 'PUT',
  });
  return response?.ok === true;
}

export async function deleteLadybugSemanticMemory(scopeKey: string) {
  const response = await requestLadybugMemory(
    `/memory/semantic?scopeKey=${encodeURIComponent(scopeKey)}`,
    { method: 'DELETE' },
  );
  return response?.ok === true;
}

export async function searchLadybugSemanticMemory(
  scopeKey: string,
  embedding: number[] | null,
  limit: number,
) {
  if (!embedding?.length) {
    return undefined;
  }
  const response = await requestLadybugMemory<{
    matches: unknown;
    scopeKey: string;
  }>('/memory/semantic/search', {
    body: JSON.stringify({ scopeKey, embedding, limit }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
  if (!response || response.ok !== true || !Array.isArray(response.matches)) {
    return undefined;
  }
  return response.matches as Array<SemanticMemoryRecord & { distance: number; score: number }>;
}

export async function loadLadybugRelationshipMemories() {
  const response = await requestLadybugMemory<{
    profiles: unknown;
  }>('/memory/relationships');
  if (!response || response.ok !== true || !response.profiles || typeof response.profiles !== 'object') {
    return undefined;
  }
  return response.profiles as Record<string, RelationshipMemory>;
}

export async function saveLadybugRelationshipMemories(
  profiles: Record<string, RelationshipMemory>,
) {
  const response = await requestLadybugMemory('/memory/relationships', {
    body: JSON.stringify({ profiles }),
    headers: { 'Content-Type': 'application/json' },
    method: 'PUT',
  });
  return response?.ok === true;
}

export async function deleteLadybugRelationshipMemory(scopeKey: string) {
  const response = await requestLadybugMemory(
    `/memory/relationships?scopeKey=${encodeURIComponent(scopeKey)}`,
    { method: 'DELETE' },
  );
  return response?.ok === true;
}

export async function loadLadybugMemoryStatus() {
  return requestLadybugMemory<LadybugMemoryStatus>('/memory/status');
}

export async function loadLadybugMemoryGraph() {
  const response = await requestLadybugMemory<{ graph: LadybugMemoryGraphSummary }>(
    '/memory/graph',
  );
  return response?.ok === true ? response.graph : null;
}

async function requestLadybugMemory<T>(
  path: string,
  init?: RequestInit,
): Promise<LadybugResponse<T> | null> {
  const url = getLadybugMemoryBackendUrl(path);
  if (!url) {
    return null;
  }

  const retryable = shouldRetryLadybugMemoryRequest(init);
  const attempts = retryable ? 2 : 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, init);
      if (!response.ok && response.status >= 500 && retryable && attempt + 1 < attempts) {
        await delayLadybugMemoryRetry();
        continue;
      }
      return (await response.json()) as LadybugResponse<T>;
    } catch {
      if (!retryable || attempt + 1 >= attempts) {
        return null;
      }
      await delayLadybugMemoryRetry();
    }
  }

  return null;
}

function shouldRetryLadybugMemoryRequest(init?: RequestInit) {
  const method = (init?.method ?? 'GET').toUpperCase();
  return method === 'GET' || method === 'PUT' || method === 'DELETE';
}

function delayLadybugMemoryRetry() {
  return new Promise((resolve) => globalThis.setTimeout(resolve, 250));
}

function getLadybugMemoryBackendUrl(path: string) {
  const desktopUrl = getDesktopBackendUrl(path);
  if (desktopUrl) {
    return desktopUrl;
  }

  const explicitUrl = (import.meta.env['VITE_MEMORY_BACKEND_URL'] || '').trim();
  if (explicitUrl) {
    return new URL(path, explicitUrl).toString();
  }

  if (typeof window !== 'undefined' && window.location) {
    return new URL(`/api${path}`, window.location.href).toString();
  }

  const port = (import.meta.env['VITE_BOT_PORT'] || '8797').trim() || '8797';
  return `http://127.0.0.1:${port}${path}`;
}
