import { Router, type Request } from 'express';
import { z } from 'zod';
import type { StreamBotEvent } from '../../src/shared/streamEvents';
import {
  createDiscordVoiceRuntime,
  type DiscordVoiceRuntimeOptions,
  type DiscordVoiceRuntimeStatus,
} from './DiscordVoiceRuntime';
import type { DiscordVoiceTranscript } from './DiscordTranscriber';
import { createDiscordVoiceOutput } from './DiscordVoiceOutput';
import type { TtsOutputChunk } from '../tts/outputFanout';

const DEFAULT_ASR_MODEL = 'openai/whisper-large-v3';
const DEFAULT_VAD = {
  endSilenceMs: 850,
  maxUtteranceMs: 30_000,
  minSpeechMs: 250,
  startThreshold: 0.03,
};

const connectBodySchema = z
  .object({
    asrProvider: z.enum(['fish', 'openrouter', 'vercel']),
    guildId: z.string().trim().min(1).max(64),
    languageHint: z.string().trim().max(24).optional(),
    listenEnabled: z.boolean().optional(),
    transcriptionModel: z.string().trim().min(1).max(160).optional(),
    vadEndSilenceMs: z.number().finite().min(0).max(10_000).optional(),
    vadMaxSpeechMs: z.number().finite().positive().max(120_000).optional(),
    vadMinSpeechMs: z.number().finite().min(0).max(10_000).optional(),
    vadThreshold: z.number().finite().min(0).max(1).optional(),
    voiceChannelId: z.string().trim().min(1).max(64),
  })
  .strict();

export type DiscordConnectConfig = z.infer<typeof connectBodySchema>;
export type DiscordVoiceRuntimeLike = Pick<
  ReturnType<typeof createDiscordVoiceRuntime>,
  'start' | 'status' | 'stop' | 'tryEnqueueOutput'
>;

export type DiscordVoiceControllerStatus = {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  guildId?: string;
  voiceChannelId?: string;
  asrProvider?: DiscordConnectConfig['asrProvider'];
  transcriptionModel?: string;
  languageHint?: string;
  listen?: boolean;
  runtime: DiscordVoiceRuntimeStatus | null;
  error?: string;
};

export type DiscordVoiceControllerOptions = {
  createRuntime?: (options: DiscordVoiceRuntimeOptions) => DiscordVoiceRuntimeLike;
  onEvent?: (event: StreamBotEvent) => void;
};

type DiscordConnectCredentials = {
  asrProviderKey: string;
  botToken: string;
};

type ResolvedDiscordConnectConfig = Omit<DiscordConnectConfig, 'listenEnabled' | 'transcriptionModel' | 'vadEndSilenceMs' | 'vadMaxSpeechMs' | 'vadMinSpeechMs' | 'vadThreshold'> & {
  listen: boolean;
  transcriptionModel: string;
  vad: typeof DEFAULT_VAD;
};

export class DiscordVoiceController {
  private runtime: DiscordVoiceRuntimeLike | undefined;
  private config: ResolvedDiscordConnectConfig | undefined;
  private connectionStatus: DiscordVoiceControllerStatus['status'] = 'disconnected';
  private error: string | undefined;
  private generation = 0;
  private operation = Promise.resolve();

  public constructor(private readonly options: DiscordVoiceControllerOptions = {}) {}

  public status(): DiscordVoiceControllerStatus {
    const runtime = this.runtime?.status() ?? null;
    return {
      status: this.connectionStatus,
      ...(this.config
        ? {
            asrProvider: this.config.asrProvider,
            guildId: this.config.guildId,
            languageHint: this.config.languageHint,
            listen: this.config.listen,
            transcriptionModel: this.config.transcriptionModel,
            voiceChannelId: this.config.voiceChannelId,
          }
        : {}),
      runtime,
      ...(this.error ? { error: this.error } : {}),
    };
  }

