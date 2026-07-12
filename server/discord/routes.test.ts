import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { describe, expect, it } from 'vitest';
import type { StreamBotEvent } from '../../src/shared/streamEvents';
import type { DiscordVoiceRuntimeOptions, DiscordVoiceRuntimeStatus } from './DiscordVoiceRuntime';
import {
  createDiscordRouter,
  DiscordVoiceController,
  mapAsrProvider,
  type DiscordConnectConfig,
} from './routes';

const config: DiscordConnectConfig = {
  asrProvider: 'openrouter',
  guildId: 'guild-1',
  languageHint: 'en',
  listenEnabled: true,
  transcriptionModel: 'openai/whisper-large-v3',
  vadEndSilenceMs: 900,
  vadMaxSpeechMs: 20_000,
  vadMinSpeechMs: 300,
  vadThreshold: 0.04,
  voiceChannelId: 'channel-1',
};

class FakeRuntime {
  public stopped = false;
  public readonly sentMessages: string[] = [];
  private statusValue: DiscordVoiceRuntimeStatus;

  public constructor(
    public readonly options: DiscordVoiceRuntimeOptions,
    private readonly startError?: Error,
  ) {
    this.statusValue = {
      channelId: options.channelId,
      connected: false,
      guildId: options.guildId,
      listening: options.listen ?? true,
      started: false,
      subscriptions: 0,
    };
  }

  public async start(): Promise<void> {
    if (this.startError) throw this.startError;
    this.statusValue = { ...this.statusValue, connected: true, started: true };
    this.options.onStatusChange?.(this.status());
  }

  public stop(): void {
    this.stopped = true;
    this.statusValue = { ...this.statusValue, connected: false, started: false };
    this.options.onStatusChange?.(this.status());
  }

  public status(): DiscordVoiceRuntimeStatus {
    return this.statusValue;
  }

  public tryEnqueueOutput(): boolean {
    return true;
  }

  public async sendReplyText(text: string): Promise<void> {
    this.sentMessages.push(text);
  }

  public emitTranscript(): void {
    void this.options.onTranscript?.({
      identity: {
        channelId: this.options.channelId,
        displayName: 'Display Name',
        guildId: this.options.guildId,
        userId: 'user-1',
        username: 'username',
      },
      model: 'openai/whisper-large-v3',
      text: 'hello from Discord',
      utterance: {
        endTimestampMs: 1_234,
        frames: [],
        speakerId: 'user-1',
        speechDurationMs: 200,
        startTimestampMs: 1_034,
      },
      wav: new Uint8Array(),
    });
  }

  public emitError(message: string): void {
    this.options.onError?.(new Error(message));
  }
}

