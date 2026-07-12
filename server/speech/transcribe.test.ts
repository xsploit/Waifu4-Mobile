import { afterEach, describe, expect, it, vi } from 'vitest';
import { transcribeAudio } from './transcribe';

const audio = Buffer.from('wav audio');

describe('transcribeAudio', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the OpenRouter audio transcription request contract', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ text: '  hello\nworld  ' })));

    await expect(
      transcribeAudio({
        apiBaseUrl: 'https://openrouter.example/api/v1/',
        apiKey: 'openrouter-key',
        audio,
        fetch,
        model: '',
        provider: 'openrouter',
      }),
    ).resolves.toEqual({ model: 'openai/whisper-large-v3', text: 'hello world' });

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://openrouter.example/api/v1/audio/transcriptions');
    expect(init).toMatchObject({
      headers: {
        Authorization: 'Bearer openrouter-key',
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });
    expect(JSON.parse(String(init.body))).toEqual({
      input_audio: { data: audio.toString('base64'), format: 'wav' },
      model: 'openai/whisper-large-v3',
    });
  });

  it('keeps the Fish ASR request contract', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ text: 'actual stream speech' })));

    await expect(
      transcribeAudio({
        apiBaseUrl: 'https://fish.example/v1/tts',
        apiKey: 'fish-key',
        audio,
        fetch,
        model: 'ignored',
        provider: 'fish-speech',
      }),
    ).resolves.toEqual({ model: 'fish-audio/asr', text: 'actual stream speech' });

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://fish.example/v1/asr');
    expect(init).toMatchObject({
      headers: {
        Authorization: 'Bearer fish-key',
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });
    expect(JSON.parse(String(init.body))).toEqual({
      audio: audio.toString('base64'),
      ignore_timestamps: true,
    });
  });

  it('uses the AI SDK Gateway transcription model', async () => {
    const fetch = vi.fn(async () =>
      new Response(JSON.stringify({ text: 'gateway stream speech', segments: [] }), { status: 200 }),
    );

    await expect(
      transcribeAudio({
        apiBaseUrl: 'https://gateway.example/v4/ai',
        apiKey: 'gateway-key',
        audio,
        fetch,
        model: '',
        provider: 'vercel-gateway',
      }),
    ).resolves.toEqual({ model: 'openai/whisper-1', text: 'gateway stream speech' });

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://gateway.example/v4/ai/transcription-model');
    expect(init).toMatchObject({
      headers: expect.objectContaining({
        'ai-model-id': 'openai/whisper-1',
        'ai-transcription-model-specification-version': '4',
        authorization: 'Bearer gateway-key',
      }),
      method: 'POST',
    });
    expect(JSON.parse(String(init.body))).toEqual({
      audio: audio.toString('base64'),
      mediaType: 'audio/wav',
      providerOptions: {},
    });
  });

  it('uses a source-neutral error for empty provider transcription text', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ text: '   ' })));

    await expect(
      transcribeAudio({
        apiKey: 'openrouter-key',
        audio,
        fetch,
        model: 'openai/whisper-large-v3',
        provider: 'openrouter',
      }),
    ).rejects.toThrow('OpenRouter transcription returned no usable speech.');
  });
});
