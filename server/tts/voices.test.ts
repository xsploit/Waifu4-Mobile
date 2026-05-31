import type { Request, Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleCreateTtsVoice, handleListTtsVoices } from './voices';

const inworldClient = vi.hoisted(() => ({
  cloneVoice: vi.fn(),
  listVoices: vi.fn(),
}));

const inworldTts = vi.hoisted(() => vi.fn(() => inworldClient));

vi.mock('@inworld/tts', () => ({
  InworldTTS: inworldTts,
}));

const fishClient = vi.hoisted(() => ({
  voices: {
    ivc: { create: vi.fn() },
    search: vi.fn(),
  },
}));

const fishAudioClient = vi.hoisted(() => vi.fn(() => fishClient));

vi.mock('fish-audio', () => ({
  FishAudioClient: fishAudioClient,
}));

function createMockResponse() {
  const response = {
    body: undefined as unknown,
    statusCode: 200,
    json: vi.fn((body: unknown) => {
      response.body = body;
      return response;
    }),
    status: vi.fn((statusCode: number) => {
      response.statusCode = statusCode;
      return response;
    }),
  };
  return response;
}

function createMockRequest(input: Partial<Request>): Request {
  return {
    body: {},
    headers: {},
    query: {},
    ...input,
  } as Request;
}

describe('TTS voice routes', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('returns a keyed error instead of a dead route when listing voices without credentials', async () => {
    vi.stubEnv('FISH_AUDIO_API_KEY', '');
    vi.stubEnv('FISH_SPEECH_API_KEY', '');
    vi.stubEnv('FISHSPEECH_API_KEY', '');
    vi.stubEnv('INWORLD_API_KEY', '');
    const res = createMockResponse();

    await handleListTtsVoices(
      createMockRequest({ query: { provider: 'fish-speech' } }),
      res as unknown as Response,
    );

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ ok: false, error: 'Missing TTS provider key', voices: [] });
  });

  it('validates voice creation before provider calls', async () => {
    const res = createMockResponse();

    await handleCreateTtsVoice(
      createMockRequest({
        body: {
          provider: 'fish-speech',
          name: '',
          sampleBase64: '',
        },
      }),
      res as unknown as Response,
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ ok: false });
    expect(String((res.body as { error?: string }).error)).toContain('Too small');
  });

  it('uses the Inworld env key for Inworld voice listing instead of a Fish fallback key', async () => {
    vi.stubEnv('FISH_AUDIO_API_KEY', 'fish-env-key');
    vi.stubEnv('FISH_SPEECH_API_KEY', '');
    vi.stubEnv('FISHSPEECH_API_KEY', '');
    vi.stubEnv('INWORLD_API_KEY', 'inworld-env-key');
    inworldClient.listVoices.mockResolvedValueOnce([
      { voiceId: 'voice-1', displayName: 'Voice One', langCode: 'EN_US' },
    ]);
    const res = createMockResponse();

    await handleListTtsVoices(
      createMockRequest({ query: { provider: 'inworld' } }),
      res as unknown as Response,
    );

    expect(inworldTts).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'inworld-env-key' }));
    expect(res.body).toMatchObject({
      ok: true,
      voices: [{ id: 'voice-1', name: 'Voice One', provider: 'inworld' }],
    });
  });
});
