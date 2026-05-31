import type { RelationshipMemory } from './types';
import {
  appendDiaryHistory,
  clampRelationshipStat,
  dedupeFacts,
  deriveRelationshipStage,
  normalizeRelationshipActionTag,
  normalizeRelationshipMood,
  sanitizeDiaryEntry,
} from './memory-shared';

type MergeRequest = {
  id: string;
  type: 'merge';
  currentMemory: RelationshipMemory;
  rawContent: string;
  targetTurnCount: number;
};

type MergeResponse = {
  id: string;
  ok: true;
  memory: RelationshipMemory;
};

function stripMarkdownFences(raw: string) {
  let content = raw.trim();
  const fenceMatch = content.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  const fencedContent = fenceMatch?.[1];
  if (fencedContent) {
    content = fencedContent.trim();
  }
  return content;
}

function parseJsonLoose(raw: string): Record<string, unknown> | null {
  const clean = stripMarkdownFences(raw);
  try {
    return JSON.parse(clean) as Record<string, unknown>;
  } catch {
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(clean.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function getDelta(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(-2, Math.min(2, Math.round(value)));
}

function getFacts(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) =>
      String(entry ?? '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean)
    .slice(0, 4);
}

export function mergeRelationshipMemory(
  currentMemory: RelationshipMemory,
  parsed: Record<string, unknown> | null,
  targetTurnCount: number,
) {
  const nextTargetTurnCount = Math.max(
    0,
    Math.round(Number.isFinite(targetTurnCount) ? targetTurnCount : currentMemory.turnCount),
  );
  if (!parsed || nextTargetTurnCount <= currentMemory.lastDiaryTurnCount) {
    return currentMemory;
  }

  const diaryEntry = sanitizeDiaryEntry(parsed['rikoDiaryEntry']);
  const summary = String(parsed['summary'] ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
  const nextFacts = dedupeFacts([...currentMemory.facts, ...getFacts(parsed['facts'])]);

  const nextMemory: RelationshipMemory = {
    ...currentMemory,
    version: 2,
    turnCount: Math.max(currentMemory.turnCount, nextTargetTurnCount),
    lastDiaryTurnCount: nextTargetTurnCount,
    mood: normalizeRelationshipMood(parsed['mood']),
    trust: clampRelationshipStat(currentMemory.trust + getDelta(parsed['trustDelta'])),
    attraction: clampRelationshipStat(
      currentMemory.attraction + getDelta(parsed['attractionDelta']),
    ),
    respect: clampRelationshipStat(currentMemory.respect + getDelta(parsed['respectDelta'])),
    irritation: clampRelationshipStat(
      currentMemory.irritation + getDelta(parsed['irritationDelta']),
    ),
    jealousy: clampRelationshipStat(currentMemory.jealousy + getDelta(parsed['jealousyDelta'])),
    guard: clampRelationshipStat(currentMemory.guard + getDelta(parsed['guardDelta'])),
    lastActionTag: normalizeRelationshipActionTag(parsed['actionTag']),
    facts: nextFacts,
    summary: summary || currentMemory.summary,
    diaryEntry: diaryEntry || currentMemory.diaryEntry,
    diaryHistory: appendDiaryHistory(currentMemory.diaryHistory, diaryEntry),
  };

  nextMemory.relationshipStage = deriveRelationshipStage(nextMemory);
  return nextMemory;
}

if (typeof self !== 'undefined') {
  self.onmessage = (event: MessageEvent<MergeRequest>) => {
    const payload = event.data;
    if (!payload || payload.type !== 'merge') {
      return;
    }

    const parsed = parseJsonLoose(payload.rawContent);
    const memory = mergeRelationshipMemory(payload.currentMemory, parsed, payload.targetTurnCount);
    const response: MergeResponse = {
      id: payload.id,
      ok: true,
      memory,
    };

    self.postMessage(response);
  };
}
