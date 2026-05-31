import type { StorageRepository } from "./storage-repository";
import { readEmotionState, summarizeEmotionState } from "./emotion-state";

export type ReflectionBeatType =
  | "extraction"
  | "memory_consolidation"
  | "self_reflection"
  | "curiosity"
  | "relationship"
  | "tag_elaboration";

export interface ReflectionContextMessage {
  role: string;
  content: string;
  author: string;
  timestamp: string;
}

export interface ReflectionContextInput {
  userId: string;
  storage: StorageRepository;
  newMessages: ReflectionContextMessage[];
  beatType?: ReflectionBeatType | string;
  timeZone?: string;
  nowIso?: string;
  semanticRecall?: Array<{
    id?: string;
    text: string;
    score?: number;
    source?: string;
  }>;
  maxSlotChars?: number;
  maxProfileChars?: number;
  maxDiaryChars?: number;
  maxMessageChars?: number;
  maxSemanticRecallChars?: number;
  maxEmotionChars?: number;
}

export interface ReflectionContext {
  systemPrompt: string;
  userPrompt: string;
}

const BEAT_DESCRIPTIONS: Record<string, string> = {
  extraction: "Extract durable memory signals from new messages.",
  memory_consolidation: "Consolidate memory blocks, remove redundancy, strengthen durable facts.",
  self_reflection: "Reflect on interaction patterns and relationship changes.",
  curiosity: "Identify curiosity and future exploration threads.",
  relationship: "Update relationship-state signals, tone preferences, and boundaries.",
  tag_elaboration: "Elaborate recurring themes/tags and connect related signals.",
};

