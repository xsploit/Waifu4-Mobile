import { Router } from 'express';
import { z } from 'zod';
import { normalizeTwitchStreamTranscriptionModel } from '../../src/lib/twitch/stream-transcription';
import { readProviderKeys } from '../ai/providerKeys';
import {
  captureTwitchStreamFrame,
  transcribeTwitchStreamSample,
} from './TwitchStreamTranscriber';

const twitchStreamBodySchema = z
  .object({
    channel: z.string().optional(),
    model: z.string().optional(),
    provider: z.enum(['openrouter', 'fish-speech']).optional(),
    sampleSeconds: z.number().optional(),
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

export function createTwitchRouter() {
  const router = Router();

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
      const frame = await captureTwitchStreamFrame(fallbackChannel(body.channel));
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
