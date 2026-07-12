import { formatChatTurnMetadata, type ChatTurn } from './chat-turn';
import type { PersonaProfile, RelationshipMemory } from './types';
import type { GrilloContextPacket, GrilloRecallItem } from '../../shared/grilloContext';

const GRILLO_DEFAULT_SECTION_BUDGETS = {
  background_information: 300,
  instructions: 220,
  channel_history: 500,
  relationship_memory: 350,
  recalled_memories: 400,
  thoughts: 180,
  output_description: 80,
} as const;

const GRILLO_DEFAULT_GLOBAL_BUDGET = 2030;

export type GrilloSectionName = keyof typeof GRILLO_DEFAULT_SECTION_BUDGETS;

export type GrilloContextBudgetOverrides = {
  globalBudget?: number;
  sectionBudgets?: Partial<Record<GrilloSectionName, number>>;
};

export type GrilloScoredItem = Partial<Omit<GrilloRecallItem, 'score' | 'text'>> & {
  text: string;
  score?: number;
};

type GrilloContextSections = {
  background_information: string[];
  instructions: string[];
  channel_history: string[];
  relationship_memory: string[];
  recalled_memories: GrilloScoredItem[];
  thoughts: string[];
  output_description: string[];
};

export type GrilloReductionLog = {
  step: string;
  section: GrilloSectionName;
  removedItems: number;
  tokensSaved: number;
};

export type GrilloClientProvenanceDrop = {
  id: string;
  section: GrilloSectionName;
  stage: 'client_context_reducer';
  step: string;
};

export type GrilloClientLaneReceipt = {
  dropped: GrilloClientProvenanceDrop[];
  droppedIds: string[];
  duplicateIds: string[];
  includedIds: string[];
  includedOccurrences: string[];
  requestedIds: string[];
  requestedOccurrences: string[];
};

export type GrilloClientContextReceipt = {
  lanes: Record<
    'channel_history' | 'recalled_memories' | 'relationship_memory' | 'thoughts',
    GrilloClientLaneReceipt
  >;
  reductions: GrilloReductionLog[];
  stage: 'client_context_reducer';
  totalTokens: number;
  usedFallback: boolean;
  version: '1.0.0';
};

type GrilloSectionIds = Record<GrilloSectionName, string[]>;

type GrilloReductionTracker = {
  drops: GrilloClientProvenanceDrop[];
  ids: GrilloSectionIds;
  requested: GrilloSectionIds;
};

type GrilloBudgetResult = {
  sections: GrilloContextSections;
  reductions: GrilloReductionLog[];
  totalTokens: number;
  usedFallback: boolean;
};

type PromptTurnContextValue = string | number | boolean | null | undefined;

type BuildGrilloContextSectionsOptions = {
  channelHistory?: ChatTurn[];
  currentTurnText?: string;
  diaryContext?: string;
  memoryAdditions?: {
    contextPacket?: GrilloContextPacket | null;
    diaryThoughts?: string[];
    recalledMemories?: GrilloScoredItem[];
    relationshipMemory?: string[];
  };
  persona: PersonaProfile | null;
  relationshipMemory: RelationshipMemory;
  semanticMemoryContext?: string;
  turnContext?: Record<string, PromptTurnContextValue>;
};

function estimateGrilloTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function buildGrilloContextSections({
  channelHistory = [],
  currentTurnText = '',
  diaryContext = '',
  memoryAdditions,
  persona,
  relationshipMemory,
  semanticMemoryContext = '',
  turnContext,
}: BuildGrilloContextSectionsOptions): GrilloContextSections {
  const turnSource = readTurnContextValue(turnContext, 'source') || inferSource(channelHistory);
  const channel =
    readTurnContextValue(turnContext, 'channel') ||
    channelHistory.find((turn) => turn.channel)?.channel ||
    (turnSource === 'local' ? 'local' : 'unknown');
  const conversationScope =
    readTurnContextValue(turnContext, 'conversationScope') ||
    (turnSource === 'local'
      ? 'local-chat'
      : turnSource === 'discord'
        ? `discord:${normalizePathPart(channel)}`
        : 'twitch-chat');
  const currentSpeaker =
    readTurnContextValue(turnContext, 'displayName') ||
    channelHistory[channelHistory.length - 1]?.displayName ||
    'current speaker';
  const interfacePath =
    turnSource === 'twitch'
      ? `twitch/${normalizePathPart(channel)}`
      : turnSource === 'discord'
        ? `discord/${normalizePathPart(channel)}`
      : `local/${normalizePathPart(currentSpeaker)}`;
  const packet = memoryAdditions?.contextPacket ?? null;
  const useNativePacket = packet !== null;

  return {
    background_information: [
      `active_persona: ${persona?.name?.trim() || 'Web Waifu 4'}`,
      `local_controller: ${persona?.userNickname?.trim() || 'not configured'}`,
      `interface_path: ${interfacePath}`,
      `conversation_scope: ${conversationScope}`,
      `turn_source: ${turnSource || 'unknown'}`,
      `current_speaker: ${currentSpeaker}`,
      ...(packet?.background_information ?? []),
    ],
    instructions: [
      'Use channel_history as transcript, relationship_memory as stable participant context, recalled_memories as semantic matches, and thoughts as private diary/reflection.',
      'Do not replay global cross-channel transcript. Use only the current channel/source/persona scope supplied in this packet.',
      'If memory conflicts with the current turn or speaker metadata, trust the current turn first.',
      'Local chat is a participant transcript turn, but trusted/controller metadata may permit commands or stronger operator intent.',
      'Do not rewrite the persona from memory; use memory only as context for this reply.',
    ],
    channel_history: [
      ...(packet?.channel_history ?? []),
      ...(useNativePacket ? [] : channelHistory.slice(-18).map(formatGrilloChatTurn)),
    ],
    relationship_memory: [
      ...(packet?.relationship_memory ?? []),
      ...(useNativePacket ? [] : buildRelationshipLane(relationshipMemory)),
      ...(useNativePacket ? [] : (memoryAdditions?.relationshipMemory ?? [])),
    ],
    recalled_memories: [
      ...(packet?.recalled_memories ?? []),
      ...(useNativePacket ? [] : buildRecalledMemoryLane(semanticMemoryContext)),
      ...(useNativePacket ? [] : (memoryAdditions?.recalledMemories ?? [])),
    ],
    thoughts: [
      ...(packet?.thoughts ?? []),
      ...(useNativePacket ? [] : buildThoughtLane(diaryContext)),
      ...(useNativePacket ? [] : (memoryAdditions?.diaryThoughts ?? [])),
    ],
    output_description: [
      ...(packet?.output_description ?? []),
      'Return spoken dialogue for the live stream using the active reply length rules, then append the required hidden reply metadata block.',
      'Select emotion/animation metadata that matches the visible reply; avoid conflicting motion cues.',
      currentTurnText.trim()
        ? `current_turn_digest: ${currentTurnText.replace(/\s+/g, ' ').trim().slice(0, 420)}`
        : '',
    ].filter(Boolean),
  };
}