function compact(input: string, maxLen = 220): string {
  const text = String(input || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}...`;
}

function safeParseStringArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((x) => String(x || "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function capByCharBudget(lines: string[], maxChars: number): string[] {
  if (maxChars <= 0) return [];
  const out: string[] = [];
  let used = 0;
  for (const line of lines) {
    const next = line.length + 1;
    if (used + next > maxChars) break;
    out.push(line);
    used += next;
  }
  return out;
}

function formatDateParts(date: Date, timeZone: string): { localDate: string; localTime: string } {
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const timeParts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const find = (parts: Intl.DateTimeFormatPart[], type: string) => parts.find((part) => part.type === type)?.value || "";
  const yyyy = find(dateParts, "year");
  const mm = find(dateParts, "month");
  const dd = find(dateParts, "day");
  const hh = find(timeParts, "hour");
  const min = find(timeParts, "minute");
  const ss = find(timeParts, "second");
  return {
    localDate: yyyy && mm && dd ? `${yyyy}-${mm}-${dd}` : date.toISOString().slice(0, 10),
    localTime: hh && min && ss ? `${hh}:${min}:${ss}` : date.toISOString().slice(11, 19),
  };
}

export function buildReflectionContext(input: ReflectionContextInput): ReflectionContext {
  const beatType = String(input.beatType || "extraction").trim() || "extraction";
  const beatDescription = BEAT_DESCRIPTIONS[beatType] || "Reflect and update memory state.";
  const now = input.nowIso ? new Date(input.nowIso) : new Date();
  const validNow = Number.isFinite(now.getTime()) ? now : new Date();
  const currentIso = validNow.toISOString();
  const currentTimezone = String(input.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const { localDate, localTime } = formatDateParts(validNow, currentTimezone);
  const maxSlotChars = Math.max(400, Number(input.maxSlotChars ?? 2000));
  const maxProfileChars = Math.max(240, Number(input.maxProfileChars ?? 700));
  const maxDiaryChars = Math.max(300, Number(input.maxDiaryChars ?? 1500));
  const maxMessageChars = Math.max(500, Number(input.maxMessageChars ?? 3000));
  const maxSemanticRecallChars = Math.max(220, Number(input.maxSemanticRecallChars ?? 900));
  const maxEmotionChars = Math.max(120, Number(input.maxEmotionChars ?? 480));

  const slots = input.storage.listSlots(input.userId);
  const slotLinesRaw = slots
    .map((slot) => {
      const items = safeParseStringArray(slot.content_json).slice(0, 16);
      if (!items.length) return "";
      const rendered = items.map((item) => `- ${compact(item, 180)}`).join("\n");
      return `[${slot.slot_name}] (${items.length} items)\n${rendered}`;
    })
    .filter(Boolean);
  const slotLines = capByCharBudget(slotLinesRaw, maxSlotChars);

  const diaryRows = input.storage
    .readAll<Record<string, unknown>>("diary_entries")
    .filter((row) => String(row["user_id"] || "") === input.userId)
    .slice(-6)
    .reverse()
    .map((row) => {
      const beat = String(row["beat_type"] || "reflection");
      const summary = compact(String(row["summary"] || ""), 140);
      const thought = compact(String(row["personal_thought"] || ""), 180);
      return `(${beat}) ${summary} | thought: ${thought}`;
    });
  const diaryLines = capByCharBudget(diaryRows, maxDiaryChars);

  const profileRows = input.storage
    .readAll<Record<string, unknown>>("relationship_profiles")
    .filter((row) => String(row["user_id"] || "") === input.userId)
    .slice(-1)
    .flatMap((row) => {
      const tones = Array.isArray(row["tone_preferences"])
        ? row["tone_preferences"].map((x) => compact(String(x || ""), 80))
        : [];
      const styles = Array.isArray(row["interaction_style"])
        ? row["interaction_style"].map((x) => compact(String(x || ""), 80))
        : [];
      const boundaries = Array.isArray(row["boundaries"])
        ? row["boundaries"].map((x) => compact(String(x || ""), 80))
        : [];
      const threads = Array.isArray(row["active_threads"])
        ? row["active_threads"].map((x) => compact(String(x || ""), 80))
        : [];
      return [
        tones.length ? `tone_preferences: ${tones.join(", ")}` : "",
        styles.length ? `interaction_style: ${styles.join(", ")}` : "",
        boundaries.length ? `boundaries: ${boundaries.join(", ")}` : "",
        threads.length ? `active_threads: ${threads.join(", ")}` : "",
      ].filter(Boolean);
    });
  const profileLines = capByCharBudget(profileRows, maxProfileChars);

  const emotionState = readEmotionState(input.storage, input.userId, currentIso);
  const emotionRows = summarizeEmotionState(emotionState, 4).map(
    (row) => `${row.name}: ${Number(row.intensity).toFixed(2)}/10`,
  );
  const emotionLines = capByCharBudget(emotionRows, maxEmotionChars);

  const messageRows = input.newMessages.map((m) => {
    const role = m.role === "assistant" ? "Assistant" : m.author || "User";
    return `- ${role}: ${compact(m.content, 260)}`;
  });
  const messageLines = capByCharBudget(messageRows, maxMessageChars);

  const semanticRows = (Array.isArray(input.semanticRecall) ? input.semanticRecall : [])
    .map((item) => {
      const source = String(item.source || "").trim();
      const score =
        typeof item.score === "number" && Number.isFinite(item.score)
          ? ` score=${Number(item.score).toFixed(3)}`
          : "";
      const src = source.length ? `${source}${score}` : score.trim();
      const prefix = src.length ? `[${src.trim()}] ` : "";
      return `- ${prefix}${compact(String(item.text || ""), 220)}`;
    })
    .filter((line) => line.length > 2);
  const semanticLines = capByCharBudget(semanticRows, maxSemanticRecallChars);

  const systemPrompt = [
    "You are the background sleep-time memory agent.",
    "Operate carefully with durable memory and relationship state.",
    "Use available tools to read/search memory before deciding updates.",
    "Avoid inventing facts; ground updates in explicit evidence.",
    "Write diary personal_thought fields in first person from your perspective: what I noticed, felt, expected, or learned.",
    "The personal_thought must start with I, I'm, I've, I'd, I'll, My, or Me.",
    "Keep diary summaries factual and third-person if useful, but personal_thought must not read like an analyst note about 'the user'.",
    "",
    `Beat type: ${beatType}`,
    `Beat objective: ${beatDescription}`,
    `Current datetime (ISO): ${currentIso}`,
    `Current local date: ${localDate}`,
    `Current local time: ${localTime}`,
    `Current timezone: ${currentTimezone}`,
    "",
    "Current memory slots:",
    slotLines.length ? slotLines.join("\n\n") : "- (none)",
    "",
    "Latest relationship profile:",
    profileLines.length ? profileLines.join("\n") : "- (none)",
    "",
    "Current emotion state:",
    emotionLines.length ? emotionLines.join("\n") : "- (none)",
    "",
    "Recent diary context:",
    diaryLines.length ? diaryLines.join("\n") : "- (none)",
    "",
    "Semantic recall:",
    semanticLines.length ? semanticLines.join("\n") : "- (none)",
  ].join("\n");

  const userPrompt = [
    "New messages to process:",
    messageLines.length ? messageLines.join("\n") : "- (none)",
    "",
    `Task for beat '${beatType}': ${beatDescription}`,
    "Review memory state, then produce a concise grounded output.",
  ].join("\n");

  return { systemPrompt, userPrompt };
}
