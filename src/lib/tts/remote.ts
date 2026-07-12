import { getDesktopBackendUrl } from '../desktop/runtime';
import { clampInteger } from '../../shared/number';

export type RemoteTtsProvider = 'fish-speech' | 'inworld';
type RemoteTtsMode = 'live-bridge' | 'full-response' | 'early-chunks' | 'sentence-chunks';
type FishSpeechVoiceScope = 'all' | 'mine' | 'public';
type FishSpeechLatency = 'balanced' | 'normal';
type FishSpeechFormat = 'pcm' | 'mp3' | 'wav' | 'opus';
type FishSpeechLiveChunkingStrategy = 'app' | 'python-safe' | 'eager';
type InworldDeliveryMode = 'STABLE' | 'BALANCED' | 'CREATIVE' | 'EXPRESSIVE';
type InworldTimestampType = 'NONE' | 'WORD' | 'CHARACTER';
type InworldTimestampTransportStrategy = 'SYNC' | 'ASYNC';
export type RemoteTtsOutputMode = 'local-only' | 'discord-only' | 'local+discord' | 'external';

export type RemoteTtsRequest = {
  provider: RemoteTtsProvider;
  text: string;
  streamingMode?: RemoteTtsMode;
  voiceId?: string;
  modelId?: string;
  fishTransport?: 'websocket' | 'timestamp-sse';
  format?: FishSpeechFormat;
  sampleRate?: number;
  latency?: FishSpeechLatency;
  conditionOnPreviousChunks?: boolean;
  chunkLength?: number;
  minBufferChars?: number;
  maxBufferChars?: number;
  softBufferChars?: number;
  chunkingStrategy?: FishSpeechLiveChunkingStrategy;
  inworldTransport?: 'http' | 'websocket';
  timestampType?: InworldTimestampType;
  timestampTransportStrategy?: InworldTimestampTransportStrategy;
  deliveryMode?: InworldDeliveryMode;
  bufferCharThreshold?: number;
  maxBufferDelayMs?: number;
  autoMode?: boolean;
  outputMode?: RemoteTtsOutputMode;
  ttsSessionId?: string;
  utteranceId?: string;
  segmentIndex?: number;
};

export type RemoteTtsAudioChunk = {
  audioBlob: Blob;
  mimeType: string;
  sampleRate?: number | null;
  speechTiming?: unknown;
  timestamps?: unknown;
};

export type RemoteTtsVoice = {
  provider: RemoteTtsProvider;
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  languages?: string[];
  source?: string;
};

export type CreateRemoteTtsVoiceRequest = {
  provider: RemoteTtsProvider;
  name: string;
  sampleFile: File;
  description?: string;
  language?: string;
  transcription?: string;
  tags?: string[];
  removeBackgroundNoise?: boolean;
  enhanceAudioQuality?: boolean;
  visibility?: 'public' | 'unlist' | 'private';
};

export type CreatedRemoteTtsVoice = RemoteTtsVoice & {
  modelId?: string;
  status?: string;
};

export type DesignRemoteTtsVoiceRequest = {
  provider: RemoteTtsProvider;
  instruction: string;
  previewText?: string;
  language?: string;
  n?: number;
  speed?: number;
  numStep?: number;
  guidanceScale?: number;
  instructGuidanceScale?: number;
  seed?: number | null;
};

export type DesignedRemoteTtsVoiceCandidate = {
  provider: RemoteTtsProvider;
  id: string;
  index: number;
  audioBase64: string;
  sampleRate?: number;
  durationMs?: number;
  text?: string | null;
  instruction?: string | null;
  language?: string | null;
  previewVoiceId?: string;
};

export type DesignRemoteTtsVoiceResult = {
  candidates: DesignedRemoteTtsVoiceCandidate[];
};

export type PublishDesignedRemoteTtsVoiceRequest = {
  provider: RemoteTtsProvider;
  voiceId: string;
  name: string;
  description?: string;
  tags?: string[];
};

export type RemoteTtsProxyOptions = {
  providerApiKey?: string | null;
};

