import type {
  RelationshipActionTag,
  RelationshipMemory,
  RelationshipMood,
  RelationshipStage,
} from './types';

const MAX_FACTS = 8;
const MAX_DIARY_CHARS = 280;
const MAX_DIARY_HISTORY = 3;
const RELATIONSHIP_STAT_MIN = 0;
const RELATIONSHIP_STAT_MAX = 20;

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
  return stringifyMemoryText(value)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_DIARY_CHARS);
}

function stringifyMemoryText(value: unknown): string {
  if (typeof value === 'string') {
    const text = value.trim();
    return text === '[object Object]' ? '' : value;
  }
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const prioritized = [
      record.summary,
      record.personalThought,
      record.personal_thought,
      record.thought,
      record.text,
      record.entry,
      record.content,
    ]
      .map(stringifyMemoryText)
      .map((text) => text.trim())
      .filter(Boolean);
    if (prioritized.length > 0) {
      return prioritized.join(' ');
    }
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return String(value);
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
