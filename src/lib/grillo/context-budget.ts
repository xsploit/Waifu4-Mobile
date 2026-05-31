export const DEFAULT_SECTION_BUDGETS = {
  background_information: 300,
  instructions: 220,
  channel_history: 500,
  relationship_memory: 350,
  recalled_memories: 400,
  thoughts: 180,
  output_description: 80,
} as const;

export const DEFAULT_GLOBAL_BUDGET = 2030;

export type SectionName = keyof typeof DEFAULT_SECTION_BUDGETS;

export interface ScoredItem {
  text: string;
  score?: number;
}

export interface ContextSections {
  background_information: string[];
  instructions: string[];
  channel_history: string[];
  relationship_memory: string[];
  recalled_memories: ScoredItem[];
  thoughts: string[];
  output_description: string[];
}

export interface ReductionLog {
  step: string;
  section: SectionName;
  removedItems: number;
  tokensSaved: number;
}

export interface BudgetResult {
  sections: ContextSections;
  reductions: ReductionLog[];
  totalTokens: number;
  usedFallback: boolean;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function sectionTokens(items: (string | ScoredItem)[]): number {
  return items.reduce((sum, item) => {
    const text = typeof item === "string" ? item : item.text;
    return sum + estimateTokens(text);
  }, 0);
}

function removeLowestScoredItem(items: ScoredItem[]): ScoredItem | undefined {
  if (!items.length) return undefined;
  let lowestIdx = 0;
  let lowestScore = items[0]?.score ?? 0;
  for (let i = 1; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    const score = item.score ?? 0;
    if (score < lowestScore) {
      lowestScore = score;
      lowestIdx = i;
    }
  }
  return items.splice(lowestIdx, 1)[0];
}

function trimStringSectionToBudget(
  items: string[],
  maxTokens: number,
  section: SectionName,
  reductions: ReductionLog[],
  removeFrom: "start" | "end" = "start",
): void {
  const budget = Math.max(0, Math.floor(maxTokens));
  if (sectionTokens(items) <= budget) return;

  const before = items.length;
  let tokensSaved = 0;
  while (items.length && sectionTokens(items) > budget) {
    const removed = removeFrom === "start" ? items.shift() : items.pop();
    tokensSaved += estimateTokens(removed ?? "");
  }

  const removedItems = before - items.length;
  if (removedItems > 0) {
    reductions.push({
      step: "section_budget",
      section,
      removedItems,
      tokensSaved,
    });
  }
}

function trimScoredSectionToBudget(
  items: ScoredItem[],
  maxTokens: number,
  section: SectionName,
  reductions: ReductionLog[],
): void {
  const budget = Math.max(0, Math.floor(maxTokens));
  if (sectionTokens(items) <= budget) return;

  const before = items.length;
  let tokensSaved = 0;
  while (items.length && sectionTokens(items) > budget) {
    const removed = removeLowestScoredItem(items);
    tokensSaved += estimateTokens(removed?.text ?? "");
  }

  const removedItems = before - items.length;
  if (removedItems > 0) {
    reductions.push({
      step: "section_budget",
      section,
      removedItems,
      tokensSaved,
    });
  }
}

function enforceSectionBudgets(
  sections: ContextSections,
  budgets: Record<SectionName, number>,
  reductions: ReductionLog[],
): void {
  trimStringSectionToBudget(
    sections.background_information,
    budgets.background_information,
    "background_information",
    reductions,
    "end",
  );
  trimStringSectionToBudget(sections.instructions, budgets.instructions, "instructions", reductions, "end");
  trimStringSectionToBudget(sections.channel_history, budgets.channel_history, "channel_history", reductions, "start");
  trimStringSectionToBudget(
    sections.relationship_memory,
    budgets.relationship_memory,
    "relationship_memory",
    reductions,
    "end",
  );
  trimScoredSectionToBudget(sections.recalled_memories, budgets.recalled_memories, "recalled_memories", reductions);
  trimStringSectionToBudget(sections.thoughts, budgets.thoughts, "thoughts", reductions, "start");
  trimStringSectionToBudget(
    sections.output_description,
    budgets.output_description,
    "output_description",
    reductions,
    "end",
  );
}

function totalSectionTokens(sections: ContextSections): number {
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

export function reduceContextBudget(
  sections: ContextSections,
  budgets: Record<SectionName, number> = { ...DEFAULT_SECTION_BUDGETS },
  globalBudget: number = DEFAULT_GLOBAL_BUDGET,
): BudgetResult {
  const result: ContextSections = {
    background_information: [...sections.background_information],
    instructions: [...sections.instructions],
    channel_history: [...sections.channel_history],
    relationship_memory: [...sections.relationship_memory],
    recalled_memories: sections.recalled_memories.map((item) => ({ ...item })),
    thoughts: [...sections.thoughts],
    output_description: [...sections.output_description],
  };
  const reductions: ReductionLog[] = [];

  enforceSectionBudgets(result, budgets, reductions);

  // Step 1: Drop lowest-score recalled_memories (preserving original order)
  if (totalSectionTokens(result) > globalBudget && result.recalled_memories.length > 1) {
    const before = result.recalled_memories.length;
    let tokensSaved = 0;
    while (totalSectionTokens(result) > globalBudget && result.recalled_memories.length > 1) {
      const removed = removeLowestScoredItem(result.recalled_memories);
      tokensSaved += estimateTokens(removed?.text ?? "");
    }
    const removedCount = before - result.recalled_memories.length;
    if (removedCount > 0) {
      reductions.push({
        step: "drop_low_score_memories",
        section: "recalled_memories",
        removedItems: removedCount,
        tokensSaved,
      });
    }
  }

  // Step 2: Trim channel_history oldest (keep latest)
  if (totalSectionTokens(result) > globalBudget && result.channel_history.length > 2) {
    const before = result.channel_history.length;
    while (totalSectionTokens(result) > globalBudget && result.channel_history.length > 2) {
      result.channel_history.shift();
    }
    const removedCount = before - result.channel_history.length;
    if (removedCount > 0) {
      reductions.push({
        step: "trim_oldest_history",
        section: "channel_history",
        removedItems: removedCount,
        tokensSaved: removedCount * 30,
      });
    }
  }

  // Step 3: Trim thoughts to 1 item
  if (totalSectionTokens(result) > globalBudget && result.thoughts.length > 1) {
    const removedCount = result.thoughts.length - 1;
    result.thoughts = result.thoughts.slice(-1);
    reductions.push({
      step: "trim_thoughts",
      section: "thoughts",
      removedItems: removedCount,
      tokensSaved: removedCount * 20,
    });
  }

  // Step 4: Compact relationship_memory to 1 truncated line
  if (totalSectionTokens(result) > globalBudget && result.relationship_memory.length > 1) {
    const removedCount = result.relationship_memory.length - 1;
    const kept = result.relationship_memory[result.relationship_memory.length - 1] ?? "";
    result.relationship_memory = [
      kept.length > 200 ? `${kept.slice(0, 200)}...` : kept,
    ];
    reductions.push({
      step: "compact_relationship",
      section: "relationship_memory",
      removedItems: removedCount,
      tokensSaved: removedCount * 30,
    });
  }

  // Step 5: Fallback - 2 turns + 1 relationship line, clear everything else
  if (totalSectionTokens(result) > globalBudget) {
    result.channel_history = result.channel_history.slice(-2);
    result.relationship_memory = result.relationship_memory.slice(-1);
    result.recalled_memories = [];
    result.thoughts = [];
    reductions.push({
      step: "fallback_minimal",
      section: "channel_history",
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