  public connect(config: DiscordConnectConfig, credentials: DiscordConnectCredentials): Promise<DiscordVoiceControllerStatus> {
    return this.enqueue(async () => {
      const resolved = resolveConnectConfig(config);
      const generation = ++this.generation;
      this.stopRuntime();
      this.config = resolved;
      this.error = undefined;
      this.connectionStatus = 'connecting';
      this.emitStatus();

      const runtime = (this.options.createRuntime ?? createDiscordVoiceRuntime)({
        channelId: resolved.voiceChannelId,
        guildId: resolved.guildId,
        listen: resolved.listen,
        onError: (error) => this.handleRuntimeError(generation, error, credentials),
        onStatusChange: (status) => this.handleRuntimeStatus(generation, status),
        onTranscript: (transcript) => this.handleTranscript(generation, transcript),
        token: credentials.botToken,
        transcription: {
          apiKey: credentials.asrProviderKey,
          ...(resolved.languageHint ? { language: resolved.languageHint } : {}),
          model: resolved.transcriptionModel,
          provider: mapAsrProvider(resolved.asrProvider),
        },
        vad: resolved.vad,
        voiceOutput: createDiscordVoiceOutput({
          onError: (error) => this.handleRuntimeError(generation, error, credentials),
        }),
      });
      this.runtime = runtime;

      try {
        await runtime.start();
        if (this.generation === generation && this.runtime === runtime) {
          this.applyRuntimeStatus(runtime.status());
        }
        return this.status();
      } catch (error) {
        if (this.generation === generation && this.runtime === runtime) {
          this.runtime = undefined;
          runtime.stop();
          this.setError(error, credentials);
        }
        throw new Error(this.error ?? 'Discord voice connection failed.');
      }
    });
  }

  public disconnect(): Promise<DiscordVoiceControllerStatus> {
    return this.enqueue(() => {
      if (!this.runtime && this.connectionStatus === 'disconnected') {
        return this.status();
      }
      this.generation += 1;
      this.stopRuntime();
      this.config = undefined;
      this.error = undefined;
      this.connectionStatus = 'disconnected';
      this.emitStatus();
      return this.status();
    });
  }

  public tryEnqueueOutput(chunk: TtsOutputChunk): boolean {
    if (chunk.format !== 'pcm' || !chunk.sampleRate) return false;
    return this.runtime?.tryEnqueueOutput({
      audio: chunk.audio,
      cancel: chunk.cancel,
      chunkIndex: chunk.chunkIndex,
      isFinal: chunk.isFinal,
      sampleRate: chunk.sampleRate,
      sessionId: chunk.sessionId,
      utteranceId: chunk.utteranceId,
    }) ?? false;
  }

