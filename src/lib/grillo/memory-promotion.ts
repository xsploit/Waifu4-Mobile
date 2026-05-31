export type CandidateType =
  | "preference"
  | "fact"
  | "goal"
  | "boundary"
  | "bond_signal"
  | "thread";

export type BlockName =
  | "preferences"
  | "boundaries"
  | "relationship_state"
  | "ongoing_topics"
  | "ongoing_threads"
  | "verified_facts"
  | "open_threads"
  | "core_identity"
  | "working_scratchpad";

export interface PromotionCandidate {
  candidate_id: string;
  type: CandidateType;
  content: string;
  summary: string;
  confidence: number;
  user_id: string;
  created_at?: string;
}

export interface MemoryBlock {
  schema_version: "1.0.0";
  block_id: string;
  user_id: string;
  block_name: BlockName;
  operation: "upsert" | "remove" | "merge";
  items: string[];
  reason: string;
  source_candidate_ids: string[];
  created_at: string;
}

export interface PromotionPolicy {
  confidenceThreshold: number;
  minCandidatesForPromotion: number;
  maxBlockItems: number;
}

export interface PromotionResult {
  block: MemoryBlock;
  newItems: string[];
  promotedCandidateIds: string[];
}

export interface PromotionEvaluationResult {
  results: PromotionResult[];
  consumedCandidateIds: string[];
}

const DEFAULT_POLICY: PromotionPolicy = {
  confidenceThreshold: 0.75,
  minCandidatesForPromotion: 2,
  maxBlockItems: 20,
};

function canonicalItem(text: string): string {
  return String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function dedupePreserveOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = String(value || "").replace(/\s+/g, " ").trim();
    if (!normalized.length) continue;
    const key = canonicalItem(normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

function blockNameForCandidateType(type: CandidateType): BlockName {
  if (type === "preference") return "preferences";
  if (type === "boundary") return "boundaries";
  if (type === "bond_signal") return "relationship_state";
  if (type === "thread") return "ongoing_topics";
  if (type === "fact") return "verified_facts";
  return "open_threads";
}

function parseBlockVersion(blockId: string): number {
  const match = /:v(\d+)$/i.exec(String(blockId || ""));
  if (!match) return 0;
  const parsed = Number.parseInt(match[1] ?? "0", 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pickLatestBlock(blocks: MemoryBlock[]): MemoryBlock | null {
  if (!blocks.length) return null;
  return [...blocks].sort((a, b) => {
    const aTs = Date.parse(a.created_at || "");
    const bTs = Date.parse(b.created_at || "");
    if (Number.isFinite(aTs) && Number.isFinite(bTs) && aTs !== bTs) return bTs - aTs;
    return parseBlockVersion(b.block_id) - parseBlockVersion(a.block_id);
  })[0] || null;
}

export function evaluatePromotion(
  candidates: PromotionCandidate[],
  existingBlocks: MemoryBlock[],
  alreadyPromotedIds: Set<string> = new Set<string>(),
  policyOverrides: Partial<PromotionPolicy> = {},
): PromotionEvaluationResult {
  const policy: PromotionPolicy = {
    ...DEFAULT_POLICY,
    ...policyOverrides,
  };

  const eligible = candidates.filter((candidate) => (
    candidate &&
    typeof candidate.candidate_id === "string" &&
    !alreadyPromotedIds.has(candidate.candidate_id) &&
    Number.isFinite(candidate.confidence) &&
    candidate.confidence >= policy.confidenceThreshold
  ));

  const grouped = new Map<string, PromotionCandidate[]>();
  for (const candidate of eligible) {
    const key = `${candidate.user_id}::${candidate.type}`;
    const list = grouped.get(key) ?? [];
    list.push(candidate);
    grouped.set(key, list);
  }

  const results: PromotionResult[] = [];
  const consumed = new Set<string>();
  const nowIso = new Date().toISOString();

  for (const [, group] of grouped) {
    if (group.length < policy.minCandidatesForPromotion) continue;

    const first = group[0];
    const userId = first?.user_id;
    const type = first?.type;
    if (!userId || !type) continue;

    const blockName = blockNameForCandidateType(type);
    const existingForBlock = existingBlocks.filter((block) => (
      block.user_id === userId && block.block_name === blockName
    ));
    const latest = pickLatestBlock(existingForBlock);
    const existingItems = latest?.items ?? [];
    const existingKeys = new Set(existingItems.map((item) => canonicalItem(item)));

    const rawItems = group
      .map((candidate) => candidate.summary || candidate.content)
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    const dedupedItems = dedupePreserveOrder(rawItems);
    const newItems = dedupedItems.filter((item) => !existingKeys.has(canonicalItem(item)));

    const candidateIds = dedupePreserveOrder(group.map((candidate) => candidate.candidate_id));
    for (const id of candidateIds) consumed.add(id);

    if (!newItems.length) continue;

    const mergedItems = dedupePreserveOrder([...existingItems, ...newItems]).slice(-policy.maxBlockItems);
    const nextVersion = (latest ? parseBlockVersion(latest.block_id) : 0) + 1;

    const block: MemoryBlock = {
      schema_version: "1.0.0",
      block_id: `${userId}:${blockName}:v${nextVersion}`,
      user_id: userId,
      block_name: blockName,
      operation: "upsert",
      items: mergedItems,
      reason: `promotion confidence>=${policy.confidenceThreshold} count=${group.length}`,
      source_candidate_ids: candidateIds,
      created_at: nowIso,
    };

    results.push({
      block,
      newItems,
      promotedCandidateIds: candidateIds,
    });
  }

  return {
    results,
    consumedCandidateIds: [...consumed],
  };
}
