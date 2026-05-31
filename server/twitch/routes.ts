import { Router } from 'express';
import { z } from 'zod';
import {
  normalizeTwitchStreamTranscriptionModel,
  normalizeTwitchStreamVisionDetail,
} from '../../src/lib/twitch/stream-transcription';
import { readProviderKeys } from '../ai/providerKeys';
import {
  captureTwitchStreamFrame,
  transcribeTwitchStreamSample,
} from './TwitchStreamTranscriber';
import type { TwitchRuntime } from './runtime';

const twitchStreamBodySchema = z
  .object({
    channel: z.string().optional(),
    model: z.string().optional(),
    provider: z.enum(['openrouter', 'fish-speech']).optional(),
    sampleSeconds: z.number().optional(),
    detail: z.enum(['auto', 'high', 'low']).optional(),
  })
  .passthrough();

function fallbackChannel(value: string | undefined) {
  return value?.trim() || process.env.TWITCH_CHANNEL?.trim() || 'subsect';
}

function openRouterBaseUrl() {
  return (process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
}

function fishBaseUrl() {
  return (
    process.env.FISH_AUDIO_BASE_URL ??
    process.env.FISH_SPEECH_BASE_URL ??
    'https://api.fish.audio'
  ).replace(/\/+$/, '');
}

export function createTwitchRouter(runtime?: TwitchRuntime) {
  const router = Router();

  router.get('/runtime/status', (_req, res) => {
    res.json({ ok: true, runtime: runtime?.status() ?? null });
  });

  router.post('/runtime/start', (_req, res) => {
    try {
      runtime?.start();
      res.json({ ok: true, runtime: runtime?.status() ?? null });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : 'Twitch runtime start failed.',
      });
    }
  });

  router.post('/runtime/stop', (_req, res) => {
    runtime?.stop();
    res.json({ ok: true, runtime: runtime?.status() ?? null });
  });

  router.post('/runtime/mock-message', async (req, res) => {
    if (!runtime) {
      res.status(404).json({ ok: false, error: 'Twitch runtime is not configured.' });
      return;
    }
    try {
      const message = await runtime.injectMockMessage(req.body ?? {});
      res.json({ ok: true, message, runtime: runtime.status() });
    } catch (error) {
      res.status(400).json({
        ok: false,
        error: error instanceof Error ? error.message : 'Mock Twitch message failed.',
      });
    }
  });

  router.post('/transcribe-sample', async (req, res) => {
    try {
      const body = twitchStreamBodySchema.parse(req.body ?? {});
      const keys = readProviderKeys(req);
      const requestedModel = normalizeTwitchStreamTranscriptionModel(body.model);
      const provider =
        body.provider ?? (requestedModel === 'fish-audio/asr' ? 'fish-speech' : 'openrouter');
      const apiKey = provider === 'fish-speech' ? keys.ttsKey : keys.llmKey;
      const apiBaseUrl = provider === 'fish-speech' ? fishBaseUrl() : openRouterBaseUrl();
      const transcript = await transcribeTwitchStreamSample({
        apiBaseUrl,
        apiKey: apiKey ?? '',
        channel: fallbackChannel(body.channel),
        model: provider === 'fish-speech' ? 'fish-audio/asr' : requestedModel,
        provider,
        sampleSeconds:
          typeof body.sampleSeconds === 'number' && Number.isFinite(body.sampleSeconds)
            ? body.sampleSeconds
            : 8,
      });
      res.json({ ok: true, transcript });
    } catch (error) {
      res.json({
        ok: false,
        error: error instanceof Error ? error.message : 'Twitch stream transcription failed.',
      });
    }
  });

  router.post('/capture-frame', async (req, res) => {
    try {
      const body = twitchStreamBodySchema.parse(req.body ?? {});
      const detail = normalizeTwitchStreamVisionDetail(body.detail);
      const frame = await captureTwitchStreamFrame(fallbackChannel(body.channel), detail);
      res.json({ ok: true, frame });
    } catch (error) {
      res.json({
        ok: false,
        error: error instanceof Error ? error.message : 'Twitch stream frame capture failed.',
      });
    }
  });

  return router;
}
