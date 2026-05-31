import { getDesktopBackendUrl } from '../desktop/runtime';

export type RemoteTtsProvider = 'fish-speech' | 'inworld';
export type RemoteTtsMode = 'live-bridge' | 'full-response' | 'sentence-chunks';
export type FishSpeechVoiceScope = 'all' | 'mine' | 'public';
export type FishSpeechLatency = 'balanced' | 'normal';
export type InworldDeliveryMode = 'STABLE' | 'BALANCED' | 'CREATIVE';

export type RemoteTtsRequest = {
  provider: RemoteTtsProvider;
  text: string;
  streamingMode?: RemoteTtsMode;
  voiceId?: string;
  modelId?: string;
  latency?: FishSpeechLatency;
  conditionOnPreviousChunks?: boolean;
  chunkLength?: number;
  deliveryMode?: InworldDeliveryMode;
  bufferCharThreshold?: number;
};

export type RemoteTtsAudioChunk = {
  audioBlob: Blob;
  mimeType: string;
  sampleRate?: number | null;
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

export type RemoteTtsProxyOptions = {
  providerApiKey?: string | null;
};

type RemoteTtsStreamEvent =
  | {
      type: 'audio';
      audio: string;
      mimeType?: string;
      sampleRate?: number;
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

function parseRemoteTtsStreamEvent(line: string): RemoteTtsStreamEvent {
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
      const mimeType = event.mimeType || 'audio/mpeg';
      queue.push({
        audioBlob: new Blob([base64ToBytes(event.audio)], { type: mimeType }),
        mimeType,
        sampleRate: event.sampleRate ?? null,
      });
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
        body: JSON.stringify(request),
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
  const response = await fetch(getTtsProxyUrl('/tts/voices/create'), {
    method: 'POST',
    headers: buildRemoteTtsHeaders(options),
    body: JSON.stringify({
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
    }),
  });
  if (!response.ok) {
    throw new Error(`Remote TTS voice creation failed with HTTP ${response.status}.`);
  }

  const data = (await response.json()) as {
    ok?: boolean;
    error?: string;
    voice?: CreatedRemoteTtsVoice;
  };
  if (!data.ok || !data.voice) {
    throw new Error(data.error || 'Remote TTS voice creation failed.');
  }
  return data.voice;
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
