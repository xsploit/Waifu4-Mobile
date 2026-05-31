// @ts-nocheck
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { EmbeddingClient } from "./embedding-client";
import type { ToolDefinition } from "./chat-tools";
import type { MemorySlotPatchRecord, MemorySlotRecord, StorageRepository } from "./storage-repository";
import { applyEmotionSignal, readEmotionState, summarizeEmotionState } from "./emotion-state";

export interface WorkerToolContext {
  userId: string;
  storage: StorageRepository;
  embeddingClient?: EmbeddingClient | null;
  nowIso?: () => string;
  searchFallback?: (
    query: string,
    limit: number,
  ) => Promise<Array<{ id: string; text: string; score: number; metadata?: Record<string, unknown> }>>;
  onDiaryWrite?: (entry: {
    summary: string;
    personal_thought: string;
    tags: string[];
    beat_type?: string;
    content?: string;
    interaction_summary?: string;
    user_message?: string;
    context_tags?: string[];
    involved_users?: string[];
    emotions?: Array<{
      name: string;
      intensity: number;
    }>;
  }) => Promise<{ diary_id: string }>;
  onCandidateWrite?: (entry: {
    type: "preference" | "fact" | "goal" | "boundary" | "bond_signal" | "thread";
    content: string;
    summary: string;
    confidence: number;
    tags?: string[];
    origin_turn_id?: string;
    channel_id?: string;
  }) => Promise<{ candidate_id: string }>;
  onProfilePatch?: (patch: {
    field: "tone_preferences" | "interaction_style" | "boundaries" | "active_threads";
    operation: "add" | "remove";
    value: string;
  }) => Promise<{ ok: boolean }>;
  onMemoryBlockWrite?: (payload: {
    block_name: string;
    items: string[];
    operation: "merge" | "replace";
    reason?: string;
    source_candidate_ids?: string[];
  }) => Promise<{ block_id: string }>;
  onMemoryInsertArchival?: (
    payload: {
      text: string;
      metadata?: Record<string, unknown>;
    },
  ) => Promise<{ id: string; ok: boolean }>;
  onEmotionUpdate?: (
    payload: {
      name: string;
      intensity: number;
      confidence?: number;
      source?: string;
    },
  ) => Promise<{ ok: boolean }>;
  onEmotionGet?: () => Promise<{
    intensities: Record<string, number>;
    top: Array<{ name: string; intensity: number }>;
    updated_at: string;
  }>;
}

export interface WorkerToolBuildOptions {
  includeWriteTools?: boolean;
}

const DEFAULT_BLOCK_NAMES = [
  "preferences",
  "boundaries",
  "relationship_state",
  "ongoing_threads",
  "verified_facts",
  "open_threads",
  "core_identity",
  "working_scratchpad",
] as const;

type WorkerBlockName = (typeof DEFAULT_BLOCK_NAMES)[number];

function nowIso(ctx: WorkerToolContext): string {
  return ctx.nowIso ? ctx.nowIso() : new Date().toISOString();
}

