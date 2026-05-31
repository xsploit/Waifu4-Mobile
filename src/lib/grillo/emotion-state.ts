import type { StorageRepository } from "./storage-repository";

export type CanonicalEmotion =
  | "happy"
  | "sad"
  | "angry"
  | "fear"
  | "disgust"
  | "surprised"
  | "neutral"
  | "relaxed";

export interface EmotionIntensities {
  happy: number;
  sad: number;
  angry: number;
  fear: number;
  disgust: number;
  surprised: number;
  neutral: number;
  relaxed: number;
}

export interface EmotionStateRecord {
  schema_version: "1.0.0";
  state_id: string;
  user_id: string;
  intensities: EmotionIntensities;
  last_signal_source?: string;
  last_signal_at?: string;
  updated_at: string;
}

export interface EmotionSignal {
  name: string;
  intensity: number; // 0..10
  confidence?: number; // 0..1
}

export interface ApplyEmotionSignalArgs {
  storage: StorageRepository;
  userId: string;
  signal: EmotionSignal;
  source?: string;
  nowIso?: string;
  decayTauSec?: number;
  decayThreshold?: number;
}

const EMOTION_KEYS: CanonicalEmotion[] = [
  "happy",
  "sad",
  "angry",
  "fear",
  "disgust",
  "surprised",
  "neutral",
  "relaxed",
];

const EMOTION_MAP: Record<string, CanonicalEmotion> = {
  happy: "happy",
  happiness: "happy",
  joy: "happy",
  excited: "happy",
  sad: "sad",
  sadness: "sad",
  depressed: "sad",
  angry: "angry",
  anger: "angry",
  mad: "angry",
  fear: "fear",
  afraid: "fear",
  anxious: "fear",
  anxiety: "fear",
  disgust: "disgust",
  disgusted: "disgust",
  grossed_out: "disgust",
  surprised: "surprised",
  surprise: "surprised",
  shocked: "surprised",
  neutral: "neutral",
  calm: "relaxed",
  relaxed: "relaxed",
};

const OPPOSITES: Partial<Record<CanonicalEmotion, CanonicalEmotion>> = {
  happy: "sad",
  sad: "happy",
  angry: "relaxed",
  relaxed: "angry",
  fear: "neutral",
  neutral: "fear",
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function nowIso(input?: string): string {
  if (input && Number.isFinite(Date.parse(input))) return input;
  return new Date().toISOString();
}

function emotionStateId(userId: string): string {
  return `emotion:${userId}`;
}

export function emptyEmotionIntensities(): EmotionIntensities {
  return {
    happy: 0,
    sad: 0,
    angry: 0,
    fear: 0,
    disgust: 0,
    surprised: 0,
    neutral: 0,
    relaxed: 0,
  };
}

export function canonicalEmotionName(name: string): CanonicalEmotion {
  const normalized = String(name || "").toLowerCase().trim().replace(/\s+/g, "_");
  return EMOTION_MAP[normalized] || "neutral";
}

export function decayEmotionState(
  state: EmotionStateRecord,
  targetNowIso?: string,
  decayTauSec = 3600,
  decayThreshold = 0.05,
): EmotionStateRecord {
  const now = nowIso(targetNowIso);
  const fromMs = Date.parse(state.last_signal_at || state.updated_at || now);
  const toMs = Date.parse(now);
  const elapsedSec = Math.max(0, (toMs - fromMs) / 1000);
  const tau = Math.max(60, decayTauSec);
  const factor = Math.exp(-elapsedSec / tau);

  const nextIntensities = { ...state.intensities };
  for (const key of EMOTION_KEYS) {
    const value = clamp((nextIntensities[key] || 0) * factor, 0, 10);
    nextIntensities[key] = value < decayThreshold ? 0 : value;
  }
  return {
    ...state,
    intensities: nextIntensities,
    updated_at: now,
  };
}

export function readEmotionState(
  storage: StorageRepository,
  userId: string,
  targetNowIso?: string,
  decayTauSec = 3600,
  decayThreshold = 0.05,
): EmotionStateRecord {
  const rows = storage
    .readAll<Record<string, unknown>>("emotion_states")
    .filter((row) => String(row["user_id"] || "") === userId);
  const latest = rows[rows.length - 1];
  const base: EmotionStateRecord = rows.length
    ? ({
        schema_version: "1.0.0",
        state_id: String(latest?.["state_id"] || emotionStateId(userId)),
        user_id: userId,
        intensities: {
          ...emptyEmotionIntensities(),
          ...(latest?.["intensities"] as EmotionIntensities),
        },
        last_signal_source: String(latest?.["last_signal_source"] || "") || undefined,
        last_signal_at: String(latest?.["last_signal_at"] || "") || undefined,
        updated_at: String(latest?.["updated_at"] || new Date().toISOString()),
      } as EmotionStateRecord)
    : {
        schema_version: "1.0.0",
        state_id: emotionStateId(userId),
        user_id: userId,
        intensities: emptyEmotionIntensities(),
        updated_at: nowIso(targetNowIso),
      };
  return decayEmotionState(base, targetNowIso, decayTauSec, decayThreshold);
}

export function writeEmotionState(storage: StorageRepository, state: EmotionStateRecord): EmotionStateRecord {
  const rows = storage
    .readAll<Record<string, unknown>>("emotion_states")
    .filter((row) => String(row["user_id"] || "") !== state.user_id);
  rows.push(state as unknown as Record<string, unknown>);
  storage.replaceAll("emotion_states", rows);
  return state;
}

export function applyEmotionSignal(args: ApplyEmotionSignalArgs): EmotionStateRecord {
  const now = nowIso(args.nowIso);
  const confidence = clamp(Number(args.signal.confidence ?? 1), 0, 1);
  const signalIntensity = clamp(Number(args.signal.intensity || 0), 0, 10);
  const canonical = canonicalEmotionName(args.signal.name);

  const current = readEmotionState(
    args.storage,
    args.userId,
    now,
    args.decayTauSec ?? 3600,
    args.decayThreshold ?? 0.05,
  );
  const next = { ...current.intensities };

  const blend = 0.45 + confidence * 0.35;
  const previous = next[canonical] || 0;
  next[canonical] = clamp(previous * (1 - blend) + signalIntensity * blend, 0, 10);

  const opposite = OPPOSITES[canonical];
  if (opposite) {
    const reduction = signalIntensity * 0.25 * confidence;
    next[opposite] = clamp((next[opposite] || 0) - reduction, 0, 10);
  }

  const updated: EmotionStateRecord = {
    ...current,
    intensities: next,
    last_signal_source: args.source || "unknown",
    last_signal_at: now,
    updated_at: now,
  };

  return writeEmotionState(args.storage, updated);
}

export function summarizeEmotionState(
  state: EmotionStateRecord,
  limit = 3,
): Array<{ name: CanonicalEmotion; intensity: number }> {
  return EMOTION_KEYS
    .map((name) => ({ name, intensity: clamp(state.intensities[name] || 0, 0, 10) }))
    .filter((row) => row.intensity > 0.05)
    .sort((a, b) => b.intensity - a.intensity)
    .slice(0, Math.max(1, limit));
}
