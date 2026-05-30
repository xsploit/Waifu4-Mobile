export type TtsCredentials = {
  ttsKey: string;
};

export type TtsStreamRequest = {
  text: string;
  provider?: 'fish' | 'inworld';
  voiceId?: string;
  backend?: 's1' | 's2-pro';
  format?: 'pcm' | 'mp3' | 'wav' | 'opus';
  sampleRate?: number;
  chunkLength?: number;
  latency?: 'normal' | 'balanced';
  conditionOnPreviousChunks?: boolean;
  inworldTransport?: 'http' | 'websocket';
  inworldModelId?: string;
  timestampType?: 'NONE' | 'WORD' | 'CHARACTER';
  timestampTransportStrategy?: 'SYNC' | 'ASYNC';
  deliveryMode?: 'STABLE' | 'BALANCED' | 'CREATIVE' | 'EXPRESSIVE';
  bufferCharThreshold?: number;
  maxBufferDelayMs?: number;
  autoMode?: boolean;
};

export type TtsPhoneInfo = {
  phoneSymbol?: string;
  startTimeSeconds?: number;
  durationSeconds?: number;
  visemeSymbol?: string;
};

export type TtsTimestampInfo = {
  wordAlignment?: {
    words?: string[];
    wordStartTimeSeconds?: number[];
    wordEndTimeSeconds?: number[];
    phoneticDetails?: Array<{
      wordIndex?: number;
      phones?: TtsPhoneInfo[];
    }>;
  };
  characterAlignment?: {
    characters?: string[];
    characterStartTimeSeconds?: number[];
    characterEndTimeSeconds?: number[];
  };
};

export type TtsTimingSummary = {
  timestampChunks: number;
  words: number;
  phonemes: number;
  visemes: number;
};

export type TtsAudioEvent = {
  type: 'audio';
  audio: Uint8Array;
  format: 'pcm' | 'mp3' | 'wav' | 'opus';
  sampleRate?: number;
  timestamps?: TtsTimestampInfo;
};

export type TtsStreamEvent =
  | TtsAudioEvent
  | {
      type: 'done';
      stats: {
        firstAudioMs: number | null;
        chunks: number;
        bytes: number;
        totalMs: number;
        transport?: string;
        timestampChunks?: number;
        words?: number;
        phonemes?: number;
        visemes?: number;
      };
    }
  | { type: 'error'; error: string };

type WireTtsEvent = {
  type?: unknown;
  audio?: unknown;
  format?: unknown;
  sampleRate?: unknown;
  timestamps?: unknown;
  stats?: unknown;
  error?: unknown;
};

export function createNdjsonParser() {
  let buffer = '';
  return {
    push(chunk: string): WireTtsEvent[] {
      buffer += chunk;
      const events: WireTtsEvent[] = [];
      let idx: number;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (line) {
          events.push(JSON.parse(line) as WireTtsEvent);
        }
      }
      return events;
    },
    finish(): WireTtsEvent[] {
      const line = buffer.trim();
      buffer = '';
      return line ? [JSON.parse(line) as WireTtsEvent] : [];
    },
  };
}

export function base64ToBytes(value: string): Uint8Array {
  if (typeof atob === 'function') {
    const bin = atob(value);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) {
      out[i] = bin.charCodeAt(i);
    }
    return out;
  }
  return new Uint8Array(Buffer.from(value, 'base64'));
}

function toTtsEvent(ev: WireTtsEvent): TtsStreamEvent | null {
  if (ev.type === 'audio' && typeof ev.audio === 'string') {
    return {
      type: 'audio',
      audio: base64ToBytes(ev.audio),
      format: ev.format === 'mp3' || ev.format === 'wav' || ev.format === 'opus' ? ev.format : 'pcm',
      sampleRate: typeof ev.sampleRate === 'number' ? ev.sampleRate : undefined,
      timestamps:
        ev.timestamps && typeof ev.timestamps === 'object' ? (ev.timestamps as TtsTimestampInfo) : undefined,
    };
  }
  if (ev.type === 'done') {
    const stats = (ev.stats && typeof ev.stats === 'object' ? ev.stats : {}) as Record<string, unknown>;
    return {
      type: 'done',
      stats: {
        firstAudioMs: typeof stats.firstAudioMs === 'number' ? stats.firstAudioMs : null,
        chunks: typeof stats.chunks === 'number' ? stats.chunks : 0,
        bytes: typeof stats.bytes === 'number' ? stats.bytes : 0,
        totalMs: typeof stats.totalMs === 'number' ? stats.totalMs : 0,
        transport: typeof stats.transport === 'string' ? stats.transport : undefined,
        timestampChunks: typeof stats.timestampChunks === 'number' ? stats.timestampChunks : undefined,
        words: typeof stats.words === 'number' ? stats.words : undefined,
        phonemes: typeof stats.phonemes === 'number' ? stats.phonemes : undefined,
        visemes: typeof stats.visemes === 'number' ? stats.visemes : undefined,
      },
    };
  }
  if (ev.type === 'error') {
    return { type: 'error', error: String(ev.error ?? 'TTS stream error') };
  }
  return null;
}

export async function* streamTts(
  request: TtsStreamRequest,
  creds: TtsCredentials,
  signal?: AbortSignal,
): AsyncGenerator<TtsStreamEvent> {
  const res = await fetch('/tts/stream', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-yourwifey-tts-provider-key': creds.ttsKey,
    },
    body: JSON.stringify({
      text: request.text,
      provider: request.provider ?? 'fish',
      voiceId: request.voiceId,
      backend: request.backend ?? 's2-pro',
      format: request.format ?? 'pcm',
      sampleRate: request.sampleRate ?? (request.provider === 'inworld' ? 48000 : 44100),
      chunkLength: request.chunkLength,
      latency: request.latency ?? 'balanced',
      conditionOnPreviousChunks: request.conditionOnPreviousChunks ?? true,
      inworldTransport: request.inworldTransport,
      inworldModelId: request.inworldModelId,
      timestampType: request.timestampType,
      timestampTransportStrategy: request.timestampTransportStrategy,
      deliveryMode: request.deliveryMode,
      bufferCharThreshold: request.bufferCharThreshold,
      maxBufferDelayMs: request.maxBufferDelayMs,
      autoMode: request.autoMode,
    }),
    signal,
  });

  if (!res.ok || !res.body) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) {
        message = body.error;
      }
    } catch {
      /* keep status message */
    }
    yield { type: 'error', error: message };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const parser = createNdjsonParser();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      const rawEvents = done ? parser.finish() : parser.push(decoder.decode(value, { stream: true }));
      for (const raw of rawEvents) {
        const ev = toTtsEvent(raw);
        if (ev) {
          yield ev;
        }
      }
      if (done) {
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
