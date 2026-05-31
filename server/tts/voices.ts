import type { Request, Response } from 'express';
import { InworldTTS, type VoiceInfo } from '@inworld/tts';
import { FishAudioClient, type ModelEntity } from 'fish-audio';
import { z } from 'zod';
import type {
  CreatedRemoteTtsVoice,
  FishSpeechVoiceScope,
  RemoteTtsProvider,
  RemoteTtsVoice,
} from '../../src/lib/tts/remote';

const voiceListSchema = z.object({
  provider: z.enum(['fish-speech', 'inworld']).optional(),
  scope: z.enum(['all', 'mine', 'public']).optional(),
});

const voiceCreateSchema = z.object({
  provider: z.enum(['fish-speech', 'inworld']),
  name: z.string().trim().min(1).max(80),
  sampleBase64: z.string().min(1),
  sampleFileName: z.string().optional(),
  sampleMimeType: z.string().optional(),
  description: z.string().optional(),
  language: z.string().optional(),
  transcription: z.string().optional(),
  tags: z.array(z.string()).optional(),
  removeBackgroundNoise: z.boolean().optional(),
  enhanceAudioQuality: z.boolean().optional(),
  visibility: z.enum(['public', 'unlist', 'private']).optional(),
});

type VoiceCreateRequest = z.infer<typeof voiceCreateSchema>;

