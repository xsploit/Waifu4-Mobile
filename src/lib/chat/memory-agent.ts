import type { ChatMessage, PersonaProfile, RelationshipMemory } from './types';
import { DEFAULT_MEMORY_AGENT_MODEL } from './defaults';
import { isPremiumCostModelId } from './provider-defaults';

export const MEMORY_AGENT_INTERVAL_TURNS = 7;
export const MEMORY_AGENT_JSON_FORMAT = { type: 'json_object' } as const;

const MEMORY_MODEL_PREFERENCES = [
  'gpt-4.1-mini',
  'gpt-5-nano',
  'claude-haiku-4-5',
  'gpt-5',
  'claude-sonnet-4-6',
  'claude-opus-4-1',
] as const;

const ACTION_TAGS = [
  'none',
  'compliment',
  'flirt',
  'tease',
  'apologize',
  'ask_personal',
  'challenge',
  'reassure',
  'push_boundaries',
  'stay_silent',
  'ask_follow',
  'ask_open_up',
].join(', ');

const MOODS = [
  'cold',
  'guarded',
  'curious',
  'teasing',
  'flustered',
  'annoyed',
  'soft',
  'affectionate',
].join(', ');

export function normalizeMemoryAgentIntervalMessages(value: number | undefined) {
  return Math.max(
    1,
    Math.min(100, Math.round(Number.isFinite(value) ? value! : MEMORY_AGENT_INTERVAL_TURNS)),
  );
}

export function shouldRunMemoryAgent(
  memory: RelationshipMemory,
  intervalMessages = MEMORY_AGENT_INTERVAL_TURNS,
) {
  const interval = normalizeMemoryAgentIntervalMessages(intervalMessages);
  return memory.turnCount > 0 && memory.turnCount - memory.lastDiaryTurnCount >= interval;
}

export function addMemoryAgentPendingChatTurns(
  pendingCounts: Record<string, number>,
  stateKey: string,
  turnCount: number,
) {
  const key = stateKey.trim() || 'default';
  const nextCount = Math.max(0, Math.trunc(turnCount));
  pendingCounts[key] = (pendingCounts[key] ?? 0) + nextCount;
  return pendingCounts[key] ?? 0;
}

export function clearMemoryAgentPendingChatTurns(
  pendingCounts: Record<string, number>,
  stateKey: string,
) {
  pendingCounts[stateKey.trim() || 'default'] = 0;
}

export function consumeMemoryAgentPendingChatTurns(
  pendingCounts: Record<string, number>,
  stateKey: string,
  processedCount: number,
) {
  const key = stateKey.trim() || 'default';
  const current = pendingCounts[key] ?? 0;
  pendingCounts[key] = Math.max(0, current - Math.max(0, Math.trunc(processedCount)));
  return pendingCounts[key] ?? 0;
}

export function getMemoryAgentCadenceDecision(
  pendingCounts: Record<string, number>,
  stateKey: string,
  intervalMessages: number | undefined,
) {
  const interval = normalizeMemoryAgentIntervalMessages(intervalMessages);
  const pendingCount = pendingCounts[stateKey.trim() || 'default'] ?? 0;
  const remaining = Math.max(0, interval - pendingCount);
  return {
    interval,
    pendingCount,
    remaining,
    shouldQueue: pendingCount >= interval,
  };
}

export function chooseMemoryAgentModel(availableModels: string[], fallbackModel: string) {
  return (
    getMemoryAgentModelCandidates(availableModels, fallbackModel)[0] ?? DEFAULT_MEMORY_AGENT_MODEL
  );
}

export function getMemoryAgentModelCandidates(
  availableModels: string[],
  fallbackModel: string,
  excludedModels: string[] = [],
  preferredModel = '',
) {
  const lowered = availableModels.map((model) => model.toLowerCase());
  const availableByLower = new Map(availableModels.map((model) => [model.toLowerCase(), model]));
  const excluded = new Set(excludedModels.map((model) => model.toLowerCase()));
  const candidates: string[] = [];
  const seen = new Set<string>();

  const pushCandidate = (model: string | undefined) => {
    const normalized = model?.trim();
    if (!normalized || isPremiumCostModelId(normalized)) {
      return;
    }

    const resolvedModel =
      availableModels.length > 0 ? availableByLower.get(normalized.toLowerCase()) : normalized;

    if (!resolvedModel) {
      return;
    }

    const loweredModel = resolvedModel.toLowerCase();
    if (
      excluded.has(loweredModel) ||
      seen.has(loweredModel) ||
      isPremiumCostModelId(resolvedModel)
    ) {
      return;
    }

    seen.add(loweredModel);
    candidates.push(resolvedModel);
  };

  pushCandidate(preferredModel);

  for (const preferred of MEMORY_MODEL_PREFERENCES) {
    const index = lowered.indexOf(preferred);
    if (index >= 0) {
      pushCandidate(availableModels[index]);
    }
  }

  pushCandidate(fallbackModel);

  return candidates;
}

export function buildMemoryAgentMessages(
  history: ChatMessage[],
  relationshipMemory: RelationshipMemory,
  persona: PersonaProfile | null,
) {
  const recentHistory = history
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .slice(-20)
    .map(
      (message) =>
        `${message.role === 'user' ? 'User' : (persona?.name ?? 'Riko')}: ${message.content.trim()}`,
    )
    .join('\n');

  const currentMemoryBlock = {
    relationshipStage: relationshipMemory.relationshipStage,
    mood: relationshipMemory.mood,
    turnCount: relationshipMemory.turnCount,
    trust: relationshipMemory.trust,
    attraction: relationshipMemory.attraction,
    respect: relationshipMemory.respect,
    irritation: relationshipMemory.irritation,
    jealousy: relationshipMemory.jealousy,
    guard: relationshipMemory.guard,
    lastActionTag: relationshipMemory.lastActionTag,
    facts: relationshipMemory.facts,
    latestDiaryEntry: relationshipMemory.diaryEntry,
    summary: relationshipMemory.summary,
  };

  return [
    {
      role: 'system',
      content: [
        `You are a background relationship-memory classifier for ${persona?.name ?? 'Riko'}.`,
        'You are not writing a user-facing reply.',
        'Return ONLY valid JSON. No markdown. No commentary.',
        `actionTag must be one of: ${ACTION_TAGS}.`,
        `mood must be one of: ${MOODS}.`,
        'All delta fields must be integers in the range -2 to 2.',
        'facts must be short, concrete user facts only. Do not invent lore.',
        'summary must be compact and neutral, under 220 chars.',
        'rikoDiaryEntry must be a short first-person private diary note in Riko voice, under 220 chars.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `Current memory: ${JSON.stringify(currentMemoryBlock)}`,
        'Analyze the recent exchange and return this JSON object shape:',
        '{"actionTag":"none","mood":"guarded","trustDelta":0,"attractionDelta":0,"respectDelta":0,"irritationDelta":0,"jealousyDelta":0,"guardDelta":0,"facts":[],"summary":"","rikoDiaryEntry":""}',
        'Recent chat:',
        recentHistory || 'No recent chat available.',
      ].join('\n\n'),
    },
  ];
}
