import type { ChatTurn } from './chat-turn';
import type { PersonaProfile } from './types';
import type { GrilloScoredItem } from './grillo-context';
import {
  canonicalEmotionName,
  emptyEmotionIntensities,
  type CanonicalEmotion,
  type EmotionIntensities,
  type EmotionSignal,
} from '../grillo/emotion-state';
import {
  evaluatePromotion,
  type MemoryBlock as GrilloCoreMemoryBlock,
  type PromotionCandidate,
} from '../grillo/memory-promotion';
import {
  deleteLadybugGrilloState,
  loadLadybugGrilloState,
  saveLadybugGrilloState,
  type LadybugGrilloContextPacket,
} from './ladybug-memory-client';

export type GrilloCandidateType =
  | 'preference'
  | 'fact'
  | 'goal'
  | 'boundary'
  | 'bond_signal'
  | 'thread';

export type GrilloBlockName =
  | 'preferences'
  | 'boundaries'
  | 'relationship_state'
  | 'ongoing_topics'
  | 'verified_facts'
  | 'open_threads';

export type GrilloMemoryCandidate = {
  candidateId: string;
  confidence: number;
  content: string;
  createdAt: number;
  participantKey: string;
  scopeKey: string;
  source: ChatTurn['source'];
  sourceTurnIds: string[];
  summary: string;
  type: GrilloCandidateType;
};

export type GrilloMemoryBlock = {
  blockId: string;
  blockName: GrilloBlockName;
  createdAt: number;
  items: string[];
  participantKey: string;
  scopeKey: string;
  sourceCandidateIds: string[];
  updatedAt: number;
};

export type GrilloDiaryEntry = {
  beatType: string;
  content?: string;
  contextTags?: string[];
  createdAt: number;
  diaryId: string;
  emotions?: Array<{ intensity: number; name: string }>;
  interactionSummary?: string;
  involvedUsers?: string[];
  participantKey: string;
  personalThought: string;
  scopeKey: string;
  sourceTurnIds: string[];
  summary: string;
  tags: string[];
  userMessage?: string;
};

export type GrilloMemoryState = {
  blocks: GrilloMemoryBlock[];
  candidates: GrilloMemoryCandidate[];
  diaryEntries: GrilloDiaryEntry[];
  emotionState: GrilloEmotionState;
  promotedCandidateIds: string[];
  scopeKey: string;
  updatedAt: number;
  version: 1;
};

export type GrilloEmotionState = {
  intensities: EmotionIntensities;
  lastSignalAt?: number;
  lastSignalSource?: string;
  updatedAt: number;
};

export type GrilloMemoryPromptAdditions = {
  contextPacket?: LadybugGrilloContextPacket | null;
  diaryThoughts: string[];
  recalledMemories: GrilloScoredItem[];
  relationshipMemory: string[];
};

type RecordGrilloMemoryTurnOptions = {
  assistantText: string;
  now?: number;
  persona: PersonaProfile | null;
  scopeKey: string;
  turns: ChatTurn[];
};

type BuildGrilloMemoryPromptOptions = {
  limit?: number;
  participantKeys?: string[];
  query: string;
  scopeKey: string;
};

type PromotionPolicy = {
  confidenceThreshold: number;
  maxBlockItems: number;
  minCandidatesForPromotion: number;
};

const STORAGE_KEY_PREFIX = 'yourwifey:grillo-memory:v1:';
const GRILLO_DB_NAME = 'yourwifey-grillo-memory';
const GRILLO_DB_VERSION = 1;
const GRILLO_STORE = 'grilloStates';
const MAX_CANDIDATES = 120;
const MAX_BLOCKS = 80;
const MAX_DIARY = 40;
const grilloMemoryCache = new Map<string, GrilloMemoryState>();
const grilloMemoryWriteQueues = new Map<string, Promise<void>>();
const DEFAULT_PROMOTION_POLICY: PromotionPolicy = {
  confidenceThreshold: 0.75,
  maxBlockItems: 20,
  minCandidatesForPromotion: 2,
};
const OPPOSITE_EMOTIONS: Partial<Record<CanonicalEmotion, CanonicalEmotion>> = {
  angry: 'relaxed',
  fear: 'neutral',
  happy: 'sad',
  neutral: 'fear',
  relaxed: 'angry',
  sad: 'happy',
};

export function getGrilloParticipantKey(turn: ChatTurn) {
  return `${turn.source}:${turn.channel || 'local'}:${turn.login || 'unknown'}`
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, '-')
    .slice(0, 160);
}

export function createDefaultGrilloMemoryState(scopeKey: string): GrilloMemoryState {
  return {
    blocks: [],
    candidates: [],
    diaryEntries: [],
    emotionState: createDefaultGrilloEmotionState(),
    promotedCandidateIds: [],
    scopeKey,
    updatedAt: Date.now(),
    version: 1,
  };
}

