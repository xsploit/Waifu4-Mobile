import { describe, expect, it } from 'vitest';
import {
  isLikelyVisionModel,
  normalizeTwitchStreamTranscriptionModel,
} from './stream-transcription';

describe('stream transcription helpers', () => {
  it('keeps transcription models on explicit transcription endpoints', () => {
    expect(normalizeTwitchStreamTranscriptionModel('gpt-4o-mini-transcribe')).toBe(
      'openai/gpt-4o-mini-transcribe',
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
});
