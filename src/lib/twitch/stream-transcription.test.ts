import { describe, expect, it } from 'vitest';
import {
  TWITCH_STREAM_TRANSCRIPTION_MODEL_OPTIONS,
  getTwitchStreamTranscriptionProvider,
  isLikelyVisionModel,
  normalizeTwitchStreamVisionDetail,
  normalizeTwitchStreamTranscriptionModel,
} from './stream-transcription';

describe('stream transcription helpers', () => {
  it('keeps transcription models on explicit transcription endpoints', () => {
    expect(normalizeTwitchStreamTranscriptionModel('gpt-4o-mini-transcribe')).toBe(
      'openai/whisper-large-v3',
    );
    expect(normalizeTwitchStreamTranscriptionModel('o1-pro-2025-03-19')).toBe(
      'openai/whisper-large-v3',
    );
  });

  it('blocks OpenAI o1 and pro models from stream-frame vision only', () => {
    expect(isLikelyVisionModel('vercel-gateway', 'o1')).toBe(false);
    expect(isLikelyVisionModel('vercel-gateway', 'openai/o1-pro-2025-03-19')).toBe(false);
    expect(isLikelyVisionModel('vercel-gateway', 'gpt-5_4-pro-2026-03-05')).toBe(false);
    expect(isLikelyVisionModel('vercel-gateway', 'gpt-5_5-2026-04-23')).toBe(true);
    expect(isLikelyVisionModel('openrouter-responses', 'google/gemini-2.5-pro')).toBe(true);
  });

  it('normalizes Twitch stream frame detail to supported capture modes', () => {
    expect(normalizeTwitchStreamVisionDetail('high')).toBe('high');
    expect(normalizeTwitchStreamVisionDetail('auto')).toBe('auto');
    expect(normalizeTwitchStreamVisionDetail('low')).toBe('low');
    expect(normalizeTwitchStreamVisionDetail('weird')).toBe('low');
    expect(normalizeTwitchStreamVisionDetail(undefined)).toBe('low');
  });

  it('routes Twitch stream transcription models to the required provider key lane', () => {
    expect(getTwitchStreamTranscriptionProvider('fish-audio/asr')).toBe('fish-speech');
    expect(getTwitchStreamTranscriptionProvider('openai/whisper-large-v3')).toBe('openrouter');
    expect(getTwitchStreamTranscriptionProvider('bad-model')).toBe('openrouter');
  });

  it('exposes only models the Twitch ASR normalizer accepts', () => {
    const values = TWITCH_STREAM_TRANSCRIPTION_MODEL_OPTIONS.map((option) => option.value);

    expect(values).toContain('fish-audio/asr');
    values.forEach((value) => {
      expect(normalizeTwitchStreamTranscriptionModel(value)).toBe(value);
    });
  });
});