export type RemoteTtsProxyRequest = {
  backend?: 's1' | 's2-pro' | 's2.1-pro-free';
  bufferCharThreshold?: number;
  chunkLength?: number;
  conditionOnPreviousChunks?: boolean;
  deliveryMode?: InworldDeliveryMode;
  fishTransport?: 'websocket' | 'timestamp-sse';
  format?: 'pcm' | 'mp3' | 'wav' | 'opus';
  inworldModelId?: string;
  inworldTransport?: 'http' | 'websocket';
  latency?: FishSpeechLatency;
  maxBufferDelayMs?: number;
  provider: 'fish' | 'inworld';
  sampleRate?: number;
  text: string;
  timestampTransportStrategy?: InworldTimestampTransportStrategy;
  timestampType?: InworldTimestampType;
  voiceId?: string;
  autoMode?: boolean;
  outputMode?: RemoteTtsOutputMode;
  ttsSessionId?: string;
  utteranceId?: string;
  segmentIndex?: number;
};

export type RemoteTtsStreamEvent =
  | {
      type: 'audio';
      audio: string;
      format?: string;
      mimeType?: string;
      sampleRate?: number;
      speechTiming?: unknown;
      timestamps?: unknown;
    }
  | {
      type: 'done';
      ok?: boolean;
    }
  | {
      type: 'error';
      ok?: false;
      error?: string;
    };

export function parseRemoteTtsStreamEvent(line: string): RemoteTtsStreamEvent {
  try {
    return JSON.parse(line) as RemoteTtsStreamEvent;
  } catch {
    throw new Error('Remote TTS proxy returned a malformed stream event.');
  }
}

const TTS_PROXY_URL = (import.meta.env['VITE_TTS_PROXY_URL'] || '').trim();
const TTS_PROVIDER_KEY_HEADER = 'x-yourwifey-tts-provider-key';

function getTtsProxyUrl(path = '/tts/stream') {
  const desktopUrl = getDesktopBackendUrl(path);
  if (desktopUrl) {
    return desktopUrl;
  }

  if (TTS_PROXY_URL) {
    const url = new URL(TTS_PROXY_URL, window.location.href);
    if (path !== '/tts/stream') {
      const normalizedPath = path.startsWith('/') ? path : `/${path}`;
      url.pathname = url.pathname.replace(/\/tts\/stream\/?$/, normalizedPath);
      if (!url.pathname.endsWith(normalizedPath)) {
        url.pathname = normalizedPath;
      }
      url.search = '';
    }
    return url.toString();
  }

  const url = new URL(`/api${path}`, window.location.href);
  return url.toString();
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function getRemoteAudioMimeType(event: Extract<RemoteTtsStreamEvent, { type: 'audio' }>) {
  if (event.mimeType) {
    return event.mimeType;
  }
  switch (event.format) {
    case 'pcm':
      return 'audio/pcm';
    case 'wav':
      return 'audio/wav';
    case 'opus':
      return 'audio/ogg; codecs=opus';
    case 'mp3':
    default:
      return 'audio/mpeg';
  }
}

function normalizeFishBackend(value: string | undefined) {
  const model = value?.trim().toLowerCase();
  if (model === 's1') {
    return 's1' as const;
  }
  if (model === 's2' || model === 's2-pro') {
    return 's2-pro' as const;
  }
  if (model === 's2.1-pro-free') {
    return 's2.1-pro-free' as const;
  }
  return undefined;
}

export function createRemoteTtsProxyRequest(request: RemoteTtsRequest): RemoteTtsProxyRequest {
  if (request.provider === 'inworld') {
    return {
      provider: 'inworld',
      text: request.text,
      voiceId: request.voiceId,
      inworldModelId: request.modelId,
      inworldTransport: request.inworldTransport ?? 'http',
      sampleRate: request.sampleRate,
      timestampType: request.timestampType,
      timestampTransportStrategy: request.timestampTransportStrategy,
      deliveryMode: request.deliveryMode,
      bufferCharThreshold: clampInteger(request.bufferCharThreshold, 1, 1000),
      maxBufferDelayMs: clampInteger(request.maxBufferDelayMs, 0, 10000),
      autoMode: request.autoMode,
      outputMode: request.outputMode,
      ttsSessionId: request.ttsSessionId,
      utteranceId: request.utteranceId,
      segmentIndex: request.segmentIndex,
    };
  }

  return {
    provider: 'fish',
    text: request.text,
    voiceId: request.voiceId,
    backend: normalizeFishBackend(request.modelId),
    fishTransport: request.fishTransport ?? 'websocket',
    format: request.format ?? 'pcm',
    sampleRate: request.sampleRate ?? 44100,
    latency: request.latency,
    conditionOnPreviousChunks: request.conditionOnPreviousChunks,
    chunkLength: clampInteger(request.chunkLength, 100, 300),
    outputMode: request.outputMode,
    ttsSessionId: request.ttsSessionId,
    utteranceId: request.utteranceId,
    segmentIndex: request.segmentIndex,
  };
}

export function remoteTtsStreamEventToAudioChunk(
  event: RemoteTtsStreamEvent,
): RemoteTtsAudioChunk | null {
  if (event.type !== 'audio') {
    return null;
  }
  const mimeType = getRemoteAudioMimeType(event);
  return {
    audioBlob: new Blob([base64ToBytes(event.audio)], { type: mimeType }),
    mimeType,
    sampleRate: event.sampleRate ?? null,
    speechTiming: event.speechTiming,
    timestamps: event.timestamps,
  };
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read voice sample.'));
    reader.onload = () => {
      const value = String(reader.result ?? '');
      const commaIndex = value.indexOf(',');
      resolve(commaIndex === -1 ? value : value.slice(commaIndex + 1));
    };
    reader.readAsDataURL(file);
  });
}