export function loadGrilloMemoryState(scopeKey: string): GrilloMemoryState {
  const key = normalizeScopeStorageKey(scopeKey);
  const cached = grilloMemoryCache.get(key);
  if (cached) {
    return cached;
  }

  if (getIndexedDb()) {
    const state = createDefaultGrilloMemoryState(scopeKey);
    grilloMemoryCache.set(key, state);
    return state;
  }

  const state = loadLegacyGrilloMemoryState(scopeKey);
  grilloMemoryCache.set(key, state);
  return state;
}

export async function hydrateGrilloMemoryState(scopeKey: string): Promise<GrilloMemoryState> {
  const key = normalizeScopeStorageKey(scopeKey);
  const remoteState = await loadLadybugGrilloState(scopeKey);
  if (remoteState) {
    const normalizedRemoteState = normalizeGrilloMemoryState(scopeKey, remoteState);
    grilloMemoryCache.set(key, normalizedRemoteState);
    return normalizedRemoteState;
  }

  const db = await openGrilloMemoryDb();
  if (!db) {
    const state = loadLegacyGrilloMemoryState(scopeKey);
    grilloMemoryCache.set(key, state);
    return state;
  }

  const indexedDbState = await loadGrilloMemoryStateFromIndexedDb(db, scopeKey).catch(() => null);
  if (indexedDbState) {
    grilloMemoryCache.set(key, indexedDbState);
    return indexedDbState;
  }

  const legacyState = loadLegacyGrilloMemoryState(scopeKey);
  grilloMemoryCache.set(key, legacyState);
  if (
    legacyState.blocks.length > 0 ||
    legacyState.candidates.length > 0 ||
    legacyState.diaryEntries.length > 0 ||
    legacyState.promotedCandidateIds.length > 0 ||
    hasEmotionStateSignals(legacyState.emotionState)
  ) {
    await saveGrilloMemoryStateToIndexedDb(db, legacyState).catch(() => {});
  }
  return legacyState;
}

export function saveGrilloMemoryState(state: GrilloMemoryState) {
  const key = normalizeScopeStorageKey(state.scopeKey);
  const nextState = mergeCachedGrilloMemoryState(state);
  grilloMemoryCache.set(key, nextState);
  void enqueueGrilloMemoryWrite(state.scopeKey, () => persistGrilloMemoryState(nextState));
}

export async function saveGrilloMemoryStateAsync(state: GrilloMemoryState) {
  const key = normalizeScopeStorageKey(state.scopeKey);
  const nextState = mergeCachedGrilloMemoryState(state);
  grilloMemoryCache.set(key, nextState);
  await enqueueGrilloMemoryWrite(state.scopeKey, () => persistGrilloMemoryState(nextState));
  return nextState;
}

export function clearGrilloMemoryState(scopeKey: string) {
  const state = createDefaultGrilloMemoryState(scopeKey);
  grilloMemoryCache.set(normalizeScopeStorageKey(scopeKey), state);
  void enqueueGrilloMemoryWrite(scopeKey, () => deletePersistedGrilloMemoryState(scopeKey));
  return state;
}

export async function clearGrilloMemoryStateAsync(scopeKey: string) {
  const state = createDefaultGrilloMemoryState(scopeKey);
  grilloMemoryCache.set(normalizeScopeStorageKey(scopeKey), state);
  await enqueueGrilloMemoryWrite(scopeKey, () => deletePersistedGrilloMemoryState(scopeKey));
  return state;
}

export function recordGrilloMemoryTurn({
  now = Date.now(),
  scopeKey,
  turns,
}: RecordGrilloMemoryTurnOptions): GrilloMemoryState {
  const state = loadGrilloMemoryState(scopeKey);
  const promoted = recordGrilloMemoryTurnInState(state, { now, scopeKey, turns });
  saveGrilloMemoryState(promoted);
  return promoted;
}

export async function recordGrilloMemoryTurnAsync({
  now = Date.now(),
  scopeKey,
  turns,
}: RecordGrilloMemoryTurnOptions): Promise<GrilloMemoryState> {
  const state = await hydrateGrilloMemoryState(scopeKey);
  const promoted = recordGrilloMemoryTurnInState(state, { now, scopeKey, turns });
  return saveGrilloMemoryStateAsync(promoted);
}

function recordGrilloMemoryTurnInState(
  state: GrilloMemoryState,
  {
    now,
    scopeKey,
    turns,
  }: {
    now: number;
    scopeKey: string;
    turns: ChatTurn[];
  },
) {
  const candidates = turns.flatMap((turn) => extractCandidatesFromTurn(turn, scopeKey, now));
  const nextState = compactState({
    ...state,
    candidates: [...state.candidates, ...candidates],
    updatedAt: now,
  });
  const promoted = promoteGrilloCandidates(nextState);
  return promoted;
}

