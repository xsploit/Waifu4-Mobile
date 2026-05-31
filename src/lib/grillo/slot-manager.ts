import { randomUUID } from "node:crypto";
import type { MemoryBlock } from "./memory-promotion";
import type { MemorySlotPatchRecord, MemorySlotRecord, StorageRepository } from "./storage-repository";

export type SlotName =
  | "core_identity"
  | "relationship_state"
  | "user_facts"
  | "preferences"
  | "boundaries"
  | "ongoing_threads"
  | "working_scratchpad";

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = String(value || "").replace(/\s+/g, " ").trim();
    if (!normalized.length) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

function toSlotName(blockName: MemoryBlock["block_name"]): SlotName {
  if (blockName === "preferences") return "preferences";
  if (blockName === "boundaries") return "boundaries";
  if (blockName === "relationship_state") return "relationship_state";
  if (blockName === "ongoing_topics") return "ongoing_threads";
  if (blockName === "ongoing_threads") return "ongoing_threads";
  if (blockName === "verified_facts") return "user_facts";
  if (blockName === "core_identity") return "core_identity";
  if (blockName === "working_scratchpad") return "working_scratchpad";
  return "ongoing_threads";
}

function readSlotItems(slot: MemorySlotRecord | null): string[] {
  if (!slot) return [];
  try {
    const parsed = JSON.parse(slot.content_json);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((x) => String(x || "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function readSourceIds(slot: MemorySlotRecord | null): string[] {
  if (!slot) return [];
  try {
    const parsed = JSON.parse(slot.source_candidate_ids_json);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((x) => String(x || "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export function applyPromotedBlockToSlots(
  repository: StorageRepository,
  block: MemoryBlock,
): MemorySlotRecord {
  const slotName = toSlotName(block.block_name);
  const slotId = `${block.user_id}:${slotName}`;
  const existing = repository
    .listSlots(block.user_id)
    .find((slot) => slot.slot_id === slotId) || null;
  const mergedItems = dedupe([...readSlotItems(existing), ...block.items]);
  const mergedSources = dedupe([...readSourceIds(existing), ...block.source_candidate_ids]).slice(-500);

  const next: MemorySlotRecord = {
    schema_version: "1.0.0",
    slot_id: slotId,
    user_id: block.user_id,
    slot_name: slotName,
    content_json: JSON.stringify(mergedItems),
    source_candidate_ids_json: JSON.stringify(mergedSources),
    updated_at: new Date().toISOString(),
  };
  repository.upsertSlot(next);

  const patch: MemorySlotPatchRecord = {
    schema_version: "1.0.0",
    patch_id: randomUUID(),
    slot_id: slotId,
    user_id: block.user_id,
    slot_name: slotName,
    operation: "merge",
    patch_json: JSON.stringify({
      block_id: block.block_id,
      block_name: block.block_name,
      items: block.items,
      reason: block.reason,
    }),
    source_candidate_ids_json: JSON.stringify(block.source_candidate_ids),
    created_at: new Date().toISOString(),
  };
  repository.appendSlotPatch(patch);
  return next;
}