describe('DiscordVoiceController', () => {
  it('owns one runtime, maps UI ASR settings, and broadcasts public transcript/status events', async () => {
    const events: StreamBotEvent[] = [];
    const runtimes: FakeRuntime[] = [];
    const controller = new DiscordVoiceController({
      createRuntime: (options) => {
        const runtime = new FakeRuntime(options);
        runtimes.push(runtime);
        return runtime;
      },
      onEvent: (event) => events.push(event),
    });

    const connected = await controller.connect(config, {
      asrProviderKey: 'asr-secret',
      botToken: 'bot-secret',
    });

    expect(runtimes).toHaveLength(1);
    expect(runtimes[0]?.options).toMatchObject({
      channelId: 'channel-1',
      guildId: 'guild-1',
      listen: true,
      transcription: {
        language: 'en',
        model: 'openai/whisper-large-v3',
        provider: 'openrouter',
      },
      vad: {
        endSilenceMs: 900,
        maxUtteranceMs: 20_000,
        minSpeechMs: 300,
        startThreshold: 0.04,
      },
    });
    expect(connected).toMatchObject({
      guildId: 'guild-1',
      listen: true,
      status: 'connected',
      voiceChannelId: 'channel-1',
    });
    expect(JSON.stringify(connected)).not.toContain('bot-secret');
    expect(JSON.stringify(connected)).not.toContain('asr-secret');

    runtimes[0]?.emitTranscript();
    expect(events).toContainEqual({
      type: 'discord-transcript',
      payload: {
        channelId: 'channel-1',
        displayName: 'Display Name',
        guildId: 'guild-1',
        model: 'openai/whisper-large-v3',
        text: 'hello from Discord',
        timestamp: 1_234,
        userId: 'user-1',
        username: 'username',
      },
    });
    expect(events.some((event) => event.type === 'discord-status')).toBe(true);

    runtimes[0]?.emitError('receive failed');
    expect(controller.status()).toMatchObject({ error: 'receive failed', status: 'error' });
    expect(events).toContainEqual({
      type: 'discord-error',
      payload: { channelId: 'channel-1', guildId: 'guild-1', message: 'receive failed' },
    });

    await controller.connect({ ...config, asrProvider: 'fish', listenEnabled: false }, {
      asrProviderKey: 'fish-secret',
      botToken: 'new-bot-secret',
    });
    expect(runtimes).toHaveLength(2);
    expect(runtimes[0]?.stopped).toBe(true);
    expect(runtimes[1]?.options).toMatchObject({
      listen: false,
      transcription: { model: 'fish-audio/asr', provider: 'fish-speech' },
    });

    await controller.disconnect();
    await controller.disconnect();
    expect(runtimes[1]?.stopped).toBe(true);
    expect(controller.status()).toEqual({ runtime: null, status: 'disconnected' });
  });

  it('redacts credentials before broadcasting connection errors', async () => {
    const events: StreamBotEvent[] = [];
    const controller = new DiscordVoiceController({
      createRuntime: (options) => new FakeRuntime(options, new Error('Discord rejected bot-secret and asr-secret.')),
      onEvent: (event) => events.push(event),
    });

    await expect(
      controller.connect(config, { asrProviderKey: 'asr-secret', botToken: 'bot-secret' }),
    ).rejects.toThrow('[redacted]');

    const publicOutput = JSON.stringify({ events, status: controller.status() });
    expect(publicOutput).not.toContain('bot-secret');
    expect(publicOutput).not.toContain('asr-secret');
    expect(events.some((event) => event.type === 'discord-error')).toBe(true);
  });

  it('maps each UI provider to its speech implementation', () => {
    expect(mapAsrProvider('fish')).toBe('fish-speech');
    expect(mapAsrProvider('openrouter')).toBe('openrouter');
    expect(mapAsrProvider('vercel')).toBe('vercel-gateway');
  });
});

describe('Discord control routes', () => {
  it('requires header credentials and never returns request secrets', async () => {
    const controller = new DiscordVoiceController({
      createRuntime: (options) => new FakeRuntime(options),
    });
    const app = express();
    app.use(express.json());
    app.use('/api/discord', createDiscordRouter(controller));
    const server = createServer(app);

    try {
      await listen(server);
      const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/discord`;

      const invalid = await request(baseUrl, '/connect', {
        ...config,
        botToken: 'body-secret',
      }, {
        'x-yourwifey-asr-provider-key': 'asr-secret',
        'x-yourwifey-discord-token': 'bot-secret',
      });
      expect(invalid.status).toBe(400);
      expect(JSON.stringify(await invalid.json())).not.toContain('body-secret');

      const missing = await request(baseUrl, '/connect', config);
      expect(missing.status).toBe(400);

      const connected = await request(baseUrl, '/connect', config, {
        'x-yourwifey-asr-provider-key': 'asr-secret',
        'x-yourwifey-discord-token': 'bot-secret',
      });
      const connectedBody = await connected.json() as { ok: boolean; status: { status: string } };
      expect(connected.status).toBe(200);
      expect(connectedBody).toMatchObject({ ok: true, status: { status: 'connected' } });
      expect(JSON.stringify(connectedBody)).not.toContain('bot-secret');
      expect(JSON.stringify(connectedBody)).not.toContain('asr-secret');

      const status = await fetch(`${baseUrl}/status`);
      expect(await status.json()).toMatchObject({ ok: true, status: { status: 'connected' } });

      const unauthorizedMessage = await request(baseUrl, '/message', { text: 'nope' });
      expect(unauthorizedMessage.status).toBe(403);

      const message = await request(baseUrl, '/message', { text: 'hello Discord' }, {
        'x-yourwifey-discord-token': 'bot-secret',
      });
      expect(await message.json()).toEqual({ ok: true });

      const disconnected = await request(baseUrl, '/disconnect');
      expect(await disconnected.json()).toMatchObject({ ok: true, status: { status: 'disconnected' } });
    } finally {
      await closeServer(server);
    }
  });
});

function listen(server: Server): Promise<void> {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function request(
  baseUrl: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
) {
  return fetch(`${baseUrl}${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...headers },
    method: 'POST',
  });
}