export function applyGrilloEmotionSignals(
  state: GrilloMemoryState,
  signals: EmotionSignal[],
  source: string,
  now = Date.now(),
): GrilloMemoryState {
  if (!Array.isArray(signals) || signals.length === 0) {
    return state;
  }

  let emotionState = decayGrilloEmotionState(state.emotionState, now);
  const intensities = { ...emotionState.intensities };
  let wroteSignal = false;

  for (const signal of signals) {
    const canonical = canonicalEmotionName(signal.name);
    const confidence = clamp01(Number(signal.confidence ?? 1));
    const signalIntensity = clampNumber(Number(signal.intensity ?? 0), 0, 10);
    if (signalIntensity <= 0) {
      continue;
    }

    const blend = 0.45 + confidence * 0.35;
    const previous = intensities[canonical] ?? 0;
    intensities[canonical] = clampNumber(
      previous * (1 - blend) + signalIntensity * blend,
      0,
      10,
    );

    const opposite = OPPOSITE_EMOTIONS[canonical];
    if (opposite) {
      intensities[opposite] = clampNumber(
        (intensities[opposite] ?? 0) - signalIntensity * 0.25 * confidence,
        0,
        10,
      );
    }
    wroteSignal = true;
  }

  if (!wroteSignal) {
    return state;
  }

  emotionState = {
    intensities,
    lastSignalAt: now,
    lastSignalSource: source || 'unknown',
    updatedAt: now,
  };

  return {
    ...state,
    emotionState,
    updatedAt: Math.max(state.updatedAt, now),
  };
}

export function buildGrilloMemoryPromptAdditions({
  limit = 6,
  participantKeys = [],
  query,
  scopeKey,
}: BuildGrilloMemoryPromptOptions): GrilloMemoryPromptAdditions {
  const state = loadGrilloMemoryState(scopeKey);
  const participantSet = new Set(participantKeys.map((key) => key.toLowerCase()));
  const includeParticipant = (participantKey: string) =>
    participantSet.size === 0 || participantSet.has(participantKey.toLowerCase());

  const relationshipMemory = state.blocks
    .filter((block) => includeParticipant(block.participantKey))
    .slice(-12)
    .flatMap((block) =>
      block.items.map((item) => `[${block.participantKey} ${block.blockName}] ${item}`),
    )
    .slice(-limit);

  const recalledMemories = scoreRecallItems(
    [
      ...state.candidates
        .filter((candidate) => includeParticipant(candidate.participantKey))
        .map((candidate) => ({
          createdAt: candidate.createdAt,
          id: candidate.candidateId,
          text: `[candidate:${candidate.type} ${candidate.participantKey}] ${candidate.summary}`,
        })),
      ...state.blocks
        .filter((block) => includeParticipant(block.participantKey))
        .flatMap((block) =>
          block.items.map((item) => ({
            createdAt: block.updatedAt,
            id: block.blockId,
            text: `[block:${block.blockName} ${block.participantKey}] ${item}`,
          })),
        ),
      ...state.diaryEntries
        .filter((entry) => includeParticipant(entry.participantKey))
        .map((entry) => ({
          createdAt: entry.createdAt,
          id: entry.diaryId,
          text: formatDiaryRecall(entry),
        })),
    ],
    query,
  ).slice(0, limit);

  const diaryThoughts = state.diaryEntries
    .filter((entry) => includeParticipant(entry.participantKey))
    .slice(-4)
    .map((entry) => formatDiaryThought(entry));
  const emotionState = formatEmotionState(state.emotionState);

  return {
    diaryThoughts: emotionState ? [...diaryThoughts, emotionState] : diaryThoughts,
    recalledMemories,
    relationshipMemory,
  };
}

export async function buildGrilloMemoryPromptAdditionsAsync(
  options: BuildGrilloMemoryPromptOptions,
): Promise<GrilloMemoryPromptAdditions> {
  await hydrateGrilloMemoryState(options.scopeKey);
  return buildGrilloMemoryPromptAdditions(options);
}

export function promoteGrilloCandidates(
  state: GrilloMemoryState,
  policy: PromotionPolicy = DEFAULT_PROMOTION_POLICY,
): GrilloMemoryState {
  const promotedIds = new Set(state.promotedCandidateIds);
  const evaluation = evaluatePromotion(
    state.candidates.map(toCorePromotionCandidate),
    state.blocks.map(toCoreMemoryBlock),
    promotedIds,
    {
      confidenceThreshold: policy.confidenceThreshold,
      maxBlockItems: policy.maxBlockItems,
      minCandidatesForPromotion: policy.minCandidatesForPromotion,
    },
  );
  const blocks = [...state.blocks];
  const now = Date.now();

  for (const result of evaluation.results) {
    const block = fromCoreMemoryBlock(result.block, state.scopeKey, now);
    const existingIndex = blocks.findIndex((item) => item.blockId === block.blockId);
    if (existingIndex >= 0) {
      blocks[existingIndex] = block;
      continue;
    }
    blocks.push(block);
  }

  return compactState({
    ...state,
    blocks,
    promotedCandidateIds: dedupe([
      ...state.promotedCandidateIds,
      ...evaluation.consumedCandidateIds,
    ]),
    updatedAt: now,
  });
}