function reduceGrilloContextBudget(
  sections: GrilloContextSections,
  budgets: Record<GrilloSectionName, number> = { ...GRILLO_DEFAULT_SECTION_BUDGETS },
  globalBudget = GRILLO_DEFAULT_GLOBAL_BUDGET,
  tracker?: GrilloReductionTracker,
): GrilloBudgetResult {
  const result: GrilloContextSections = {
    background_information: [...sections.background_information],
    instructions: [...sections.instructions],
    channel_history: [...sections.channel_history],
    relationship_memory: [...sections.relationship_memory],
    recalled_memories: sections.recalled_memories.map((item) => ({ ...item })),
    thoughts: [...sections.thoughts],
    output_description: [...sections.output_description],
  };
  const reductions: GrilloReductionLog[] = [];

  enforceSectionBudgets(result, budgets, reductions, tracker);

  if (totalSectionTokens(result) > globalBudget && result.recalled_memories.length > 1) {
    const before = result.recalled_memories.length;
    let tokensSaved = 0;
    while (totalSectionTokens(result) > globalBudget && result.recalled_memories.length > 1) {
      const removed = removeLowestScoredItem(result.recalled_memories, (index) => {
        dropTrackedId(tracker, 'recalled_memories', index, 'drop_low_score_memories');
      });
      tokensSaved += estimateGrilloTokens(removed?.text ?? '');
    }
    pushReduction(
      reductions,
      'drop_low_score_memories',
      'recalled_memories',
      before,
      result.recalled_memories.length,
      tokensSaved,
    );
  }

  if (totalSectionTokens(result) > globalBudget && result.channel_history.length > 2) {
    const before = result.channel_history.length;
    let tokensSaved = 0;
    while (totalSectionTokens(result) > globalBudget && result.channel_history.length > 2) {
      tokensSaved += estimateGrilloTokens(result.channel_history.shift() ?? '');
      dropTrackedId(tracker, 'channel_history', 0, 'trim_oldest_history');
    }
    pushReduction(
      reductions,
      'trim_oldest_history',
      'channel_history',
      before,
      result.channel_history.length,
      tokensSaved,
    );
  }

  if (totalSectionTokens(result) > globalBudget && result.thoughts.length > 1) {
    const before = result.thoughts.length;
    const removed = result.thoughts.slice(0, -1);
    result.thoughts = result.thoughts.slice(-1);
    dropTrackedIds(
      tracker,
      'thoughts',
      tracker?.ids.thoughts.slice(0, -1) ?? [],
      'trim_thoughts',
    );
    if (tracker) tracker.ids.thoughts = tracker.ids.thoughts.slice(-1);
    pushReduction(
      reductions,
      'trim_thoughts',
      'thoughts',
      before,
      result.thoughts.length,
      removed.reduce((sum, item) => sum + estimateGrilloTokens(item), 0),
    );
  }

  if (totalSectionTokens(result) > globalBudget && result.relationship_memory.length > 1) {
    const before = result.relationship_memory.length;
    const kept = result.relationship_memory[result.relationship_memory.length - 1] ?? '';
    const removed = result.relationship_memory.slice(0, -1);
    result.relationship_memory = [kept.length > 200 ? `${kept.slice(0, 200)}...` : kept];
    dropTrackedIds(
      tracker,
      'relationship_memory',
      tracker?.ids.relationship_memory.slice(0, -1) ?? [],
      'compact_relationship',
    );
    if (tracker) tracker.ids.relationship_memory = tracker.ids.relationship_memory.slice(-1);
    pushReduction(
      reductions,
      'compact_relationship',
      'relationship_memory',
      before,
      result.relationship_memory.length,
      removed.reduce((sum, item) => sum + estimateGrilloTokens(item), 0),
    );
  }

  if (totalSectionTokens(result) > globalBudget) {
    trackFallbackDrops(tracker, result);
    result.channel_history = result.channel_history.slice(-2);
    result.relationship_memory = result.relationship_memory.slice(-1);
    result.recalled_memories = [];
    result.thoughts = [];
    reductions.push({
      step: 'fallback_minimal',
      section: 'channel_history',
      removedItems: 0,
      tokensSaved: 0,
    });
    return {
      sections: result,
      reductions,
      totalTokens: totalSectionTokens(result),
      usedFallback: true,
    };
  }

  return {
    sections: result,
    reductions,
    totalTokens: totalSectionTokens(result),
    usedFallback: false,
  };
}

export function buildGrilloContextPromptMaterial(
  options: BuildGrilloContextSectionsOptions,
  budgetOverrides: GrilloContextBudgetOverrides = {},
) {
  const sections = buildGrilloContextSections(options);
  const ids = buildGrilloSectionIds(options, sections);
  const tracker: GrilloReductionTracker = {
    drops: [],
    ids: cloneSectionIds(ids),
    requested: cloneSectionIds(ids),
  };
  const budget = reduceGrilloContextBudget(
    sections,
    { ...GRILLO_DEFAULT_SECTION_BUDGETS, ...budgetOverrides.sectionBudgets },
    budgetOverrides.globalBudget ?? GRILLO_DEFAULT_GLOBAL_BUDGET,
    tracker,
  );
  const text = renderGrilloContextPromptBlock(budget);
  return {
    receipt: buildClientContextReceipt(budget, tracker),
    text,
  };
}

export function buildGrilloContextPromptBlock(options: BuildGrilloContextSectionsOptions): string {
  return buildGrilloContextPromptMaterial(options).text;
}

function renderGrilloContextPromptBlock(budget: GrilloBudgetResult) {
  const lines = [
    `estimated_tokens: ${budget.totalTokens}`,
    `used_fallback: ${budget.usedFallback}`,
    budget.reductions.length > 0
      ? `reductions: ${budget.reductions.map((item) => `${item.step}:${item.section}-${item.removedItems}`).join(', ')}`
      : 'reductions: none',
    '',
    renderStringLane('background_information', budget.sections.background_information),
    renderStringLane('instructions', budget.sections.instructions),
    renderStringLane('channel_history', budget.sections.channel_history),
    renderStringLane('relationship_memory', budget.sections.relationship_memory),
    renderScoredLane('recalled_memories', budget.sections.recalled_memories),
    renderStringLane('thoughts', budget.sections.thoughts),
    renderStringLane('output_description', budget.sections.output_description),
  ];

  return lines.filter(Boolean).join('\n').trim();
}

