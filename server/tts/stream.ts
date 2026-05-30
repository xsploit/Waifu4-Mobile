import type { Request, Response } from 'express';
import { z } from 'zod';
import { readProviderKeys } from '../ai/providerKeys';
import { streamFishTts } from './FishTtsStream';

const ttsRequestSchema = z.object({
  text: z.string().min(1),
  voiceId: z.string().optional(),
  backend: z.enum(['s1', 's2-pro']).optional(),
  format: z.enum(['pcm', 'mp3', 'wav', 'opus']).optional(),
  sampleRate: z.number().int().positive().optional(),
  chunkLength: z.number().int().min(100).max(300).optional(),
  latency: z.enum(['normal', 'balanced']).optional(),
  conditionOnPreviousChunks: z.boolean().optional(),
});

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
  const keys = readProviderKeys(req);
  if (!keys.ttsKey) {
    res.status(401).json({ ok: false, error: 'Missing TTS provider key' });
    return;
  }

  const format = parsed.data.format ?? 'pcm';
  const sampleRate = format === 'pcm' ? (parsed.data.sampleRate ?? 44100) : undefined;

  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
  const send = (obj: unknown) => res.write(`${JSON.stringify(obj)}\n`);

  const controller = new AbortController();
  res.on('close', () => controller.abort());

  try {
    const stats = await streamFishTts(
      { ...parsed.data, apiKey: keys.ttsKey, signal: controller.signal },
      (chunk) => send({ type: 'audio', audio: Buffer.from(chunk).toString('base64'), format, sampleRate }),
    );
    send({ type: 'done', ok: true, stats });
  } catch (err) {
    send({ type: 'error', ok: false, error: err instanceof Error ? err.message : String(err) });
  } finally {
    res.end();
  }
}