function toCorePromotionCandidate(candidate: GrilloMemoryCandidate): PromotionCandidate {
  return {
    candidate_id: candidate.candidateId,
    confidence: candidate.confidence,
    content: candidate.content,
    created_at: new Date(candidate.createdAt).toISOString(),
    summary: candidate.summary,
    type: candidate.type,
    user_id: candidate.participantKey,
  };
}

function toCoreMemoryBlock(block: GrilloMemoryBlock): GrilloCoreMemoryBlock {
  return {
    block_id: block.blockId,
    block_name: block.blockName,
    created_at: new Date(block.createdAt).toISOString(),
    items: block.items,
    operation: 'upsert',
    reason: 'existing Web Waifu 4 memory block',
    schema_version: '1.0.0',
    source_candidate_ids: block.sourceCandidateIds,
    user_id: block.participantKey,
  };
}

function fromCoreMemoryBlock(
  block: GrilloCoreMemoryBlock,
  scopeKey: string,
  fallbackNow: number,
): GrilloMemoryBlock {
  const createdAt = Date.parse(block.created_at);
  return {
    blockId: block.block_id,
    blockName: normalizeCoreBlockName(block.block_name),
    createdAt: Number.isFinite(createdAt) ? createdAt : fallbackNow,
    items: block.items,
    participantKey: block.user_id,
    scopeKey,
    sourceCandidateIds: block.source_candidate_ids,
    updatedAt: fallbackNow,
  };
}

function normalizeCoreBlockName(blockName: GrilloCoreMemoryBlock['block_name']): GrilloBlockName {
  if (blockName === 'preferences') return 'preferences';
  if (blockName === 'boundaries') return 'boundaries';
  if (blockName === 'relationship_state') return 'relationship_state';
  if (blockName === 'verified_facts') return 'verified_facts';
  if (blockName === 'open_threads') return 'open_threads';
  return 'ongoing_topics';
}

function extractCandidatesFromTurn(turn: ChatTurn, scopeKey: string, now: number) {
  const text = turn.text.replace(/\s+/g, ' ').trim();
  const participantKey = getGrilloParticipantKey(turn);
  const base = {
    createdAt: now,
    participantKey,
    scopeKey,
    source: turn.source,
    sourceTurnIds: [turn.id],
  };
  const candidates: GrilloMemoryCandidate[] = [];

  const pushCandidate = (
    type: GrilloCandidateType,
    summary: string,
    confidence: number,
    content = text,
  ) => {
    const normalizedSummary = summary.replace(/\s+/g, ' ').trim().slice(0, 260);
    if (normalizedSummary.length < 4) {
      return;
    }
    candidates.push({
      ...base,
      candidateId: `${turn.id}:${type}:${hashText(normalizedSummary).toString(36)}`,
      confidence,
      content: content.slice(0, 600),
      summary: normalizedSummary,
      type,
    });
  };

  const rememberMatch = /\bremember\b[:\s-]*(.+)$/i.exec(text);
  if (rememberMatch?.[1]) {
    pushCandidate('fact', `${turn.displayName} asked me to remember: ${rememberMatch[1]}`, 0.95);
  }

  const preferenceMatch = /\bi (?:really )?(?:like|love|prefer|enjoy)\s+([^.!?]{2,140})/i.exec(
    text,
  );
  if (preferenceMatch?.[1]) {
    pushCandidate('preference', `${turn.displayName} likes ${preferenceMatch[1].trim()}`, 0.86);
  }

  const boundaryMatch =
    /\bi (?:hate|dislike|do not like|don't like|cant stand|can't stand)\s+([^.!?]{2,140})/i.exec(
      text,
    );
  if (boundaryMatch?.[1]) {
    pushCandidate('boundary', `${turn.displayName} dislikes ${boundaryMatch[1].trim()}`, 0.84);
  }

  const goalMatch =
    /\bi (?:want to|need to|am trying to|i'm trying to|plan to|gonna|going to)\s+([^.!?]{2,160})/i.exec(
      text,
    );
  if (goalMatch?.[1]) {
    pushCandidate('goal', `${turn.displayName} is trying to ${goalMatch[1].trim()}`, 0.8);
  }

  if (/\b(thanks|thank you|good job|you got it|that worked|love you)\b/i.test(text)) {
    pushCandidate('bond_signal', `${turn.displayName} gave positive relationship feedback`, 0.78);
  }

  if (
    text.length >= 36 &&
    /\b(project|stream|model|memory|animation|voice|twitch|chat)\b/i.test(text)
  ) {
    pushCandidate('thread', `${turn.displayName} discussed: ${text.slice(0, 180)}`, 0.74);
  }

  return candidates;
}

