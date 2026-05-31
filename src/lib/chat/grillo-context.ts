import { formatChatTurnMetadata, type ChatTurn } from './chat-turn';
import type { PersonaProfile, RelationshipMemory } from './types';

export const GRILLO_DEFAULT_SECTION_BUDGETS = {
  background_information: 300,
  instructions: 220,
  channel_history: 500,
  relationship_memory: 350,
  recalled_memories: 400,
  thoughts: 180,
  output_description: 80,
} as const;

export const GRILLO_DEFAULT_GLOBAL_BUDGET = 2030;

export type GrilloSectionName = keyof typeof GRILLO_DEFAULT_SECTION_BUDGETS;

export type GrilloScoredItem = {
  text: string;
  score?: number;
};

export type GrilloContextSections = {
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

export type GrilloBudgetResult = {
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
    contextPacket?: {
      background_information?: string[];
      channel_history?: string[];
      output_description?: string[];
      recalled_memories?: GrilloScoredItem[];
      relationship_memory?: string[];
      thoughts?: string[];
    } | null;
    diaryThoughts?: string[];
    recalledMemories?: GrilloScoredItem[];
    relationshipMemory?: string[];
  };
  persona: PersonaProfile | null;
  relationshipMemory: RelationshipMemory;
  semanticMemoryContext?: string;
  turnContext?: Record<string, PromptTurnContextValue>;
};

export function estimateGrilloTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function buildGrilloContextSections({
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
  const conversationScope =
    readTurnContextValue(turnContext, 'conversationScope') ||
    (turnSource === 'local' ? 'local-chat' : 'twitch-chat');
  const channel =
    readTurnContextValue(turnContext, 'channel') ||
    channelHistory.find((turn) => turn.channel)?.channel ||
    (turnSource === 'local' ? 'local' : 'unknown');
  const currentSpeaker =
    readTurnContextValue(turnContext, 'displayName') ||
    channelHistory[channelHistory.length - 1]?.displayName ||
    'current speaker';
  const interfacePath =
    turnSource === 'twitch'
      ? `twitch/${normalizePathPart(channel)}`
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

export function reduceGrilloContextBudget(
  sections: GrilloContextSections,
  budgets: Record<GrilloSectionName, number> = { ...GRILLO_DEFAULT_SECTION_BUDGETS },
  globalBudget = GRILLO_DEFAULT_GLOBAL_BUDGET,
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

  enforceSectionBudgets(result, budgets, reductions);

  if (totalSectionTokens(result) > globalBudget && result.recalled_memories.length > 1) {
    const before = result.recalled_memories.length;
    let tokensSaved = 0;
    while (totalSectionTokens(result) > globalBudget && result.recalled_memories.length > 1) {
      const removed = removeLowestScoredItem(result.recalled_memories);
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

export function buildGrilloContextPromptBlock(options: BuildGrilloContextSectionsOptions): string {
  const budget = reduceGrilloContextBudget(buildGrilloContextSections(options));
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
) {
  trimStringSectionToBudget(
    sections.background_information,
    budgets.background_information,
    'background_information',
    reductions,
    'end',
  );
  trimStringSectionToBudget(
    sections.instructions,
    budgets.instructions,
    'instructions',
    reductions,
    'end',
  );
  trimStringSectionToBudget(
    sections.channel_history,
    budgets.channel_history,
    'channel_history',
    reductions,
    'start',
  );
  trimStringSectionToBudget(
    sections.relationship_memory,
    budgets.relationship_memory,
    'relationship_memory',
    reductions,
    'end',
  );
  trimScoredSectionToBudget(
    sections.recalled_memories,
    budgets.recalled_memories,
    'recalled_memories',
    reductions,
  );
  trimStringSectionToBudget(sections.thoughts, budgets.thoughts, 'thoughts', reductions, 'start');
  trimStringSectionToBudget(
    sections.output_description,
    budgets.output_description,
    'output_description',
    reductions,
    'end',
  );
}

function trimStringSectionToBudget(
  items: string[],
  maxTokens: number,
  section: GrilloSectionName,
  reductions: GrilloReductionLog[],
  removeFrom: 'start' | 'end',
) {
  const before = items.length;
  let tokensSaved = 0;
  while (items.length > 0 && sectionTokens(items) > maxTokens) {
    const removed = removeFrom === 'start' ? items.shift() : items.pop();
    tokensSaved += estimateGrilloTokens(removed ?? '');
  }
  pushReduction(reductions, 'section_budget', section, before, items.length, tokensSaved);
}

function trimScoredSectionToBudget(
  items: GrilloScoredItem[],
  maxTokens: number,
  section: GrilloSectionName,
  reductions: GrilloReductionLog[],
) {
  const before = items.length;
  let tokensSaved = 0;
  while (items.length > 0 && sectionTokens(items) > maxTokens) {
    const removed = removeLowestScoredItem(items);
    tokensSaved += estimateGrilloTokens(removed?.text ?? '');
  }
  pushReduction(reductions, 'section_budget', section, before, items.length, tokensSaved);
}

function removeLowestScoredItem(items: GrilloScoredItem[]) {
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
