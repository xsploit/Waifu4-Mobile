import { FishAudioClient, RealtimeEvents } from 'fish-audio';
import { createLogger } from '../../src/shared/logger';

const log = createLogger('tts');

export type FishBackend = 's1' | 's2-pro';
export type FishFormat = 'pcm' | 'mp3' | 'wav' | 'opus';

export type FishTransport = 'websocket' | 'timestamp-sse';

export type FishStreamRequest = {
  apiKey: string;
  text: string;
  textSegments?: string[];
  voiceId?: string; // reference_id
  backend?: FishBackend; // default s2-pro (D9)
  format?: FishFormat; // default pcm (low-latency playback)
  sampleRate?: number; // pcm only, default 44100
  chunkLength?: number; // default 200
  latency?: 'normal' | 'balanced'; // default balanced (D10)
  conditionOnPreviousChunks?: boolean; // default true (D9/D10)
  signal?: AbortSignal;
};

export type FishStreamStats = {
  firstAudioMs: number | null;
  chunks: number;
  bytes: number;
  totalMs: number;
  transport?: FishTransport;
  timestampChunks?: number;
  words?: number;
  phonemes?: number;
  visemes?: number;
};

export type FishTextStream = AsyncIterable<string>;

type FishTimestampSegment = {
  text: string;
  start: number;
  end: number;
  globalStart: number;
  globalEnd: number;
};

type FishTimestampInfo = {
  wordAlignment: {
    words: string[];
    wordStartTimeSeconds: number[];
    wordEndTimeSeconds: number[];
  };
  fishAlignment: {
    content?: string;
    chunkSeq: number;
    chunkAudioOffsetSec: number;
    audioDuration?: number;
    segments: FishTimestampSegment[];
  };
};

type FishTimestampWireEvent = {
  audio_base64?: unknown;
  content?: unknown;
  chunk_seq?: unknown;
  chunk_audio_offset_sec?: unknown;
  alignment?: {
    audio_duration?: unknown;
    segments?: Array<{
      text?: unknown;
      start?: unknown;
      end?: unknown;
    }>;
  } | null;
};

/**
 * Stream TTS audio from Fish via the official SDK's realtime WebSocket.
 * `onAudio` receives raw audio chunks as they arrive (streaming-first, D10).
 * Resolves with latency/throughput stats, or rejects on error/abort.
 */
export async function streamFishTts(
  req: FishStreamRequest,
  onAudio: (chunk: Uint8Array) => void,
): Promise<FishStreamStats> {
  async function* textStream(): FishTextStream {
    if (req.textSegments?.length) {
      for (const segment of req.textSegments) {
        if (segment) {
          yield segment;
        }
      }
      return;
    }
    yield req.text;
  }

  return streamFishTtsTextStream(req, textStream(), onAudio);
}

export async function streamFishTtsTextStream(
  req: FishStreamRequest,
  textStream: FishTextStream,
  onAudio: (chunk: Uint8Array) => void,
): Promise<FishStreamStats> {
  const format: FishFormat = req.format ?? 'pcm';
  const started = Date.now();
  let firstAudioAt: number | null = null;
  let chunks = 0;
  let bytes = 0;

  const client = new FishAudioClient({ apiKey: req.apiKey });

  // condition_on_previous_chunks isn't in the 0.1.0 TTSRequest type but the wire
  // protocol forwards it (prosody continuity across chunks — keep true).
  const request = {
    text: '',
    reference_id: req.voiceId,
    format,
    sample_rate: format === 'pcm' ? (req.sampleRate ?? 44100) : undefined,
    chunk_length: req.chunkLength ?? 200,
    latency: req.latency ?? 'balanced',
    normalize: true,
    condition_on_previous_chunks: req.conditionOnPreviousChunks ?? true,
  };

  // The 0.1.0 SDK's Backends type lags the API (no 's2-pro' yet), but the wire
  // 'model' header accepts it — cast so S2 (our default, D9) works.
  const connection = await client.textToSpeech.convertRealtime(
    request as Parameters<typeof client.textToSpeech.convertRealtime>[0],
    textStream,
    (req.backend ?? 's2-pro') as unknown as Parameters<
      typeof client.textToSpeech.convertRealtime
    >[2],
  );

  return await new Promise<FishStreamStats>((resolve, reject) => {
    const finishStats = (): FishStreamStats => ({
      firstAudioMs: firstAudioAt === null ? null : firstAudioAt - started,
      chunks,
      bytes,
      totalMs: Date.now() - started,
    });

    const onAbort = () => {
      try {
        connection.close();
      } catch {
        /* already closing */
      }
      reject(new Error('TTS stream aborted'));
    };
    req.signal?.addEventListener('abort', onAbort, { once: true });

    connection.on(RealtimeEvents.AUDIO_CHUNK, (audio: unknown) => {
      const buf =
        audio instanceof Uint8Array
          ? audio
          : Buffer.isBuffer(audio)
            ? new Uint8Array(audio)
            : null;
      if (!buf || buf.length === 0) {
        return;
      }
      firstAudioAt ??= Date.now();
      chunks += 1;
      bytes += buf.length;
      onAudio(buf);
    });

    connection.on(RealtimeEvents.ERROR, (err: unknown) => {
      req.signal?.removeEventListener('abort', onAbort);
      const message = err instanceof Error ? err.message : String(err);
      log.error('tts stream error', { backend: req.backend ?? 's2-pro', error: message });
      reject(new Error(message));
    });

    connection.on(RealtimeEvents.CLOSE, () => {
      req.signal?.removeEventListener('abort', onAbort);
      const stats = finishStats();
      log.info('tts done', { ...stats, backend: req.backend ?? 's2-pro', format });
      resolve(stats);
    });
  });
}