function buildRelationshipLane(memory: RelationshipMemory) {
  return [
    `stage=${memory.relationshipStage} mood=${memory.mood} last_seen=${memory.lastSeenAt ? new Date(memory.lastSeenAt).toISOString() : 'never'}`,
    `scores=${JSON.stringify({
      trust: memory.trust,
      attraction: memory.attraction,
      respect: memory.respect,
      irritation: memory.irritation,
      jealousy: memory.jealousy,
      guard: memory.guard,
    })}`,
    `last_action_tag=${memory.lastActionTag}`,
    memory.summary ? `summary=${memory.summary}` : '',
    memory.facts.length > 0 ? `known_facts=${JSON.stringify(memory.facts)}` : '',
  ].filter(Boolean);
}

function buildRecalledMemoryLane(semanticMemoryContext: string): GrilloScoredItem[] {
  const lines = semanticMemoryContext
    .split(/\n+/g)
    .map((line) => line.replace(/^\s*\d+\.\s*/, '').trim())
    .filter(Boolean);

  return lines.map((line, index) => ({
    text: line,
    score: Math.max(0.1, 1 - index * 0.12),
  }));
}

function buildThoughtLane(diaryContext: string) {
  return diaryContext
    .split(/\n+/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-4);
}

function formatGrilloChatTurn(turn: ChatTurn) {
  return `${turn.displayName}: ${turn.text.replace(/\s+/g, ' ').trim()}\nmetadata: ${formatChatTurnMetadata(turn)}`;
}

function readTurnContextValue(
  turnContext: Record<string, PromptTurnContextValue> | undefined,
  key: string,
) {
  const value = turnContext?.[key];
  return value === undefined || value === null ? '' : String(value).trim();
}

function inferSource(channelHistory: ChatTurn[]) {
  return channelHistory[channelHistory.length - 1]?.source ?? '';
}

function normalizePathPart(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9:_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'unknown'
  );
}

function buildGrilloSectionIds(
  options: BuildGrilloContextSectionsOptions,
  sections: GrilloContextSections,
): GrilloSectionIds {
  const packet = options.memoryAdditions?.contextPacket ?? null;
  const scopeKey =
    packet?.scopeKey ||
    readTurnContextValue(options.turnContext, 'stateKey') ||
    readTurnContextValue(options.turnContext, 'conversationScope') ||
    'browser';
  const serverLanes = packet?.provenance_receipt?.lanes;
  const channelFallback = packet
    ? []
    : (options.channelHistory ?? []).slice(-18).map((turn) => `turn:${turn.id}`);
  const recalledPreferred = sections.recalled_memories.map((item) => item.id ?? '');

  return {
    background_information: idsForTexts(
      scopeKey,
      'background_information',
      sections.background_information,
    ),
    instructions: idsForTexts(scopeKey, 'instructions', sections.instructions),
    channel_history: idsForTexts(
      scopeKey,
      'channel_history',
      sections.channel_history,
      serverLanes?.channel_history.includedOccurrences ?? channelFallback,
    ),
    relationship_memory: idsForTexts(
      scopeKey,
      'relationship_memory',
      sections.relationship_memory,
      serverLanes?.relationship_memory.includedOccurrences,
    ),
    recalled_memories: idsForTexts(
      scopeKey,
      'recalled_memories',
      sections.recalled_memories.map((item) => item.text),
      serverLanes?.recalled_memories.includedOccurrences ?? recalledPreferred,
    ),
    thoughts: idsForTexts(
      scopeKey,
      'thoughts',
      sections.thoughts,
      serverLanes?.thoughts.includedOccurrences,
    ),
    output_description: idsForTexts(
      scopeKey,
      'output_description',
      sections.output_description,
    ),
  };
}

function idsForTexts(
  scopeKey: string,
  section: GrilloSectionName,
  texts: string[],
  preferred: string[] = [],
) {
  return texts.map((text, index) =>
    preferred[index]?.trim() || deterministicFallbackId(scopeKey, section, index, text),
  );
}

