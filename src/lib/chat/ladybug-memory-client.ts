import { getDesktopBackendUrl } from '../desktop/runtime';
import type { GrilloMemoryState } from './grillo-memory';
import type { SemanticMemoryRecord } from './semantic-memory';
import type { RelationshipMemory } from './types';

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

export type LadybugMemoryGraphSummary = {
  edges: Array<{ count: number; relation: string }>;
  participants: Array<{ channel: string; displayName: string; id: string; source: string }>;
  personas: Array<{ id: string; name: string }>;
  recent: {
    activities: Array<{
      beatType: string;
      createdAt: number;
      id: string;
      promptText: string;
      responseText: string;
      scopeKey: string;
    }>;
    blocks: Array<{
      blockName: string;
      id: string;
      itemCount: number;
      items: string[];
      participantKey: string;
      scopeKey: string;
    }>;
    candidates: Array<{ id: string; participantKey: string; summary: string; type: string }>;
    diary: Array<{ beatType: string; id: string; participantKey: string; summary: string }>;
    emotions: Array<{
      id: string;
      lastSignalSource: string;
      scopeKey: string;
      updatedAt: number;
    }>;
    emotionIntensities: Array<{
      emotionStateId: string;
      id: string;
      intensity: number;
      name: string;
      scopeKey: string;
      updatedAt: number;
    }>;
    relationships: Array<{
      id: string;
      mood: string;
      relationshipStage: string;
      scopeKey: string;
      summary: string;
    }>;
    relationshipFacts: Array<{ id: string; scopeKey: string; text: string }>;
    semantic: Array<{ id: string; personaId: string; text: string }>;
    slotPatches: Array<{
      createdAt: number;
      id: string;
      operation: string;
      participantKey: string;
      scopeKey: string;
      slotId: string;
      slotName: string;
    }>;
    slots: Array<{
      id: string;
      itemCount: number;
      items: string[];
      participantKey: string;
      slotName: string;
      scopeKey: string;
      updatedAt: number;
    }>;
    traces: Array<{
      beatType: string;
      createdAt: number;
      id: string;
      model: string;
      prompt: string;
      provider: string;
      scopeKey: string;
      systemPrompt: string;
      taskType: string;
    }>;
    turns: Array<{
      authorName: string;
      createdAt: number;
      id: string;
      role: string;
      scopeKey: string;
      text: string;
    }>;
    vectors: Array<{ id: string; personaId: string; text: string }>;
  };
  scopes: Array<{ channel: string; id: string; personaId: string; source: string }>;
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

export type LadybugGrilloTickResult = {
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

export function canUseLadybugMemoryBackend() {
  return Boolean(getLadybugMemoryBackendUrl('/memory/status'));
}

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
  try {
    const response = await fetch(url, init);
    return (await response.json()) as LadybugResponse<T>;
  } catch {
    return null;
  }
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