function safeParseArray(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((x) => String(x || "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function dedupeStrings(input: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of input) {
    const normalized = String(item || "").trim();
    if (!normalized.length || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function findSlot(slots: MemorySlotRecord[], userId: string, blockName: string): MemorySlotRecord | null {
  return (
    slots.find((slot) => slot.user_id === userId && slot.slot_name === blockName) ??
    null
  );
}

function lexicalScore(text: string, query: string): number {
  const hay = text.toLowerCase();
  const needle = query.toLowerCase().trim();
  if (!needle.length) return 0;
  let score = hay.includes(needle) ? 1 : 0;
  const parts = needle.split(/\s+/).filter(Boolean);
  for (const part of parts) {
    if (hay.includes(part)) score += 0.2;
  }
  return score;
}

export function buildWorkerTools(
  ctx: WorkerToolContext,
  options: WorkerToolBuildOptions = {},
): Record<string, ToolDefinition> {
  const includeWriteTools = options.includeWriteTools ?? true;

  const tools: Record<string, ToolDefinition> = {
    "core.worker_memory_read": {
      description: "Read current memory state for this user from slots and memory blocks.",
      inputSchema: z.object({
        block_name: z.enum(DEFAULT_BLOCK_NAMES).optional(),
      }),
      timeoutMs: 3000,
      execute: async (args) => {
        const blockName = String(args.block_name || "").trim();
        const slots = ctx.storage.listSlots(ctx.userId);
        const blocks = ctx.storage.readAll<Record<string, unknown>>("memory_blocks");
        const filteredBlocks = blocks.filter((row) => String(row.user_id || "") === ctx.userId);
        if (!blockName.length) {
          return {
            slots: slots.map((slot) => ({
              slot_name: slot.slot_name,
              items: safeParseArray(slot.content_json),
              updated_at: slot.updated_at,
            })),
            memory_blocks: filteredBlocks.slice(-20),
          };
        }
        const slot = findSlot(slots, ctx.userId, blockName);
        return {
          slot: slot
            ? {
                slot_name: slot.slot_name,
                items: safeParseArray(slot.content_json),
                updated_at: slot.updated_at,
              }
            : null,
          memory_blocks: filteredBlocks
            .filter((row) => String(row.block_name || "") === blockName)
            .slice(-10),
        };
      },
    },

    "core.worker_memory_search": {
      description: "Semantic memory search over archival memory for this user.",
      inputSchema: z.object({
        query: z.string().min(1),
        limit: z.number().int().min(1).max(20).optional(),
      }),
      timeoutMs: 6000,
      execute: async (args) => {
        const query = String(args.query || "").trim();
        const limit = Number(args.limit) || 5;
        if (!query.length) return { results: [] };

        if (ctx.embeddingClient) {
          try {
            const res = await ctx.embeddingClient.search(query, ctx.userId, limit);
            return { results: res.results };
          } catch {
            // fallback below
          }
        }

        if (ctx.searchFallback) {
          return { results: await ctx.searchFallback(query, limit) };
        }

        const candidates = ctx.storage
          .readAll<Record<string, unknown>>("memory_candidates")
          .filter((row) => String(row.user_id || "") === ctx.userId);
        const diaries = ctx.storage
          .readAll<Record<string, unknown>>("diary_entries")
          .filter((row) => String(row.user_id || "") === ctx.userId);
        const rows = [
          ...candidates.map((row) => ({
            id: String(row.candidate_id || ""),
            text: `${String(row.summary || "")} ${String(row.content || "")}`.trim(),
            metadata: { source: "candidate" },
          })),
          ...diaries.map((row) => ({
            id: String(row.diary_id || ""),
            text: `${String(row.summary || "")} ${String(row.personal_thought || "")}`.trim(),
            metadata: { source: "diary" },
          })),
        ]
          .filter((row) => row.id.length && row.text.length)
          .map((row) => ({
            id: row.id,
            text: row.text,
            score: lexicalScore(row.text, query),
            metadata: row.metadata,
          }))
          .filter((row) => row.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, limit);
        return { results: rows };
      },
    },

    "core.worker_candidate_list": {
      description: "List recent memory candidates for this user.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(100).optional(),
        type_filter: z
          .enum(["preference", "fact", "goal", "boundary", "bond_signal", "thread"])
          .optional(),
      }),
      timeoutMs: 3000,
      execute: async (args) => {
        const limit = Number(args.limit) || 20;
        const typeFilter = String(args.type_filter || "").trim();
        const rows = ctx.storage
          .readAll<Record<string, unknown>>("memory_candidates")
          .filter((row) => String(row.user_id || "") === ctx.userId)
          .filter((row) => (typeFilter.length ? String(row.type || "") === typeFilter : true));
        return {
          candidates: rows.slice(-limit).reverse(),
        };
      },
    },
  };

  if (!includeWriteTools) return tools;

  tools["core.worker_emotion_get"] = {
    description: "Get current emotional state for this user.",
    inputSchema: z.object({}),
    timeoutMs: 2500,
    execute: async () => {
      if (ctx.onEmotionGet) return ctx.onEmotionGet();
      const state = readEmotionState(ctx.storage, ctx.userId);
      return {
        intensities: state.intensities,
        top: summarizeEmotionState(state).map((row) => ({
          name: row.name,
          intensity: Number(row.intensity.toFixed(2)),
        })),
        updated_at: state.updated_at,
      };
    },
  };

  tools["core.worker_emotion_update"] = {
    description: "Update emotional state with one canonical or mappable emotion signal.",
    inputSchema: z.object({
      name: z.string().min(1),
      intensity: z.number().min(0).max(10),
      confidence: z.number().min(0).max(1).optional(),
      source: z.string().optional(),
    }),
    timeoutMs: 3000,
    execute: async (args) => {
      const payload = {
        name: String(args.name || "").trim(),
        intensity: Number(args.intensity || 0),
        confidence: typeof args.confidence === "number" ? Number(args.confidence) : undefined,
        source: String(args.source || "").trim() || "worker_tool",
      };
      if (ctx.onEmotionUpdate) return ctx.onEmotionUpdate(payload);
      const state = applyEmotionSignal({
        storage: ctx.storage,
        userId: ctx.userId,
        signal: {
          name: payload.name,
          intensity: payload.intensity,
          confidence: payload.confidence,
        },
        source: payload.source,
      });
      return {
        ok: true,
        top: summarizeEmotionState(state).map((row) => ({
          name: row.name,
          intensity: Number(row.intensity.toFixed(2)),
        })),
      };
    },
  };

  tools["core.worker_memory_write"] = {
    description: "Write or merge user memory slot content.",
    inputSchema: z.object({
      block_name: z.enum(DEFAULT_BLOCK_NAMES),
      items: z.array(z.string().min(1)).min(1),
      operation: z.enum(["merge", "replace"]).default("merge"),
      reason: z.string().optional(),
      source_candidate_ids: z.array(z.string()).optional(),
    }),
    timeoutMs: 5000,
    execute: async (args) => {
      const blockName = String(args.block_name) as WorkerBlockName;
      const items = dedupeStrings((args.items as string[]).map((x) => String(x || "").trim()).filter(Boolean));
      const operation = String(args.operation || "merge") === "replace" ? "replace" : "merge";
      const sourceCandidateIds = dedupeStrings(
        Array.isArray(args.source_candidate_ids)
          ? (args.source_candidate_ids as unknown[]).map((x) => String(x || "").trim())
          : [],
      );

      if (ctx.onMemoryBlockWrite) {
        return ctx.onMemoryBlockWrite({
          block_name: blockName,
          items,
          operation,
          reason: String(args.reason || ""),
          source_candidate_ids: sourceCandidateIds,
        });
      }

      const slots = ctx.storage.listSlots(ctx.userId);
      const existing = findSlot(slots, ctx.userId, blockName);
      const existingItems = safeParseArray(existing?.content_json);
      const nextItems = operation === "replace" ? items : dedupeStrings([...existingItems, ...items]);
      const slotId = existing?.slot_id || `${ctx.userId}:${blockName}`;
      const existingSourceIds = safeParseArray(existing?.source_candidate_ids_json);
      const nextSourceIds = dedupeStrings([...existingSourceIds, ...sourceCandidateIds]);
      const now = nowIso(ctx);

      const slotRecord: MemorySlotRecord = {
        schema_version: "1.0.0",
        slot_id: slotId,
        user_id: ctx.userId,
        slot_name: blockName,
        content_json: JSON.stringify(nextItems),
        source_candidate_ids_json: JSON.stringify(nextSourceIds),
        updated_at: now,
      };
      ctx.storage.upsertSlot(slotRecord);

      const patchRecord: MemorySlotPatchRecord = {
        schema_version: "1.0.0",
        patch_id: randomUUID(),
        slot_id: slotId,
        user_id: ctx.userId,
        slot_name: blockName,
        operation: operation === "replace" ? "set" : "merge",
        patch_json: JSON.stringify({ items, reason: String(args.reason || "") }),
        source_candidate_ids_json: JSON.stringify(sourceCandidateIds),
        created_at: now,
      };
      ctx.storage.appendSlotPatch(patchRecord);

      return {
        block_name: blockName,
        slot_id: slotId,
        item_count: nextItems.length,
      };
    },
  };

  tools["core.worker_diary_write"] = {
    description: "Write a diary entry for the current user. The summary is factual; personal_thought must be first person from the assistant's perspective and start with I, I'm, I've, I'd, I'll, My, or Me.",
    inputSchema: z.object({
      summary: z.string().min(1),
      content: z.string().optional(),
      interaction_summary: z.string().optional(),
      user_message: z.string().optional(),
      personal_thought: z
        .string()
        .min(1)
        .describe("First-person personal reflection from the assistant's perspective. Must start with I, I'm, I've, I'd, I'll, My, or Me."),
      tags: z.array(z.string()).min(1),
      context_tags: z.array(z.string()).optional(),
      involved_users: z.array(z.string()).optional(),
      emotions: z
        .array(
          z.object({
            name: z.string().min(1),
            intensity: z.number().min(0).max(10),
          }),
        )
        .optional(),
      beat_type: z.string().optional(),
    }),
    timeoutMs: 4000,
    execute: async (args) => {
      const summary = String(args.summary || "").trim();
      const content = String(args.content || "").trim();
      const interactionSummary = String(args.interaction_summary || "").trim();
      const userMessage = String(args.user_message || "").trim();
      const personalThought = String(args.personal_thought || "").trim();
      const tags = (Array.isArray(args.tags) ? args.tags : [])
        .map((x) => String(x || "").trim())
        .filter(Boolean);
      const contextTags = (Array.isArray(args.context_tags) ? args.context_tags : [])
        .map((x) => String(x || "").trim())
        .filter(Boolean);
      const involvedUsers = (Array.isArray(args.involved_users) ? args.involved_users : [])
        .map((x) => String(x || "").trim())
        .filter(Boolean);
      const emotions = (Array.isArray(args.emotions) ? args.emotions : [])
        .map((raw) => ({
          name: String((raw as Record<string, unknown>)?.name || "").trim(),
          intensity: Number((raw as Record<string, unknown>)?.intensity || 0),
        }))
        .filter((row) => row.name.length > 0 && Number.isFinite(row.intensity))
        .map((row) => ({
          name: row.name,
          intensity: Math.max(0, Math.min(10, row.intensity)),
        }));
      if (!ctx.onDiaryWrite) {
        return { ok: false, reason: "diary_write handler not configured" };
      }
      return ctx.onDiaryWrite({
        summary,
        content: content || undefined,
        interaction_summary: interactionSummary || undefined,
        user_message: userMessage || undefined,
        personal_thought: personalThought,
        tags,
        context_tags: contextTags.length ? contextTags : undefined,
        involved_users: involvedUsers.length ? involvedUsers : undefined,
        emotions: emotions.length ? emotions : undefined,
        beat_type: String(args.beat_type || "").trim() || undefined,
      });
    },
  };

  tools["core.worker_candidate_write"] = {
    description: "Write a durable memory candidate for the current user.",
    inputSchema: z.object({
      type: z.enum(["preference", "fact", "goal", "boundary", "bond_signal", "thread"]),
      content: z.string().min(1),
      summary: z.string().min(1),
      confidence: z.number().min(0).max(1),
      tags: z.array(z.string()).optional(),
      origin_turn_id: z.string().optional(),
      channel_id: z.string().optional(),
    }),
    timeoutMs: 3500,
    execute: async (args) => {
      if (!ctx.onCandidateWrite) return { ok: false, reason: "candidate_write handler not configured" };
      return ctx.onCandidateWrite({
        type: args.type as "preference" | "fact" | "goal" | "boundary" | "bond_signal" | "thread",
        content: String(args.content || "").trim(),
        summary: String(args.summary || "").trim(),
        confidence: Number(args.confidence),
        tags: Array.isArray(args.tags) ? args.tags.map((x) => String(x || "").trim()).filter(Boolean) : [],
        origin_turn_id: String(args.origin_turn_id || "").trim() || undefined,
        channel_id: String(args.channel_id || "").trim() || undefined,
      });
    },
  };

  tools["core.worker_profile_patch"] = {
    description: "Patch relationship profile fields for this user.",
    inputSchema: z.object({
      field: z.enum(["tone_preferences", "interaction_style", "boundaries", "active_threads"]),
      operation: z.enum(["add", "remove"]),
      value: z.string().min(1),
    }),
    timeoutMs: 3000,
    execute: async (args) => {
      if (!ctx.onProfilePatch) return { ok: false, reason: "profile_patch handler not configured" };
      return ctx.onProfilePatch({
        field: args.field as "tone_preferences" | "interaction_style" | "boundaries" | "active_threads",
        operation: args.operation as "add" | "remove",
        value: String(args.value || "").trim(),
      });
    },
  };

  tools["core.worker_memory_insert_archival"] = {
    description: "Insert archival memory text into semantic index.",
    inputSchema: z.object({
      text: z.string().min(1),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }),
    timeoutMs: 5000,
    execute: async (args) => {
      const text = String(args.text || "").trim();
      const metadata = (args.metadata as Record<string, unknown>) || {};
      if (!text.length) return { ok: false, reason: "empty text" };

      if (ctx.onMemoryInsertArchival) {
        return ctx.onMemoryInsertArchival({ text, metadata });
      }

      if (!ctx.embeddingClient) return { ok: false, reason: "embedding client not configured" };
      const id = randomUUID();
      const result = await ctx.embeddingClient.indexDocument({
        id,
        text,
        user_id: ctx.userId,
        metadata,
      });
      return { id, ok: Boolean(result?.ok) };
    },
  };

  return tools;
}