export async function streamFishTimestampTts(
  req: FishStreamRequest,
  onAudio: (chunk: Uint8Array, meta: { timestamps?: FishTimestampInfo }) => void,
): Promise<FishStreamStats> {
  const format: FishFormat = req.format ?? 'pcm';
  const sampleRate = format === 'pcm' ? (req.sampleRate ?? 44100) : undefined;
  const started = Date.now();
  let firstAudioAt: number | null = null;
  let chunks = 0;
  let bytes = 0;
  const alignments = new Map<number, FishTimestampInfo>();

  const res = await fetch('https://api.fish.audio/v1/tts/stream/with-timestamp', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${req.apiKey}`,
      'Content-Type': 'application/json',
      model: req.backend ?? 's2-pro',
    },
    body: JSON.stringify({
      text: req.text,
      reference_id: req.voiceId,
      format,
      sample_rate: sampleRate,
      chunk_length: req.chunkLength ?? 200,
      latency: req.latency ?? 'balanced',
      normalize: true,
      condition_on_previous_chunks: req.conditionOnPreviousChunks ?? true,
    }),
    signal: req.signal,
  });

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => '');
    throw new Error(`Fish timestamp SSE failed: HTTP ${res.status}${body ? ` ${body.slice(0, 240)}` : ''}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const handleEvent = (eventText: string) => {
    const data = eventText
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')
      .trim();
    if (!data) {
      return;
    }
    const event = JSON.parse(data) as FishTimestampWireEvent;
    const audioBase64 = typeof event.audio_base64 === 'string' ? event.audio_base64 : undefined;
    const timestamps = normalizeFishTimestampEvent(event);
    if (timestamps) {
      alignments.set(timestamps.fishAlignment.chunkSeq, timestamps);
    }
    if (!audioBase64) {
      return;
    }
    const audio = Buffer.from(audioBase64, 'base64');
    if (audio.length === 0) {
      return;
    }
    firstAudioAt ??= Date.now();
    chunks += 1;
    bytes += audio.length;
    onAudio(audio, { timestamps });
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() ?? '';
      for (const eventText of events) {
        handleEvent(eventText);
      }
      if (done) {
        break;
      }
      if (req.signal?.aborted) {
        throw new Error('TTS stream aborted');
      }
    }
    if (buffer.trim()) {
      handleEvent(buffer);
    }
  } finally {
    reader.releaseLock();
  }

  const words = [...alignments.values()].reduce(
    (total, item) => total + item.wordAlignment.words.length,
    0,
  );
  const stats = {
    firstAudioMs: firstAudioAt === null ? null : firstAudioAt - started,
    chunks,
    bytes,
    totalMs: Date.now() - started,
    transport: 'timestamp-sse' as const,
    timestampChunks: alignments.size,
    words,
    phonemes: 0,
    visemes: 0,
  };
  log.info('tts done', { ...stats, backend: req.backend ?? 's2-pro', format });
  return stats;
}

function normalizeFishTimestampEvent(event: FishTimestampWireEvent): FishTimestampInfo | undefined {
  const chunkSeq = typeof event.chunk_seq === 'number' ? event.chunk_seq : 0;
  const offset = typeof event.chunk_audio_offset_sec === 'number' ? event.chunk_audio_offset_sec : 0;
  const rawSegments = event.alignment?.segments ?? [];
  const segments = rawSegments.flatMap((segment): FishTimestampSegment[] => {
    if (
      typeof segment.text !== 'string' ||
      typeof segment.start !== 'number' ||
      typeof segment.end !== 'number'
    ) {
      return [];
    }
    return [
      {
        text: segment.text,
        start: segment.start,
        end: segment.end,
        globalStart: offset + segment.start,
        globalEnd: offset + segment.end,
      },
    ];
  });
  if (!segments.length) {
    return undefined;
  }
  return {
    wordAlignment: {
      words: segments.map((segment) => segment.text),
      wordStartTimeSeconds: segments.map((segment) => segment.globalStart),
      wordEndTimeSeconds: segments.map((segment) => segment.globalEnd),
    },
    fishAlignment: {
      content: typeof event.content === 'string' ? event.content : undefined,
      chunkSeq,
      chunkAudioOffsetSec: offset,
      audioDuration:
        typeof event.alignment?.audio_duration === 'number' ? event.alignment.audio_duration : undefined,
      segments,
    },
  };
}
