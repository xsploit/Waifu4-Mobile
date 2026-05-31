import type {
  ChatMessage,
  RelationshipActionTag,
  RelationshipMemory,
  RelationshipMood,
  RelationshipStage,
} from './types';

export const MAX_FACTS = 8;
export const MAX_SUMMARY_CHARS = 900;
export const MAX_DIARY_CHARS = 280;
export const MAX_DIARY_HISTORY = 3;
export const RELATIONSHIP_STAT_MIN = 0;
export const RELATIONSHIP_STAT_MAX = 20;

const ACTION_TAGS: RelationshipActionTag[] = [
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
];

const MOODS: RelationshipMood[] = [
  'cold',
  'guarded',
  'curious',
  'teasing',
  'flustered',
  'annoyed',
  'soft',
  'affectionate',
];

export function clampRelationshipStat(value: number) {
  return Math.max(RELATIONSHIP_STAT_MIN, Math.min(RELATIONSHIP_STAT_MAX, Math.round(value)));
}

export function dedupeFacts(facts: string[]) {
  const seen = new Set<string>();
  const output: string[] = [];

  facts.forEach((fact) => {
    const normalized = fact.trim();
    if (!normalized) {
      return;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    output.push(normalized);
  });

  return output.slice(0, MAX_FACTS);
}

export function extractFactsFromUserMessage(message: string) {
  const text = message.trim();
  const facts: string[] = [];
  const patterns = [
    /my name is ([^.!?]+)/i,
    /i(?:'m| am) ([^.!?]+)/i,
    /i (?:like|love|prefer) ([^.!?]+)/i,
    /i (?:hate|dislike) ([^.!?]+)/i,
    /i work (?:as|at) ([^.!?]+)/i,
    /i live in ([^.!?]+)/i,
  ];

  patterns.forEach((pattern) => {
    const match = text.match(pattern);
    if (!match?.[1]) {
      return;
    }

    const fact = match[0].replace(/\s+/g, ' ').trim();
    if (fact.length >= 6 && fact.length <= 140) {
      facts.push(fact);
    }
  });

  return facts;
}

export function buildSummary(history: ChatMessage[]) {
  const relevant = history
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .slice(-6)
    .map((message) => `${message.role === 'user' ? 'User' : 'Riko'}: ${message.content.trim()}`)
    .join(' | ');

  if (relevant.length <= MAX_SUMMARY_CHARS) {
    return relevant;
  }

  return relevant.slice(relevant.length - MAX_SUMMARY_CHARS);
}

export function normalizeRelationshipMood(value: unknown): RelationshipMood {
  if (typeof value !== 'string') {
    return 'guarded';
  }

  const normalized = value.trim().toLowerCase() as RelationshipMood;
  return MOODS.includes(normalized) ? normalized : 'guarded';
}

export function normalizeRelationshipActionTag(value: unknown): RelationshipActionTag {
  if (typeof value !== 'string') {
    return 'none';
  }

  const normalized = value.trim().toLowerCase() as RelationshipActionTag;
  return ACTION_TAGS.includes(normalized) ? normalized : 'none';
}

export function sanitizeDiaryEntry(value: unknown) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_DIARY_CHARS);
}

export function deriveRelationshipStage(memory: Pick<
  RelationshipMemory,
  'turnCount' | 'trust' | 'respect' | 'attraction' | 'guard'
>): RelationshipStage {
  if (
    memory.turnCount >= 24
    || ((memory.trust >= 14 || memory.attraction >= 12) && memory.respect >= 12 && memory.guard <= 9)
  ) {
    return 'close';
  }

  if (
    memory.turnCount >= 8
    || memory.trust >= 8
    || memory.respect >= 8
    || memory.attraction >= 7
  ) {
    return 'familiar';
  }

  return 'new';
}

export function appendDiaryHistory(history: string[], entry: string) {
  if (!entry) {
    return history.slice(0, MAX_DIARY_HISTORY);
  }

  const next = [...history];
  if (next[next.length - 1]?.trim() !== entry.trim()) {
    next.push(entry);
  }

  return next.slice(-MAX_DIARY_HISTORY);
}
