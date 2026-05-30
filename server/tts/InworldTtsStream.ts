import { InworldTTS, type DeliveryMode, type TimestampInfo, type TimestampType } from '@inworld/tts';
import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';
import { createLogger } from '../../src/shared/logger';

const log = createLogger('tts');

export type InworldTransport = 'http' | 'websocket';
export type InworldTimestampTransportStrategy = 'SYNC' | 'ASYNC';

export type InworldStreamRequest = {
  apiKey: string;
  text: string;
  voiceId?: string;
  modelId?: string;
  transport?: InworldTransport;
  sampleRate?: number;
  timestampType?: TimestampType | 'NONE';
  timestampTransportStrategy?: InworldTimestampTransportStrategy;
  deliveryMode?: DeliveryMode;
  bufferCharThreshold?: number;
  maxBufferDelayMs?: number;
  autoMode?: boolean;
  signal?: AbortSignal;
};

export type InworldAudioMeta = {
  sampleRate: number;
  timestamps?: TimestampInfo;
};

export type InworldStreamStats = {
  firstAudioMs: number | null;
  chunks: number;
  bytes: number;
  totalMs: number;
  transport: InworldTransport;
  timestampChunks: number;
  words: number;
  phonemes: number;
  visemes: number;
};

type InworldWireResult = {
  contextId?: string;
  contextCreated?: unknown;
  contextClosed?: unknown;
  flushCompleted?: unknown;
  audioChunk?: {
    audioContent?: string;
    timestampInfo?: TimestampInfo;
    status?: { code?: number; message?: string };
  };
  timestampInfo?: TimestampInfo;
  status?: { code?: number; message?: string };
};

type InworldWireMessage = {
  result?: InworldWireResult;
  error?: { code?: number; message?: string; details?: unknown[] };
};

function normalizeApiKey(apiKey: string): string {
  return apiKey.trim().replace(/^Basic\s+/i, '');
}

function basicAuthHeader(apiKey: string): string {
  return `Basic ${normalizeApiKey(apiKey)}`;
}

function hasTimestampInfo(timestamps: TimestampInfo | undefined): timestamps is TimestampInfo {
  return Boolean(
    timestamps?.wordAlignment?.words?.length ||
      timestamps?.characterAlignment?.characters?.length ||
      timestamps?.wordAlignment?.phoneticDetails?.length,
  );
}

function countTimestamps(timestamps: TimestampInfo | undefined) {
  const words = timestamps?.wordAlignment?.words?.length ?? 0;
  const phonemes =
    timestamps?.wordAlignment?.phoneticDetails?.reduce(
      (total, detail) => total + (detail.phones?.length ?? 0),
      0,
    ) ?? 0;
  const visemes = new Set(
    timestamps?.wordAlignment?.phoneticDetails?.flatMap((detail) =>
      (detail.phones ?? []).map((phone) => phone.visemeSymbol).filter(Boolean),
    ) ?? [],
  ).size;
  return { words, phonemes, visemes };
}

function readAscii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