  private enqueue<T>(work: () => Promise<T> | T): Promise<T> {
    const next = this.operation.then(work, work);
    this.operation = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private stopRuntime(): void {
    const runtime = this.runtime;
    this.runtime = undefined;
    runtime?.stop();
  }

  private handleRuntimeStatus(generation: number, runtime: DiscordVoiceRuntimeStatus): void {
    if (generation !== this.generation || !this.runtime) return;
    this.applyRuntimeStatus(runtime);
  }

  private applyRuntimeStatus(runtime: DiscordVoiceRuntimeStatus): void {
    if (runtime.connected) {
      this.connectionStatus = 'connected';
      this.error = undefined;
    } else if (runtime.started) {
      this.connectionStatus = this.error ? 'error' : 'connecting';
    } else {
      this.connectionStatus = 'disconnected';
    }
    this.emitStatus();
  }

  private handleRuntimeError(generation: number, error: Error, credentials: DiscordConnectCredentials): void {
    if (generation !== this.generation || !this.runtime) return;
    this.setError(error, credentials);
  }

  private setError(error: unknown, credentials: DiscordConnectCredentials): void {
    const message = redactError(error, credentials);
    this.error = message;
    this.connectionStatus = 'error';
    this.options.onEvent?.({
      type: 'discord-error',
      payload: {
        message,
        ...(this.config ? { channelId: this.config.voiceChannelId, guildId: this.config.guildId } : {}),
      },
    });
    this.emitStatus();
  }

  private handleTranscript(generation: number, transcript: DiscordVoiceTranscript): void {
    if (generation !== this.generation || !this.runtime) return;
    this.options.onEvent?.({
      type: 'discord-transcript',
      payload: {
        channelId: transcript.identity.channelId,
        guildId: transcript.identity.guildId,
        userId: transcript.identity.userId,
        ...(transcript.identity.displayName ? { displayName: transcript.identity.displayName } : {}),
        ...(transcript.identity.username ? { username: transcript.identity.username } : {}),
        model: transcript.model,
        text: transcript.text,
        timestamp: transcript.utterance.endTimestampMs,
      },
    });
  }

  private emitStatus(): void {
    const status = this.status();
    this.options.onEvent?.({
      type: 'discord-status',
      payload: {
        status: status.status,
        ...(status.guildId ? { guildId: status.guildId } : {}),
        ...(status.voiceChannelId ? { channelId: status.voiceChannelId } : {}),
        ...(status.runtime ? { subscriptions: status.runtime.subscriptions } : {}),
        ...(status.listen !== undefined ? { listen: status.listen } : {}),
        ...(status.error ? { message: status.error } : {}),
      },
    });
  }
}

export function createDiscordRouter(controller = new DiscordVoiceController()) {
  const router = Router();

  router.get('/status', (_req, res) => {
    res.json({ ok: true, status: controller.status() });
  });

  router.post('/connect', async (req, res) => {
    const parsed = connectBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: 'Invalid Discord connection config.' });
      return;
    }
    const botToken = readSecretHeader(req, 'x-yourwifey-discord-token');
    const asrProviderKey = readSecretHeader(req, 'x-yourwifey-asr-provider-key');
    if (!botToken || !asrProviderKey) {
      res.status(400).json({ ok: false, error: 'Discord bot token and ASR provider key headers are required.' });
      return;
    }
    try {
      const status = await controller.connect(parsed.data, { asrProviderKey, botToken });
      res.json({ ok: true, status });
    } catch (error) {
      res.status(502).json({
        ok: false,
        error: redactError(error, { asrProviderKey, botToken }),
        status: controller.status(),
      });
    }
  });

  router.post('/disconnect', async (_req, res) => {
    const status = await controller.disconnect();
    res.json({ ok: true, status });
  });

  return router;
}

export function mapAsrProvider(provider: DiscordConnectConfig['asrProvider']) {
  switch (provider) {
    case 'fish':
      return 'fish-speech' as const;
    case 'vercel':
      return 'vercel-gateway' as const;
    case 'openrouter':
      return 'openrouter' as const;
  }
}

function resolveConnectConfig(config: DiscordConnectConfig): ResolvedDiscordConnectConfig {
  const vad = {
    endSilenceMs: config.vadEndSilenceMs ?? DEFAULT_VAD.endSilenceMs,
    maxUtteranceMs: config.vadMaxSpeechMs ?? DEFAULT_VAD.maxUtteranceMs,
    minSpeechMs: config.vadMinSpeechMs ?? DEFAULT_VAD.minSpeechMs,
    startThreshold: config.vadThreshold ?? DEFAULT_VAD.startThreshold,
  };
  if (vad.maxUtteranceMs < vad.minSpeechMs) {
    throw new Error('Maximum speech duration must be at least the minimum speech duration.');
  }
  return {
    asrProvider: config.asrProvider,
    guildId: config.guildId,
    languageHint: config.languageHint,
    listen: config.listenEnabled ?? true,
    transcriptionModel: resolveTranscriptionModel(config.asrProvider, config.transcriptionModel),
    vad,
    voiceChannelId: config.voiceChannelId,
  };
}

function resolveTranscriptionModel(
  provider: DiscordConnectConfig['asrProvider'],
  requestedModel: string | undefined,
) {
  if (provider === 'fish') return 'fish-audio/asr';
  if (provider === 'vercel') return requestedModel ?? 'openai/whisper-1';
  return requestedModel ?? DEFAULT_ASR_MODEL;
}

function readSecretHeader(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === 'string' && candidate.trim() ? candidate : undefined;
}

function redactError(error: unknown, credentials: DiscordConnectCredentials): string {
  let message = error instanceof Error ? error.message : 'Discord voice connection failed.';
  for (const secret of [credentials.botToken, credentials.asrProviderKey]) {
    if (secret) message = message.split(secret).join('[redacted]');
  }
  return message || 'Discord voice connection failed.';
}
