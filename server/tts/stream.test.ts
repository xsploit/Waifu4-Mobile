import type { Request } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readTtsStreamProviderKey } from './stream';

function requestWithTtsKey(value?: string): Request {
  return {
    headers: value === undefined ? {} : { 'x-yourwifey-tts-provider-key': value },
  } as Request;
}

describe('TTS stream provider key routing', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses the request-scoped Account tab key before env fallback', () => {
    vi.stubEnv('FISH_AUDIO_API_KEY', 'fish-env-key');
    vi.stubEnv('INWORLD_API_KEY', 'inworld-env-key');

    expect(readTtsStreamProviderKey(requestWithTtsKey('browser-key'), 'fish')).toBe(
      'browser-key',
    );
    expect(readTtsStreamProviderKey(requestWithTtsKey('browser-key'), 'inworld')).toBe(
      'browser-key',
    );
  });

  it('keeps Fish and Inworld env fallbacks provider-specific', () => {
    vi.stubEnv('FISH_AUDIO_API_KEY', 'fish-env-key');
    vi.stubEnv('FISHSPEECH_API_KEY', '');
    vi.stubEnv('INWORLD_API_KEY', 'inworld-env-key');

    expect(readTtsStreamProviderKey(requestWithTtsKey(), 'fish')).toBe('fish-env-key');
    expect(readTtsStreamProviderKey(requestWithTtsKey(), 'inworld')).toBe('inworld-env-key');
  });

  it('does not use a Fish env key for Inworld streams', () => {
    vi.stubEnv('FISH_AUDIO_API_KEY', 'fish-env-key');
    vi.stubEnv('FISHSPEECH_API_KEY', '');
    vi.stubEnv('INWORLD_API_KEY', '');

    expect(readTtsStreamProviderKey(requestWithTtsKey(), 'inworld')).toBe('');
  });
});