function normalizeText(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function normalizeTags(tags: unknown) {
  if (!Array.isArray(tags)) return [];
  return tags.map((tag) => normalizeText(tag, 32)).filter(Boolean).slice(0, 10);
}

function decodeSampleBase64(value: string) {
  const encoded = value.includes(',') ? value.slice(value.indexOf(',') + 1) : value;
  return Buffer.from(encoded, 'base64');
}

function fishBaseUrl() {
  return (
    process.env.FISH_AUDIO_BASE_URL ??
    process.env.FISH_SPEECH_BASE_URL ??
    undefined
  )?.replace(/\/+$/, '');
}

function inworldBaseUrl() {
  return process.env.INWORLD_TTS_BASE_URL?.replace(/\/+$/, '');
}

function header(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  if (typeof value === 'string') return value;
  return Array.isArray(value) ? value[0] : undefined;
}

function readTtsKey(req: Request, provider: RemoteTtsProvider) {
  const requestKey = header(req, 'x-yourwifey-tts-provider-key')?.trim();
  if (requestKey) return requestKey;
  return provider === 'inworld'
    ? process.env.INWORLD_API_KEY
    : process.env.FISH_AUDIO_API_KEY ?? process.env.FISHSPEECH_API_KEY;
}

function mapFishVoice(voice: ModelEntity): RemoteTtsVoice {
  return {
    provider: 'fish-speech',
    id: voice._id,
    name: voice.title || voice._id,
    description: voice.description || undefined,
    tags: voice.tags,
    languages: voice.languages,
    source: voice.author?.nickname,
  };
}

function mapInworldVoice(voice: VoiceInfo): RemoteTtsVoice {
  return {
    provider: 'inworld',
    id: voice.voiceId,
    name: voice.displayName || voice.name || voice.voiceId,
    description: voice.description,
    tags: voice.tags,
    languages: voice.langCode ? [voice.langCode] : undefined,
    source: voice.source,
  };
}

async function listFishVoices(apiKey: string, scope: FishSpeechVoiceScope) {
  const client = new FishAudioClient({
    apiKey,
    ...(fishBaseUrl() ? { baseUrl: fishBaseUrl() } : {}),
  });
  const search = async (request: Record<string, unknown>) => {
    const response = await client.voices.search(
      {
        page_number: 1,
        page_size: 100,
        sort_by: 'created_at',
        ...request,
      },
      { timeoutInSeconds: 20 },
    );
    return response.items.map(mapFishVoice).filter((voice) => voice.id);
  };

  if (scope === 'mine') {
    return search({ self: true, visibility: 'private' }).catch(() => search({ self: true }));
  }

  const publicVoices = scope === 'public' || scope === 'all' ? await search({}) : [];
  if (scope === 'public') return publicVoices;

  const myVoices = await search({ self: true, visibility: 'private' }).catch(() =>
    search({ self: true }).catch(() => []),
  );
  return Array.from(new Map([...myVoices, ...publicVoices].map((voice) => [voice.id, voice])).values());
}

async function listInworldVoices(apiKey: string) {
  const client = InworldTTS({
    apiKey,
    timeout: 20000,
    ...(inworldBaseUrl() ? { baseUrl: inworldBaseUrl() } : {}),
  });
  const voices = await client.listVoices();
  return voices.map(mapInworldVoice).filter((voice) => voice.id);
}

async function createFishVoice(apiKey: string, request: VoiceCreateRequest) {
  if (typeof File === 'undefined') {
    throw new Error('Fish Speech voice creation requires Node File upload support.');
  }
  const sample = decodeSampleBase64(request.sampleBase64);
  if (!sample.length) throw new Error('Voice sample is required.');
  if (sample.length > 20 * 1024 * 1024) throw new Error('Voice sample must be 20 MB or smaller.');

  const client = new FishAudioClient({
    apiKey,
    ...(fishBaseUrl() ? { baseUrl: fishBaseUrl() } : {}),
  });
  const file = new File([new Uint8Array(sample)], request.sampleFileName || 'voice-sample.wav', {
    type: request.sampleMimeType || 'audio/wav',
  });
  const transcription = normalizeText(request.transcription, 2000);
  const voice = await client.voices.ivc.create(
    {
      type: 'tts',
      title: request.name,
      train_mode: 'fast',
      voices: [file],
      visibility: request.visibility ?? 'private',
      description: normalizeText(request.description, 500) || undefined,
      texts: transcription ? [transcription] : undefined,
      tags: normalizeTags(request.tags),
      enhance_audio_quality: request.enhanceAudioQuality ?? true,
    },
    { timeoutInSeconds: 120 },
  );

  return { ...mapFishVoice(voice), modelId: 's2', status: 'ready' } satisfies CreatedRemoteTtsVoice;
}

async function createInworldVoice(apiKey: string, request: VoiceCreateRequest) {
  const sample = decodeSampleBase64(request.sampleBase64);
  if (!sample.length) throw new Error('Voice sample is required.');
  if (sample.length > 20 * 1024 * 1024) throw new Error('Voice sample must be 20 MB or smaller.');

  const client = InworldTTS({
    apiKey,
    timeout: 120000,
    ...(inworldBaseUrl() ? { baseUrl: inworldBaseUrl() } : {}),
  });
  const transcription = normalizeText(request.transcription, 2000);
  const result = await client.cloneVoice({
    displayName: request.name,
    audioSamples: [sample],
    lang: normalizeText(request.language, 24) || 'EN_US',
    description: normalizeText(request.description, 500) || undefined,
    tags: normalizeTags(request.tags),
    transcriptions: transcription ? [transcription] : undefined,
    removeBackgroundNoise: request.removeBackgroundNoise ?? true,
  });

  return { ...mapInworldVoice(result.voice), modelId: 'inworld-tts-2', status: 'ready' };
}

export async function handleListTtsVoices(req: Request, res: Response): Promise<void> {
  const parsed = voiceListSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.message, voices: [] });
    return;
  }
  const provider = parsed.data.provider ?? 'fish-speech';
  const apiKey = readTtsKey(req, provider);
  if (!apiKey) {
    res.status(401).json({ ok: false, error: 'Missing TTS provider key', voices: [] });
    return;
  }

  try {
    const voices =
      provider === 'inworld'
        ? await listInworldVoices(apiKey)
        : await listFishVoices(apiKey, parsed.data.scope ?? 'all');
    res.json({ ok: true, voices });
  } catch (error) {
    res.status(502).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Remote TTS voice fetch failed.',
      voices: [],
    });
  }
}

export async function handleCreateTtsVoice(req: Request, res: Response): Promise<void> {
  const parsed = voiceCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.message });
    return;
  }
  const apiKey = readTtsKey(req, parsed.data.provider);
  if (!apiKey) {
    res.status(401).json({ ok: false, error: 'Missing TTS provider key' });
    return;
  }

  try {
    const voice =
      parsed.data.provider === 'inworld'
        ? await createInworldVoice(apiKey, parsed.data)
        : await createFishVoice(apiKey, parsed.data);
    res.json({ ok: true, voice });
  } catch (error) {
    res.status(502).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Remote TTS voice creation failed.',
    });
  }
}