export function extractPcmFromWavOrRaw(
  bytes: Uint8Array,
  fallbackSampleRate: number,
): { audio: Uint8Array; sampleRate: number } {
  if (bytes.length < 44 || readAscii(bytes, 0, 4) !== 'RIFF' || readAscii(bytes, 8, 4) !== 'WAVE') {
    return { audio: bytes, sampleRate: fallbackSampleRate };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let sampleRate = fallbackSampleRate;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const id = readAscii(bytes, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const dataStart = offset + 8;
    if (id === 'fmt ' && size >= 16 && dataStart + 12 <= bytes.length) {
      sampleRate = view.getUint32(dataStart + 4, true);
    }
    if (id === 'data') {
      return {
        audio: bytes.subarray(dataStart, Math.min(dataStart + size, bytes.length)),
        sampleRate,
      };
    }
    offset = dataStart + size + (size % 2);
  }

  return { audio: bytes, sampleRate };
}

export async function streamInworldTts(
  req: InworldStreamRequest,
  onAudio: (chunk: Uint8Array, meta: InworldAudioMeta) => void,
): Promise<InworldStreamStats> {
  if ((req.transport ?? 'http') === 'websocket') {
    return await streamInworldWebSocketTts(req, onAudio);
  }
  return await streamInworldHttpTts(req, onAudio);
}

async function streamInworldHttpTts(
  req: InworldStreamRequest,
  onAudio: (chunk: Uint8Array, meta: InworldAudioMeta) => void,
): Promise<InworldStreamStats> {
  const started = Date.now();
  let firstAudioAt: number | null = null;
  let chunks = 0;
  let bytes = 0;
  let timestampChunks = 0;
  let words = 0;
  let phonemes = 0;
  let visemes = 0;

  const sampleRate = req.sampleRate ?? 48000;
  const tts = InworldTTS({ apiKey: normalizeApiKey(req.apiKey), timeout: 60_000 });
  const options = {
    text: req.text,
    voice: req.voiceId || 'Ashley',
    model: req.modelId || 'inworld-tts-2',
    encoding: 'PCM' as const,
    sampleRate,
    deliveryMode: req.deliveryMode,
  };

  const stream =
    req.timestampType === 'NONE'
      ? tts.stream(options)
      : tts.streamWithTimestamps({ ...options, timestampType: req.timestampType ?? 'WORD' });

  for await (const item of stream) {
    if (req.signal?.aborted) {
      throw new Error('TTS stream aborted');
    }
    const raw = item instanceof Uint8Array ? item : item.audio;
    const timestamps = item instanceof Uint8Array ? undefined : item.timestamps;
    const normalized = extractPcmFromWavOrRaw(raw, sampleRate);
    if (normalized.audio.length === 0) {
      continue;
    }
    firstAudioAt ??= Date.now();
    chunks += 1;
    bytes += normalized.audio.length;
    if (hasTimestampInfo(timestamps)) {
      const counts = countTimestamps(timestamps);
      timestampChunks += 1;
      words += counts.words;
      phonemes += counts.phonemes;
      visemes += counts.visemes;
    }
    onAudio(normalized.audio, { sampleRate: normalized.sampleRate, timestamps });
  }

  const stats = {
    firstAudioMs: firstAudioAt === null ? null : firstAudioAt - started,
    chunks,
    bytes,
    totalMs: Date.now() - started,
    transport: 'http' as const,
    timestampChunks,
    words,
    phonemes,
    visemes,
  };
  log.info('tts done', { ...stats, backend: 'inworld', model: req.modelId || 'inworld-tts-2' });
  return stats;
}

async function streamInworldWebSocketTts(
  req: InworldStreamRequest,
  onAudio: (chunk: Uint8Array, meta: InworldAudioMeta) => void,
): Promise<InworldStreamStats> {
  const started = Date.now();
  const sampleRate = req.sampleRate ?? 48000;
  const contextId = `ctx-${randomUUID()}`;
  let firstAudioAt: number | null = null;
  let chunks = 0;
  let bytes = 0;
  let timestampChunks = 0;
  let words = 0;
  let phonemes = 0;
  let visemes = 0;
  let closeSent = false;
  let settled = false;

  return await new Promise<InworldStreamStats>((resolve, reject) => {
    const ws = new WebSocket('wss://api.inworld.ai/tts/v1/voice:streamBidirectional', {
      headers: { Authorization: basicAuthHeader(req.apiKey) },
    });

    const finishStats = (): InworldStreamStats => ({
      firstAudioMs: firstAudioAt === null ? null : firstAudioAt - started,
      chunks,
      bytes,
      totalMs: Date.now() - started,
      transport: 'websocket',
      timestampChunks,
      words,
      phonemes,
      visemes,
    });

    const cleanup = () => {
      req.signal?.removeEventListener('abort', onAbort);
    };

    const fail = (err: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      try {
        ws.close();
      } catch {
        /* already closing */
      }
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    const sendJson = (value: unknown) => {
      ws.send(JSON.stringify(value));
    };

    const onAbort = () => fail(new Error('TTS stream aborted'));
    req.signal?.addEventListener('abort', onAbort, { once: true });

    ws.on('open', () => {
      sendJson({
        create: {
          voiceId: req.voiceId || 'Ashley',
          modelId: req.modelId || 'inworld-tts-2',
          audioConfig: {
            audioEncoding: 'PCM',
            sampleRateHertz: sampleRate,
          },
          bufferCharThreshold: req.bufferCharThreshold ?? 120,
          maxBufferDelayMs: req.maxBufferDelayMs,
          autoMode: req.autoMode ?? true,
          timestampType: req.timestampType === 'NONE' ? undefined : (req.timestampType ?? 'WORD'),
          timestampTransportStrategy: req.timestampTransportStrategy ?? 'SYNC',
          deliveryMode: req.deliveryMode,
        },
        contextId,
      });
    });

    ws.on('message', (data) => {
      let message: InworldWireMessage;
      try {
        const text = typeof data === 'string' ? data : data.toString('utf8');
        message = JSON.parse(text) as InworldWireMessage;
      } catch {
        return;
      }

      if (message.error) {
        fail(new Error(message.error.message || `Inworld WebSocket error ${message.error.code ?? ''}`.trim()));
        return;
      }

      const result = message.result;
      const status = result?.audioChunk?.status ?? result?.status;
      if (status?.code && status.code !== 0) {
        fail(new Error(status.message || `Inworld WebSocket status ${status.code}`));
        return;
      }

      if (result?.contextCreated) {
        sendJson({
          send_text: {
            text: req.text,
            flush_context: {},
          },
          contextId,
        });
        return;
      }

      const audioContent = result?.audioChunk?.audioContent;
      const timestamps = result?.audioChunk?.timestampInfo ?? result?.timestampInfo;
      if (audioContent) {
        const raw = Buffer.from(audioContent, 'base64');
        const normalized = extractPcmFromWavOrRaw(raw, sampleRate);
        if (normalized.audio.length > 0) {
          firstAudioAt ??= Date.now();
          chunks += 1;
          bytes += normalized.audio.length;
          onAudio(normalized.audio, { sampleRate: normalized.sampleRate, timestamps });
        }
      }
      if (hasTimestampInfo(timestamps)) {
        const counts = countTimestamps(timestamps);
        timestampChunks += 1;
        words += counts.words;
        phonemes += counts.phonemes;
        visemes += counts.visemes;
      }

      if (result?.flushCompleted && !closeSent) {
        closeSent = true;
        sendJson({ close_context: {}, contextId });
      }
      if (result?.contextClosed) {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        const stats = finishStats();
        log.info('tts done', { ...stats, backend: 'inworld', model: req.modelId || 'inworld-tts-2' });
        ws.close();
        resolve(stats);
      }
    });

    ws.on('error', (err) => fail(err));
    ws.on('close', () => {
      cleanup();
      if (settled) {
        return;
      }
      settled = true;
      if (chunks > 0) {
        resolve(finishStats());
      } else {
        reject(new Error('Inworld WebSocket closed before audio arrived'));
      }
    });
  });
}