function scoreRecallItems(
  items: Array<{ createdAt: number; id: string; text: string }>,
  query: string,
): GrilloScoredItem[] {
  const queryTerms = tokenize(query);
  return items
    .map((item) => {
      const lexical = jaccardSimilarity(queryTerms, tokenize(item.text));
      const recency = Math.max(0, 1 - (Date.now() - item.createdAt) / (1000 * 60 * 60 * 24 * 30));
      return {
        text: item.text,
        score: lexical * 0.78 + recency * 0.18 + 0.04,
      };
    })
    .filter((item) => item.score > 0.05)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

function compactState(state: GrilloMemoryState): GrilloMemoryState {
  return {
    ...state,
    blocks: state.blocks.slice(-MAX_BLOCKS),
    candidates: state.candidates.slice(-MAX_CANDIDATES),
    diaryEntries: state.diaryEntries.filter(isReflectiveDiaryEntry).slice(-MAX_DIARY),
    emotionState: normalizeGrilloEmotionState(state.emotionState),
    promotedCandidateIds: state.promotedCandidateIds.slice(-MAX_CANDIDATES),
  };
}

function formatDiaryRecall(entry: GrilloDiaryEntry) {
  const emotionText = formatEmotions(entry.emotions);
  const tags = dedupe([...(entry.tags ?? []), ...(entry.contextTags ?? [])]);
  return [
    `[diary ${entry.participantKey}] ${entry.summary}`,
    entry.interactionSummary ? `interaction: ${entry.interactionSummary}` : '',
    entry.userMessage ? `speaker said: ${entry.userMessage}` : '',
    entry.personalThought ? `thought: ${entry.personalThought}` : '',
    emotionText ? `emotions: ${emotionText}` : '',
    tags.length ? `tags: ${tags.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join(' | ');
}

function formatDiaryThought(entry: GrilloDiaryEntry) {
  const emotionText = formatEmotions(entry.emotions);
  return [
    new Date(entry.createdAt).toISOString(),
    entry.personalThought,
    emotionText ? `(felt ${emotionText})` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function formatEmotions(emotions: GrilloDiaryEntry['emotions']) {
  if (!Array.isArray(emotions) || emotions.length === 0) {
    return '';
  }
  return emotions
    .map((emotion) => `${emotion.name}:${Math.round(emotion.intensity)}/10`)
    .join(', ');
}

function mergeGrilloMemoryStates(
  current: GrilloMemoryState,
  incoming: GrilloMemoryState,
): GrilloMemoryState {
  const blocksById = new Map<string, GrilloMemoryBlock>();
  [...current.blocks, ...incoming.blocks].forEach((block) => {
    const existing = blocksById.get(block.blockId);
    if (!existing) {
      blocksById.set(block.blockId, {
        ...block,
        items: [...block.items],
        sourceCandidateIds: [...block.sourceCandidateIds],
      });
      return;
    }
    blocksById.set(block.blockId, {
      ...existing,
      ...block,
      createdAt: Math.min(existing.createdAt, block.createdAt),
      items: dedupe([...existing.items, ...block.items]),
      sourceCandidateIds: dedupe([...existing.sourceCandidateIds, ...block.sourceCandidateIds]),
      updatedAt: Math.max(existing.updatedAt, block.updatedAt),
    });
  });

  return compactState({
    blocks: [...blocksById.values()].sort((left, right) => left.updatedAt - right.updatedAt),
    candidates: dedupeById(
      [...current.candidates, ...incoming.candidates],
      (candidate) => candidate.candidateId,
    ),
    diaryEntries: dedupeById(
      [...current.diaryEntries, ...incoming.diaryEntries],
      (entry) => entry.diaryId,
    ),
    emotionState:
      incoming.emotionState.updatedAt >= current.emotionState.updatedAt
        ? incoming.emotionState
        : current.emotionState,
    promotedCandidateIds: dedupe([
      ...current.promotedCandidateIds,
      ...incoming.promotedCandidateIds,
    ]),
    scopeKey: incoming.scopeKey,
    updatedAt: Math.max(current.updatedAt, incoming.updatedAt),
    version: 1,
  });
}

function dedupeById<T>(items: T[], getId: (item: T) => string) {
  const byId = new Map<string, T>();
  items.forEach((item) => {
    const id = getId(item);
    if (id) {
      byId.set(id, item);
    }
  });
  return [...byId.values()];
}

function normalizeGrilloMemoryState(scopeKey: string, value: unknown): GrilloMemoryState {
  if (!value || typeof value !== 'object') {
    return createDefaultGrilloMemoryState(scopeKey);
  }

  const source = value as Partial<GrilloMemoryState>;
  return compactState({
    blocks: Array.isArray(source.blocks)
      ? source.blocks.map(normalizeBlock).filter(isGrilloMemoryBlock)
      : [],
    candidates: Array.isArray(source.candidates)
      ? source.candidates.map(normalizeCandidate).filter(isGrilloMemoryCandidate)
      : [],
    diaryEntries: Array.isArray(source.diaryEntries)
      ? source.diaryEntries.map(normalizeDiaryEntry).filter(isGrilloDiaryEntry)
      : [],
    emotionState: normalizeGrilloEmotionState((source as { emotionState?: unknown }).emotionState),
    promotedCandidateIds: Array.isArray(source.promotedCandidateIds)
      ? source.promotedCandidateIds.map(String).filter(Boolean)
      : [],
    scopeKey,
    updatedAt:
      typeof source.updatedAt === 'number' && Number.isFinite(source.updatedAt)
        ? source.updatedAt
        : Date.now(),
    version: 1,
  });
}

function isGrilloMemoryCandidate(
  value: GrilloMemoryCandidate | null,
): value is GrilloMemoryCandidate {
  return Boolean(value);
}

function isGrilloMemoryBlock(value: GrilloMemoryBlock | null): value is GrilloMemoryBlock {
  return Boolean(value);
}

function isGrilloDiaryEntry(value: GrilloDiaryEntry | null): value is GrilloDiaryEntry {
  return Boolean(value);
}

function normalizeCandidate(value: unknown): GrilloMemoryCandidate | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const source = value as Partial<GrilloMemoryCandidate>;
  if (!source.candidateId || !source.scopeKey || !source.participantKey || !source.summary) {
    return null;
  }

  return {
    candidateId: String(source.candidateId),
    confidence: clamp01(Number(source.confidence ?? 0)),
    content: String(source.content ?? '').slice(0, 600),
    createdAt: normalizeTimestamp(source.createdAt),
    participantKey: String(source.participantKey),
    scopeKey: String(source.scopeKey),
    source: source.source === 'local' ? 'local' : 'twitch',
    sourceTurnIds: Array.isArray(source.sourceTurnIds)
      ? source.sourceTurnIds.map(String).filter(Boolean)
      : [],
    summary: String(source.summary).slice(0, 260),
    type: normalizeCandidateType(source.type),
  };
}

function normalizeBlock(value: unknown): GrilloMemoryBlock | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const source = value as Partial<GrilloMemoryBlock>;
  if (!source.blockId || !source.scopeKey || !source.participantKey || !source.blockName) {
    return null;
  }

  return {
    blockId: String(source.blockId),
    blockName: normalizeBlockName(source.blockName),
    createdAt: normalizeTimestamp(source.createdAt),
    items: Array.isArray(source.items) ? dedupe(source.items.map(String)).slice(0, 20) : [],
    participantKey: String(source.participantKey),
    scopeKey: String(source.scopeKey),
    sourceCandidateIds: Array.isArray(source.sourceCandidateIds)
      ? source.sourceCandidateIds.map(String).filter(Boolean)
      : [],
    updatedAt: normalizeTimestamp(source.updatedAt),
  };
}

function normalizeDiaryEntry(value: unknown): GrilloDiaryEntry | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const source = value as Partial<GrilloDiaryEntry> & Record<string, unknown>;
  const diaryId = source.diaryId ?? source['diary_id'];
  const participantKey = source.participantKey ?? source['participant_key'];
  const scopeKey = source.scopeKey ?? source['scope_key'];
  if (!diaryId || !scopeKey || !participantKey || !source.summary) {
    return null;
  }
  const beatType = String(source.beatType ?? source['beat_type'] ?? 'extraction')
    .replace(/\s+/g, '_')
    .trim()
    .slice(0, 80);

  const entry: GrilloDiaryEntry = {
    beatType: beatType || 'extraction',
    content: normalizeOptionalString(source.content, 600),
    contextTags: normalizeStringArray(source.contextTags ?? source['context_tags'], 12),
    createdAt: normalizeTimestamp(source.createdAt),
    diaryId: String(diaryId),
    emotions: normalizeDiaryEmotions(source.emotions),
    interactionSummary: normalizeOptionalString(
      source.interactionSummary ?? source['interaction_summary'],
      320,
    ),
    involvedUsers: normalizeStringArray(source.involvedUsers ?? source['involved_users'], 12),
    participantKey: String(participantKey),
    personalThought: String(source.personalThought ?? source['personal_thought'] ?? '').slice(
      0,
      320,
    ),
    scopeKey: String(scopeKey),
    sourceTurnIds: normalizeStringArray(source.sourceTurnIds ?? source['source_turn_ids'], 50),
    summary: String(source.summary).slice(0, 320),
    tags: normalizeStringArray(source.tags, 12),
    userMessage: normalizeOptionalString(source.userMessage ?? source['user_message'], 600),
  };

  return isReflectiveDiaryEntry(entry) ? entry : null;
}

function normalizeOptionalString(value: unknown, maxLength: number) {
  const normalized = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
  return normalized || undefined;
}

function normalizeStringArray(value: unknown, maxItems: number) {
  return Array.isArray(value) ? dedupe(value.map(String)).slice(0, maxItems) : [];
}

function normalizeDiaryEmotions(value: unknown): GrilloDiaryEntry['emotions'] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      const source = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
      const name = String(source['name'] ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 64);
      const intensity = clampNumber(Number(source['intensity'] ?? 0), 0, 10);
      return name ? { intensity, name } : null;
    })
    .filter((item): item is { intensity: number; name: string } => Boolean(item))
    .slice(0, 8);
}

function createDefaultGrilloEmotionState(): GrilloEmotionState {
  return {
    intensities: emptyEmotionIntensities(),
    updatedAt: 0,
  };
}

function normalizeGrilloEmotionState(value: unknown): GrilloEmotionState {
  if (!value || typeof value !== 'object') {
    return createDefaultGrilloEmotionState();
  }

  const source = value as Partial<GrilloEmotionState> & Record<string, unknown>;
  const rawIntensities =
    source.intensities && typeof source.intensities === 'object'
      ? (source.intensities as Partial<EmotionIntensities> & Record<string, unknown>)
      : {};
  const intensities = emptyEmotionIntensities();
  (Object.keys(intensities) as CanonicalEmotion[]).forEach((key) => {
    intensities[key] = clampNumber(Number(rawIntensities[key] ?? 0), 0, 10);
  });

  return {
    intensities,
    lastSignalAt: source.lastSignalAt ? normalizeTimestamp(source.lastSignalAt) : undefined,
    lastSignalSource: normalizeOptionalString(source.lastSignalSource, 160),
    updatedAt: source.updatedAt ? normalizeTimestamp(source.updatedAt) : 0,
  };
}

function decayGrilloEmotionState(
  state: GrilloEmotionState,
  now = Date.now(),
  decayTauMs = 60 * 60 * 1000,
  decayThreshold = 0.05,
): GrilloEmotionState {
  const normalized = normalizeGrilloEmotionState(state);
  const from = normalized.lastSignalAt ?? normalized.updatedAt ?? now;
  const elapsedMs = Math.max(0, now - from);
  const tau = Math.max(60_000, decayTauMs);
  const factor = Math.exp(-elapsedMs / tau);
  const intensities = emptyEmotionIntensities();
  (Object.keys(intensities) as CanonicalEmotion[]).forEach((key) => {
    const value = clampNumber((normalized.intensities[key] ?? 0) * factor, 0, 10);
    intensities[key] = value < decayThreshold ? 0 : value;
  });

  return {
    ...normalized,
    intensities,
    updatedAt: now,
  };
}

function hasEmotionStateSignals(state: GrilloEmotionState) {
  return Object.values(normalizeGrilloEmotionState(state).intensities).some(
    (value) => value > 0.05,
  );
}

function formatEmotionState(state: GrilloEmotionState) {
  const rows = Object.entries(normalizeGrilloEmotionState(state).intensities)
    .map(([name, intensity]) => ({
      intensity,
      name: canonicalEmotionName(name),
    }))
    .filter((row) => row.intensity > 0.1)
    .sort((left, right) => right.intensity - left.intensity)
    .slice(0, 4);

  if (rows.length === 0) {
    return '';
  }

  return `current_emotion_state: ${rows
    .map((row) => `${row.name}:${row.intensity.toFixed(1)}/10`)
    .join(', ')}`;
}

function isReflectiveDiaryEntry(entry: GrilloDiaryEntry) {
  const summary = entry.summary.replace(/\s+/g, ' ').trim().toLowerCase();
  const personalThought = entry.personalThought.replace(/\s+/g, ' ').trim().toLowerCase();
  return !(summary.startsWith('processed ') && personalThought.startsWith('i noticed '));
}

function normalizeCandidateType(value: unknown): GrilloCandidateType {
  const normalized = String(value ?? '').trim();
  if (
    normalized === 'preference' ||
    normalized === 'fact' ||
    normalized === 'goal' ||
    normalized === 'boundary' ||
    normalized === 'bond_signal' ||
    normalized === 'thread'
  ) {
    return normalized;
  }
  return 'thread';
}

function normalizeBlockName(value: unknown): GrilloBlockName {
  const normalized = String(value ?? '').trim();
  if (
    normalized === 'preferences' ||
    normalized === 'boundaries' ||
    normalized === 'relationship_state' ||
    normalized === 'ongoing_topics' ||
    normalized === 'verified_facts' ||
    normalized === 'open_threads'
  ) {
    return normalized;
  }
  return 'ongoing_topics';
}

function normalizeTimestamp(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : Date.now();
}

function storageKey(scopeKey: string) {
  return `${STORAGE_KEY_PREFIX}${scopeKey.replace(/[^a-z0-9:_-]+/gi, '-').slice(0, 180)}`;
}

function normalizeScopeStorageKey(scopeKey: string) {
  return scopeKey.replace(/[^a-z0-9:_-]+/gi, '-').slice(0, 180) || 'default';
}

function mergeCachedGrilloMemoryState(state: GrilloMemoryState) {
  const current =
    grilloMemoryCache.get(normalizeScopeStorageKey(state.scopeKey)) ??
    createDefaultGrilloMemoryState(state.scopeKey);
  return current.blocks.length > 0 ||
    current.candidates.length > 0 ||
    current.diaryEntries.length > 0 ||
    hasEmotionStateSignals(current.emotionState) ||
    current.promotedCandidateIds.length > 0
    ? mergeGrilloMemoryStates(current, state)
    : compactState(state);
}

function enqueueGrilloMemoryWrite(scopeKey: string, task: () => Promise<void>) {
  const key = normalizeScopeStorageKey(scopeKey);
  const previous = grilloMemoryWriteQueues.get(key) ?? Promise.resolve();
  const queued = previous.catch(() => undefined).then(task);
  grilloMemoryWriteQueues.set(key, queued);
  void queued.finally(() => {
    if (grilloMemoryWriteQueues.get(key) === queued) {
      grilloMemoryWriteQueues.delete(key);
    }
  });
  return queued;
}

async function persistGrilloMemoryState(state: GrilloMemoryState) {
  if (await saveLadybugGrilloState(state.scopeKey, compactState(state))) {
    return;
  }

  const db = await openGrilloMemoryDb();
  if (db) {
    await saveGrilloMemoryStateToIndexedDb(db, state);
    return;
  }
  saveLegacyGrilloMemoryState(state);
}

async function deletePersistedGrilloMemoryState(scopeKey: string) {
  await deleteLadybugGrilloState(scopeKey);

  const db = await openGrilloMemoryDb();
  if (db) {
    await deleteGrilloMemoryStateFromIndexedDb(db, scopeKey);
  }
  deleteLegacyGrilloMemoryState(scopeKey);
}

function loadLegacyGrilloMemoryState(scopeKey: string) {
  const storage = getLocalStorage();
  if (!storage) {
    return createDefaultGrilloMemoryState(scopeKey);
  }

  try {
    return normalizeGrilloMemoryState(
      scopeKey,
      JSON.parse(storage.getItem(storageKey(scopeKey)) ?? 'null'),
    );
  } catch {
    return createDefaultGrilloMemoryState(scopeKey);
  }
}

function saveLegacyGrilloMemoryState(state: GrilloMemoryState) {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }
  storage.setItem(storageKey(state.scopeKey), JSON.stringify(compactState(state)));
}

function deleteLegacyGrilloMemoryState(scopeKey: string) {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }
  storage.removeItem(storageKey(scopeKey));
}

function openGrilloMemoryDb(): Promise<IDBDatabase | null> {
  const indexedDb = getIndexedDb();
  if (!indexedDb) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const request = indexedDb.open(GRILLO_DB_NAME, GRILLO_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(GRILLO_STORE)) {
        db.createObjectStore(GRILLO_STORE, { keyPath: 'scopeKey' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

function loadGrilloMemoryStateFromIndexedDb(db: IDBDatabase, scopeKey: string) {
  return new Promise<GrilloMemoryState | null>((resolve, reject) => {
    const tx = db.transaction(GRILLO_STORE, 'readonly');
    const request = tx.objectStore(GRILLO_STORE).get(scopeKey);
    request.onsuccess = () => {
      resolve(request.result ? normalizeGrilloMemoryState(scopeKey, request.result) : null);
    };
    request.onerror = () => reject(request.error ?? new Error('Grillo memory IndexedDB load failed.'));
    tx.onabort = () => reject(tx.error ?? new Error('Grillo memory IndexedDB load aborted.'));
  });
}

function saveGrilloMemoryStateToIndexedDb(db: IDBDatabase, state: GrilloMemoryState) {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(GRILLO_STORE, 'readwrite');
    tx.objectStore(GRILLO_STORE).put(compactState(state));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Grillo memory IndexedDB save failed.'));
    tx.onabort = () => reject(tx.error ?? new Error('Grillo memory IndexedDB save aborted.'));
  });
}

function deleteGrilloMemoryStateFromIndexedDb(db: IDBDatabase, scopeKey: string) {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(GRILLO_STORE, 'readwrite');
    tx.objectStore(GRILLO_STORE).delete(scopeKey);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Grillo memory IndexedDB delete failed.'));
    tx.onabort = () => reject(tx.error ?? new Error('Grillo memory IndexedDB delete aborted.'));
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

function dedupe(values: string[]) {
  const seen = new Set<string>();
  const output: string[] = [];
  values.forEach((value) => {
    const normalized = value.replace(/\s+/g, ' ').trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      return;
    }
    seen.add(key);
    output.push(normalized);
  });
  return output;
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

function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

function hashText(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return hash >>> 0;
}
