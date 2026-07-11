import type { Request, Response } from 'express';
import { z } from 'zod';
import { readFishTtsEnvKey } from '../ai/providerKeys';
import { streamFishTimestampTts, streamFishTts } from './FishTtsStream';
import { streamInworldTts } from './InworldTtsStream';
import { buildSpeechTiming, createSpeechTimingAccumulator } from './SpeechTiming';

const ttsRequestSchema = z.object({
  text: z.string().min(1),
  textSegments: z.array(z.string().min(1)).max(32).optional(),
  provider: z.enum(['fish', 'inworld']).optional(),
  fishTransport: z.enum(['websocket', 'timestamp-sse']).optional(),
  voiceId: z.string().optional(),
  backend: z.enum(['s1', 's2-pro', 's2.1-pro-free']).optional(),
  format: z.enum(['pcm', 'mp3', 'wav', 'opus']).optional(),
  sampleRate: z.number().int().positive().optional(),
  chunkLength: z.number().int().min(100).max(300).optional(),
  latency: z.enum(['normal', 'balanced']).optional(),
  conditionOnPreviousChunks: z.boolean().optional(),
  inworldTransport: z.enum(['http', 'websocket']).optional(),
  inworldModelId: z.string().optional(),
  timestampType: z.enum(['NONE', 'WORD', 'CHARACTER']).optional(),
  timestampTransportStrategy: z.enum(['SYNC', 'ASYNC']).optional(),
  deliveryMode: z.enum(['STABLE', 'BALANCED', 'CREATIVE', 'EXPRESSIVE']).optional(),
  bufferCharThreshold: z.number().int().min(1).max(1000).optional(),
  maxBufferDelayMs: z.number().int().min(0).max(10000).optional(),
  autoMode: z.boolean().optional(),
});

function header(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  if (typeof value === 'string') return value;
  return Array.isArray(value) ? value[0] : undefined;
}

export function readTtsStreamProviderKey(req: Request, provider: 'fish' | 'inworld') {
  const requestKey = header(req, 'x-yourwifey-tts-provider-key')?.trim();
  if (requestKey) return requestKey;
  return provider === 'inworld'
    ? process.env.INWORLD_API_KEY
    : readFishTtsEnvKey();
}

/**
 * POST /tts/stream — NDJSON audio stream.
 * Lines: {type:'audio', audio:base64, format, sampleRate} ... {type:'done', stats} | {type:'error', error}.
 */
export async function handleTtsStream(req: Request, res: Response): Promise<void> {
  const parsed = ttsRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.message });
    return;
  }
  const provider = parsed.data.provider ?? 'fish';
  const ttsKey = readTtsStreamProviderKey(req, provider);
  if (!ttsKey) {
    res.status(401).json({ ok: false, error: 'Missing TTS provider key' });
    return;
  }

  const format = parsed.data.format ?? 'pcm';
  const sampleRate =
    format === 'pcm'
      ? (parsed.data.sampleRate ?? (provider === 'inworld' ? 48000 : 44100))
      : undefined;

  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
  const send = (obj: unknown) => res.write(`${JSON.stringify(obj)}\n`);

  const controller = new AbortController();
  res.on('close', () => controller.abort());
  const timing = createSpeechTimingAccumulator();
  const sendAudio = (
    chunk: Uint8Array,
    meta: { format: string; sampleRate?: number; timestamps?: unknown },
  ) => {
    const timestamps = meta.timestamps && typeof meta.timestamps === 'object' ? meta.timestamps : undefined;
    const speechTiming = buildSpeechTiming(timestamps);
    timing.add(speechTiming, timestamps);
    send({
      type: 'audio',
      audio: Buffer.from(chunk).toString('base64'),
      format: meta.format,
      sampleRate: meta.sampleRate,
      timestamps,
      speechTiming,
    });
  };

  try {
    const stats =
      provider === 'inworld'
        ? await streamInworldTts(
            {
              apiKey: ttsKey,
              text: parsed.data.text,
              voiceId: parsed.data.voiceId,
              modelId: parsed.data.inworldModelId,
              transport: parsed.data.inworldTransport,
              sampleRate: sampleRate ?? parsed.data.sampleRate,
              timestampType: parsed.data.timestampType,
              timestampTransportStrategy: parsed.data.timestampTransportStrategy,
              deliveryMode: parsed.data.deliveryMode,
              bufferCharThreshold: parsed.data.bufferCharThreshold,
              maxBufferDelayMs: parsed.data.maxBufferDelayMs,
              autoMode: parsed.data.autoMode,
              signal: controller.signal,
            },
            (chunk, meta) =>
              sendAudio(chunk, { format: 'pcm', sampleRate: meta.sampleRate, timestamps: meta.timestamps }),
          )
        : parsed.data.fishTransport === 'timestamp-sse'
          ? await streamFishTimestampTts(
              { ...parsed.data, apiKey: ttsKey, signal: controller.signal },
              (chunk, meta) =>
                sendAudio(chunk, { format, sampleRate, timestamps: meta.timestamps }),
            )
          : await streamFishTts(
              { ...parsed.data, apiKey: ttsKey, signal: controller.signal },
              (chunk) => sendAudio(chunk, { format, sampleRate }),
            );
    const timingSummary = timing.summary();
    send({
      type: 'done',
      ok: true,
      stats: timingSummary.timestampChunks
        ? {
            ...stats,
            nativeWords: timingSummary.nativeWords,
            nativePhonemes: timingSummary.nativePhonemes,
            nativeVisemes: timingSummary.nativeVisemes,
            timestampChunks: timingSummary.timestampChunks,
            words: timingSummary.words,
            phonemes: timingSummary.phonemes,
            visemes: timingSummary.visemes,
            timingSource: 'provider-words+derived-phonemes',
          }
        : stats,
    });
  } catch (err) {
    send({ type: 'error', ok: false, error: err instanceof Error ? err.message : String(err) });
  } finally {
    res.end();
  }
}