async function postRemoteTtsJson<T>(
  path: string,
  body: unknown,
  options: RemoteTtsProxyOptions,
  label: string,
  select: (data: { error?: string; ok?: boolean } & Record<string, unknown>) => T | undefined,
) {
  const response = await fetch(getTtsProxyUrl(path), {
    method: 'POST',
    headers: buildRemoteTtsHeaders(options),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${label} failed with HTTP ${response.status}.`);
  }

  const data = (await response.json()) as { error?: string; ok?: boolean } & Record<string, unknown>;
  const value = data.ok ? select(data) : undefined;
  if (!value) {
    throw new Error(data.error || `${label} failed.`);
  }
  return value;
}

export function createRemoteTtsStream(
  request: RemoteTtsRequest,
  signal?: AbortSignal,
  options: RemoteTtsProxyOptions = {},
): AsyncIterable<RemoteTtsAudioChunk> {
  const queue: RemoteTtsAudioChunk[] = [];
  const waiters: Array<() => void> = [];
  let done = false;
  let failure: Error | null = null;

  const wake = () => {
    while (waiters.length > 0) {
      waiters.shift()?.();
    }
  };

  const waitForEvent = () =>
    new Promise<void>((resolve) => {
      waiters.push(resolve);
    });

  const handleEvent = (event: RemoteTtsStreamEvent) => {
    if (event.type === 'audio') {
      const chunk = remoteTtsStreamEventToAudioChunk(event);
      if (chunk) {
        queue.push(chunk);
      }
      wake();
      return;
    }

    if (event.type === 'error') {
      failure = new Error(event.error || 'Remote TTS stream failed.');
      done = true;
      wake();
      return;
    }

    done = true;
    wake();
  };

  void (async () => {
    try {
      const response = await fetch(getTtsProxyUrl('/tts/stream'), {
        method: 'POST',
        headers: buildRemoteTtsHeaders(options),
        body: JSON.stringify(createRemoteTtsProxyRequest(request)),
        signal,
      });
      if (!response.ok) {
        throw new Error(`Remote TTS proxy failed with HTTP ${response.status}.`);
      }
      if (!response.body) {
        const data = (await response.json()) as { ok?: boolean; error?: string };
        if (!data.ok) {
          throw new Error(data.error || 'Remote TTS proxy returned no stream.');
        }
        done = true;
        wake();
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (line.trim()) {
            handleEvent(parseRemoteTtsStreamEvent(line));
          }
        }
      }

      buffer += decoder.decode();
      if (buffer.trim()) {
        handleEvent(parseRemoteTtsStreamEvent(buffer));
      }
      done = true;
      wake();
    } catch (error) {
      if (signal?.aborted) {
        done = true;
        wake();
        return;
      }
      failure = error instanceof Error ? error : new Error(String(error));
      done = true;
      wake();
    }
  })();

  return {
    async *[Symbol.asyncIterator]() {
      while (true) {
        if (queue.length > 0) {
          yield queue.shift()!;
          continue;
        }
        if (failure) {
          throw failure;
        }
        if (done) {
          return;
        }
        await waitForEvent();
      }
    },
  };
}

export async function fetchRemoteTtsVoices(
  provider: RemoteTtsProvider,
  options: { fishScope?: FishSpeechVoiceScope; providerApiKey?: string | null } = {},
) {
  const url = new URL(getTtsProxyUrl('/tts/voices'));
  url.searchParams.set('provider', provider);
  if (provider === 'fish-speech' && options.fishScope) {
    url.searchParams.set('scope', options.fishScope);
  }
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: buildRemoteTtsHeaders(options, { acceptJson: true }),
  });
  if (!response.ok) {
    throw new Error(`Remote TTS voice fetch failed with HTTP ${response.status}.`);
  }

  const data = (await response.json()) as {
    ok?: boolean;
    error?: string;
    voices?: RemoteTtsVoice[];
  };
  if (!data.ok) {
    throw new Error(data.error || 'Remote TTS voice fetch failed.');
  }
  return data.voices ?? [];
}

export async function createRemoteTtsVoice(
  request: CreateRemoteTtsVoiceRequest,
  options: RemoteTtsProxyOptions = {},
) {
  const sampleBase64 = await fileToBase64(request.sampleFile);
  return postRemoteTtsJson<CreatedRemoteTtsVoice>(
    '/tts/voices/create',
    {
      provider: request.provider,
      name: request.name,
      sampleBase64,
      sampleFileName: request.sampleFile.name,
      sampleMimeType: request.sampleFile.type,
      description: request.description,
      language: request.language,
      transcription: request.transcription,
      tags: request.tags,
      removeBackgroundNoise: request.removeBackgroundNoise,
      enhanceAudioQuality: request.enhanceAudioQuality,
      visibility: request.visibility,
    },
    options,
    'Remote TTS voice creation',
    (data) => data.voice as CreatedRemoteTtsVoice | undefined,
  );
}

export async function designRemoteTtsVoice(
  request: DesignRemoteTtsVoiceRequest,
  options: RemoteTtsProxyOptions = {},
) {
  return postRemoteTtsJson<DesignRemoteTtsVoiceResult>(
    '/tts/voices/design',
    request,
    options,
    'Remote TTS voice design',
    (data) => data.result as DesignRemoteTtsVoiceResult | undefined,
  );
}

export async function publishDesignedRemoteTtsVoice(
  request: PublishDesignedRemoteTtsVoiceRequest,
  options: RemoteTtsProxyOptions = {},
) {
  return postRemoteTtsJson<CreatedRemoteTtsVoice>(
    '/tts/voices/design/publish',
    request,
    options,
    'Remote TTS voice publish',
    (data) => data.voice as CreatedRemoteTtsVoice | undefined,
  );
}

function buildRemoteTtsHeaders(
  options: RemoteTtsProxyOptions,
  requestOptions: { acceptJson?: boolean } = {},
) {
  const headers: Record<string, string> = requestOptions.acceptJson
    ? { Accept: 'application/json' }
    : { 'Content-Type': 'application/json' };
  const providerApiKey = options.providerApiKey?.trim();
  if (providerApiKey) {
    headers[TTS_PROVIDER_KEY_HEADER] = providerApiKey;
  }
  return headers;
}
