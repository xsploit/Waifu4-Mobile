import type { AffectState } from './types';
import { EMOTION_VAD_DEFAULTS, type AssistantReplyMetadata } from './reply-metadata';

export function createDefaultAffectState(): AffectState {
  return {
    arousal: 0.18,
    dominance: 0,
    label: 'neutral',
    lastEmotion: 'neutral',
    updatedAt: null,
    valence: 0,
  };
}

export function normalizeAffectState(value: unknown): AffectState {
  if (!value || typeof value !== 'object') {
    return createDefaultAffectState();
  }
  const source = value as Partial<AffectState>;
  return {
    arousal: clamp01(Number(source.arousal ?? 0.18)),
    dominance: clampSigned(Number(source.dominance ?? 0)),
    label: String(source.label ?? 'neutral').trim().slice(0, 32) || 'neutral',
    lastEmotion: String(source.lastEmotion ?? 'neutral').trim().slice(0, 32) || 'neutral',
    updatedAt:
      typeof source.updatedAt === 'number' && Number.isFinite(source.updatedAt)
        ? Math.max(0, source.updatedAt)
        : null,
    valence: clampSigned(Number(source.valence ?? 0)),
  };
}

export function getMetadataVad(metadata: AssistantReplyMetadata | null) {
  if (!metadata) {
    return EMOTION_VAD_DEFAULTS.neutral;
  }
  return {
    arousal: clamp01(metadata.arousal ?? EMOTION_VAD_DEFAULTS[metadata.emotion].arousal),
    dominance: clampSigned(metadata.dominance ?? EMOTION_VAD_DEFAULTS[metadata.emotion].dominance),
    valence: clampSigned(metadata.valence ?? EMOTION_VAD_DEFAULTS[metadata.emotion].valence),
  };
}

export function updateAffectState(
  current: AffectState | undefined,
  metadata: AssistantReplyMetadata,
  now = Date.now(),
): AffectState {
  const base = normalizeAffectState(current);
  const incoming = getMetadataVad(metadata);
  const elapsedMs = base.updatedAt ? Math.max(0, now - base.updatedAt) : 0;
  const decay = Math.exp(-elapsedMs / (1000 * 60 * 45));
  const oldWeight = base.updatedAt ? 0.72 * decay : 0;
  const newWeight = 1 - oldWeight;
  const next = {
    arousal: clamp01(base.arousal * oldWeight + incoming.arousal * newWeight),
    dominance: clampSigned(base.dominance * oldWeight + incoming.dominance * newWeight),
    valence: clampSigned(base.valence * oldWeight + incoming.valence * newWeight),
  };
  return {
    ...next,
    label: labelAffect(next),
    lastEmotion: metadata.emotion,
    updatedAt: now,
  };
}

export function buildAffectBridgePromptBlock(state: AffectState | undefined) {
  const affect = normalizeAffectState(state);
  return [
    'Affect bridge state is private continuity for tone and body language, not dialogue to mention.',
    `Current mood vector: label=${affect.label}, valence=${affect.valence.toFixed(2)}, arousal=${affect.arousal.toFixed(2)}, dominance=${affect.dominance.toFixed(2)}, lastEmotion=${affect.lastEmotion}.`,
    'Let this gently bias the reply emotion and delivery. Do not announce the vector or say you have an affect bridge.',
  ].join('\n');
}

export function getAffectExpressionBoost(state: AffectState | undefined) {
  const affect = normalizeAffectState(state);
  return Math.max(0, Math.min(0.24, affect.arousal * 0.18 + Math.abs(affect.valence) * 0.06));
}

function labelAffect(state: Pick<AffectState, 'arousal' | 'dominance' | 'valence'>) {
  if (state.valence <= -0.45 && state.arousal >= 0.58) return 'heated';
  if (state.valence <= -0.35 && state.arousal < 0.45) return 'low';
  if (state.valence >= 0.5 && state.arousal >= 0.62) return 'bright';
  if (state.valence >= 0.42) return 'warm';
  if (state.arousal >= 0.68) return 'keyed-up';
  if (state.dominance >= 0.5) return 'confident';
  if (state.dominance <= -0.45) return 'uncertain';
  return 'steady';
}

function clamp01(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function clampSigned(value: number) {
  return Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
}
