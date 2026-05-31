import type { Request } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFishTtsEnvKey, readProviderKeys } from './providerKeys';

function requestWithHeaders(headers: Request['headers'] = {}): Request {
  return { headers } as Request;
}

describe('provider key routing', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses the request-scoped TTS key before Fish env fallback', () => {
    vi.stubEnv('FISH_AUDIO_API_KEY', 'fish-env-key');

    expect(
      readProviderKeys(
        requestWithHeaders({ 'x-yourwifey-tts-provider-key': 'browser-fish-key' }),
      ).ttsKey,
    ).toBe('browser-fish-key');
  });

  it('accepts both Fish Speech env aliases for backend fallback compatibility', () => {
    vi.stubEnv('FISH_AUDIO_API_KEY', '');
    vi.stubEnv('FISH_SPEECH_API_KEY', 'fish-speech-env-key');
    vi.stubEnv('FISHSPEECH_API_KEY', '');

    expect(readFishTtsEnvKey()).toBe('fish-speech-env-key');

    vi.stubEnv('FISH_SPEECH_API_KEY', '');
    vi.stubEnv('FISHSPEECH_API_KEY', 'fishspeech-env-key');

    expect(readFishTtsEnvKey()).toBe('fishspeech-env-key');
  });
});
