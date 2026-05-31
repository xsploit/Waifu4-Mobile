import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";

const ENTITY_BY_FILE_NAME: Record<string, string> = {
  "turn_events.jsonl": "turn_events",
  "memory_candidates.jsonl": "memory_candidates",
  "memory_candidate_archive.jsonl": "memory_candidate_archive",
  "diary_entries.jsonl": "diary_entries",
  "diary_archive.jsonl": "diary_archive",
  "relationship_profiles.jsonl": "relationship_profiles",
  "memory_blocks.jsonl": "memory_blocks",
  "grillo_activity_log.jsonl": "grillo_activity_log",
  "grillo_action_execs.jsonl": "grillo_action_execs",
  "grillo_outreach_dispatch.jsonl": "grillo_outreach_dispatch",
  "chat_context_traces.jsonl": "chat_context_traces",
  "worker_context_traces.jsonl": "worker_context_traces",
  "envelopes.jsonl": "envelopes",
  "memory_slots.jsonl": "memory_slots",
  "memory_slot_patches.jsonl": "memory_slot_patches",
  "emotion_states.jsonl": "emotion_states",
  "chat_links.jsonl": "chat_links",
  "runtime_settings.json": "runtime_settings",
  "discord_bot_state.json": "discord_bot_state",
  "discord_chat_sessions.json": "discord_chat_sessions",
  "memory_worker_state.json": "memory_worker_state",
};

export function entityForDataFile(filePath: string): string | null {
  const file = basename(String(filePath || "")).toLowerCase();
  return ENTITY_BY_FILE_NAME[file] ?? null;
}

export function readJsonObjectFile(filePath: string): Record<string, unknown> | null {
  if (!existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}