function deterministicFallbackId(
  scopeKey: string,
  section: GrilloSectionName,
  index: number,
  text: string,
) {
  const bytes = new TextEncoder().encode(`${scopeKey}\u0000${section}\u0000${index}\u0000${text}`);
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return `fallback:${section}:${index}:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function cloneSectionIds(ids: GrilloSectionIds): GrilloSectionIds {
  return Object.fromEntries(
    Object.entries(ids).map(([section, values]) => [section, [...values]]),
  ) as GrilloSectionIds;
}

function dropTrackedId(
  tracker: GrilloReductionTracker | undefined,
  section: GrilloSectionName,
  index: number,
  step: string,
) {
  if (!tracker) return;
  const [id] = tracker.ids[section].splice(index, 1);
  if (id) recordClientDrop(tracker, section, id, step);
}

function dropTrackedIds(
  tracker: GrilloReductionTracker | undefined,
  section: GrilloSectionName,
  ids: string[],
  step: string,
) {
  if (!tracker) return;
  for (const id of ids) recordClientDrop(tracker, section, id, step);
}

function recordClientDrop(
  tracker: GrilloReductionTracker,
  section: GrilloSectionName,
  id: string,
  step: string,
) {
  tracker.drops.push({ id, section, stage: 'client_context_reducer', step });
}

function trackFallbackDrops(
  tracker: GrilloReductionTracker | undefined,
  sections: GrilloContextSections,
) {
  if (!tracker) return;
  const channelKeep = Math.min(2, sections.channel_history.length);
  const droppedChannelIds = channelKeep > 0
    ? tracker.ids.channel_history.slice(0, -channelKeep)
    : [...tracker.ids.channel_history];
  dropTrackedIds(
    tracker,
    'channel_history',
    droppedChannelIds,
    'fallback_minimal',
  );
  tracker.ids.channel_history = tracker.ids.channel_history.slice(-2);
  dropTrackedIds(
    tracker,
    'relationship_memory',
    tracker.ids.relationship_memory.slice(0, -1),
    'fallback_minimal',
  );
  tracker.ids.relationship_memory = tracker.ids.relationship_memory.slice(-1);
  dropTrackedIds(
    tracker,
    'recalled_memories',
    tracker.ids.recalled_memories,
    'fallback_minimal',
  );
  tracker.ids.recalled_memories = [];
  dropTrackedIds(tracker, 'thoughts', tracker.ids.thoughts, 'fallback_minimal');
  tracker.ids.thoughts = [];
}

function buildClientContextReceipt(
  budget: GrilloBudgetResult,
  tracker: GrilloReductionTracker,
): GrilloClientContextReceipt {
  return {
    lanes: {
      channel_history: clientLaneReceipt('channel_history', tracker),
      recalled_memories: clientLaneReceipt('recalled_memories', tracker),
      relationship_memory: clientLaneReceipt('relationship_memory', tracker),
      thoughts: clientLaneReceipt('thoughts', tracker),
    },
    reductions: budget.reductions.map((item) => ({ ...item })),
    stage: 'client_context_reducer',
    totalTokens: budget.totalTokens,
    usedFallback: budget.usedFallback,
    version: '1.0.0',
  };
}

function clientLaneReceipt(
  section: 'channel_history' | 'recalled_memories' | 'relationship_memory' | 'thoughts',
  tracker: GrilloReductionTracker,
): GrilloClientLaneReceipt {
  const requestedOccurrences = tracker.requested[section];
  const includedOccurrences = tracker.ids[section];
  const dropped = tracker.drops.filter((item) => item.section === section);
  return {
    dropped: dropped.map((item) => ({ ...item })),
    droppedIds: uniqueStrings(dropped.map((item) => item.id)),
    duplicateIds: findDuplicateIds(requestedOccurrences),
    includedIds: uniqueStrings(includedOccurrences),
    includedOccurrences: [...includedOccurrences],
    requestedIds: uniqueStrings(requestedOccurrences),
    requestedOccurrences: [...requestedOccurrences],
  };
}

function findDuplicateIds(ids: string[]) {
  const seen = new Set<string>();
  return uniqueStrings(
    ids.filter((id) => {
      if (seen.has(id)) return true;
      seen.add(id);
      return false;
    }),
  );
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function sectionTokens(items: Array<string | GrilloScoredItem>) {
  return items.reduce((sum, item) => {
    const text = typeof item === 'string' ? item : item.text;
    return sum + estimateGrilloTokens(text);
  }, 0);
}

function totalSectionTokens(sections: GrilloContextSections) {
  return (
    sectionTokens(sections.background_information) +
    sectionTokens(sections.instructions) +
    sectionTokens(sections.channel_history) +
    sectionTokens(sections.relationship_memory) +
    sectionTokens(sections.recalled_memories) +
    sectionTokens(sections.thoughts) +
    sectionTokens(sections.output_description)
  );
}

function enforceSectionBudgets(
  sections: GrilloContextSections,
  budgets: Record<GrilloSectionName, number>,
  reductions: GrilloReductionLog[],
  tracker?: GrilloReductionTracker,
) {
  trimStringSectionToBudget(
    sections.background_information,
    budgets.background_information,
    'background_information',
    reductions,
    'end',
    tracker,
  );
  trimStringSectionToBudget(
    sections.instructions,
    budgets.instructions,
    'instructions',
    reductions,
    'end',
    tracker,
  );
  trimStringSectionToBudget(
    sections.channel_history,
    budgets.channel_history,
    'channel_history',
    reductions,
    'start',
    tracker,
  );
  trimStringSectionToBudget(
    sections.relationship_memory,
    budgets.relationship_memory,
    'relationship_memory',
    reductions,
    'end',
    tracker,
  );
  trimScoredSectionToBudget(
    sections.recalled_memories,
    budgets.recalled_memories,
    'recalled_memories',
    reductions,
    tracker,
  );
  trimStringSectionToBudget(
    sections.thoughts,
    budgets.thoughts,
    'thoughts',
    reductions,
    'start',
    tracker,
  );
  trimStringSectionToBudget(
    sections.output_description,
    budgets.output_description,
    'output_description',
    reductions,
    'end',
    tracker,
  );
}

function trimStringSectionToBudget(
  items: string[],
  maxTokens: number,
  section: GrilloSectionName,
  reductions: GrilloReductionLog[],
  removeFrom: 'start' | 'end',
  tracker?: GrilloReductionTracker,
) {
  const before = items.length;
  let tokensSaved = 0;
  while (items.length > 0 && sectionTokens(items) > maxTokens) {
    const removeIndex = removeFrom === 'start' ? 0 : items.length - 1;
    const removed = removeFrom === 'start' ? items.shift() : items.pop();
    dropTrackedId(tracker, section, removeIndex, 'section_budget');
    tokensSaved += estimateGrilloTokens(removed ?? '');
  }
  pushReduction(reductions, 'section_budget', section, before, items.length, tokensSaved);
}

function trimScoredSectionToBudget(
  items: GrilloScoredItem[],
  maxTokens: number,
  section: GrilloSectionName,
  reductions: GrilloReductionLog[],
  tracker?: GrilloReductionTracker,
) {
  const before = items.length;
  let tokensSaved = 0;
  while (items.length > 0 && sectionTokens(items) > maxTokens) {
    const removed = removeLowestScoredItem(items, (index) => {
      dropTrackedId(tracker, section, index, 'section_budget');
    });
    tokensSaved += estimateGrilloTokens(removed?.text ?? '');
  }
  pushReduction(reductions, 'section_budget', section, before, items.length, tokensSaved);
}

function removeLowestScoredItem(items: GrilloScoredItem[], onRemove?: (index: number) => void) {
  if (items.length === 0) {
    return undefined;
  }

  let lowestIndex = 0;
  let lowestScore = items[0]?.score ?? 0;
  for (let index = 1; index < items.length; index += 1) {
    const score = items[index]?.score ?? 0;
    if (score < lowestScore) {
      lowestIndex = index;
      lowestScore = score;
    }
  }

  onRemove?.(lowestIndex);
  return items.splice(lowestIndex, 1)[0];
}

function pushReduction(
  reductions: GrilloReductionLog[],
  step: string,
  section: GrilloSectionName,
  before: number,
  after: number,
  tokensSaved: number,
) {
  const removedItems = before - after;
  if (removedItems <= 0) {
    return;
  }

  reductions.push({
    step,
    section,
    removedItems,
    tokensSaved,
  });
}

function renderStringLane(name: GrilloSectionName, items: string[]) {
  if (items.length === 0) {
    return `## ${name}\n(empty)`;
  }

  return [`## ${name}`, ...items.map((item) => `- ${item}`)].join('\n');
}

function renderScoredLane(name: GrilloSectionName, items: GrilloScoredItem[]) {
  if (items.length === 0) {
    return `## ${name}\n(empty)`;
  }

  return [
    `## ${name}`,
    ...items.map((item) => `- score=${(item.score ?? 0).toFixed(2)} ${item.text}`),
  ].join('\n');
}
