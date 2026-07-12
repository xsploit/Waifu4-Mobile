import { transcribe } from 'ai';
import { createGateway } from '@ai-sdk/gateway';

export type AudioTranscriptionProvider = 'fish-speech' | 'openrouter' | 'vercel-gateway';

export type TranscribeAudioOptions = {
  apiBaseUrl?: string;
  apiKey: string;
  audio: Uint8Array;
  fetch?: typeof globalThis.fetch;
  model: string;
  provider: AudioTranscriptionProvider;
};

export type AudioTranscript = {
  model: string;
  text: string;
};

type TranscriptionErrorBody = {
  error?: { message?: string };
  text?: string;
};

export function normalizeTranscriptText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

export function normalizeTranscriptionProviderLabel(provider: AudioTranscriptionProvider) {
  switch (provider) {
    case 'openrouter':
      return 'OpenRouter';
    case 'vercel-gateway':
      return 'Vercel AI Gateway';
    case 'fish-speech':
    default:
      return 'Fish Speech';
  }
}

export function resolveFishAsrUrl(baseUrl: string | undefined) {
  const raw = baseUrl?.trim() || 'https://api.fish.audio';
  const withoutTrailingSlash = raw.replace(/\/+$/, '');
  if (withoutTrailingSlash.endsWith('/v1')) {
    return `${withoutTrailingSlash}/asr`;
  }
  return `${withoutTrailingSlash.replace(/\/v1\/.*$/i, '')}/v1/asr`;
}

function resolveOpenRouterModel(model: string) {
  return model.trim() || 'openai/whisper-large-v3';
}

function requireApiKey(provider: AudioTranscriptionProvider, apiKey: string) {
  if (!apiKey.trim()) {
    throw new Error(`${normalizeTranscriptionProviderLabel(provider)} provider key is not configured.`);
  }
}

function requireUsableText(provider: AudioTranscriptionProvider, text: string) {
  const normalized = normalizeTranscriptText(text);
  if (!normalized) {
    throw new Error(
      `${normalizeTranscriptionProviderLabel(provider)} transcription returned no usable speech.`,
    );
  }
  return normalized;
}

async function readJson(response: Response) {
  return (await response.json().catch(() => ({}))) as TranscriptionErrorBody;
}

async function transcribeWithOpenRouter(options: TranscribeAudioOptions): Promise<AudioTranscript> {
  const response = await (options.fetch ?? globalThis.fetch)(
    `${(options.apiBaseUrl ?? 'https://openrouter.ai/api/v1').replace(/\/+$/, '')}/audio/transcriptions`,
    {
      body: JSON.stringify({
        input_audio: {
          data: Buffer.from(options.audio).toString('base64'),
          format: 'wav',
        },
        model: resolveOpenRouterModel(options.model),
      }),
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    },
  );
  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(
      data.error?.message ||
        `${normalizeTranscriptionProviderLabel(options.provider)} transcription failed with HTTP ${response.status}.`,
    );
  }
  return {
    model: resolveOpenRouterModel(options.model),
    text: requireUsableText(options.provider, data.text ?? ''),
  };
}

async function transcribeWithFish(options: TranscribeAudioOptions): Promise<AudioTranscript> {
  const response = await (options.fetch ?? globalThis.fetch)(resolveFishAsrUrl(options.apiBaseUrl), {
    body: JSON.stringify({
      audio: Buffer.from(options.audio).toString('base64'),
      ignore_timestamps: true,
    }),
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });
  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(
      data.error?.message ||
        `${normalizeTranscriptionProviderLabel(options.provider)} transcription failed with HTTP ${response.status}.`,
    );
  }
  return {
    model: 'fish-audio/asr',
    text: requireUsableText(options.provider, data.text ?? ''),
  };
}

async function transcribeWithVercelGateway(options: TranscribeAudioOptions): Promise<AudioTranscript> {
  const gateway = createGateway({
    apiKey: options.apiKey,
    ...(options.apiBaseUrl ? { baseURL: options.apiBaseUrl.replace(/\/+$/, '') } : {}),
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  const model = options.model.trim() || 'openai/whisper-1';
  const result = await transcribe({
    audio: options.audio,
    maxRetries: 0,
    model: gateway.transcription(model),
  });
  return {
    model,
    text: requireUsableText(options.provider, result.text),
  };
}

/**
 * Transcribe a WAV audio buffer without coupling the provider request to its source.
 * Fish and OpenRouter retain their existing HTTP request contracts; Vercel uses AI SDK 7.
 */
export async function transcribeAudio(options: TranscribeAudioOptions): Promise<AudioTranscript> {
  requireApiKey(options.provider, options.apiKey);

  switch (options.provider) {
    case 'openrouter':
      return transcribeWithOpenRouter(options);
    case 'vercel-gateway':
      return transcribeWithVercelGateway(options);
    case 'fish-speech':
      return transcribeWithFish(options);
  }
}
