import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { joinVoiceChannel, VoiceConnectionStatus } from '@discordjs/voice';
import { DiscordTranscriber } from './DiscordTranscriber';
import { createDiscordVoiceRuntime, type DiscordVoiceStateLike } from './DiscordVoiceRuntime';

class TestClient extends EventEmitter {
  public readonly sentMessages: string[] = [];
  public readonly channels = {
    fetch: async () => ({
      isTextBased: () => true,
      send: async (message: { allowedMentions: { parse: [] }; content: string }) => {
        expect(message.allowedMentions).toEqual({ parse: [] });
        this.sentMessages.push(message.content);
      },
    }),
  };
  public readonly guilds = { cache: { get: () => ({ voiceAdapterCreator: () => ({ destroy() {}, sendPayload: () => true }) }) } };
  public readonly users = { cache: new Map(), fetch: async () => ({ bot: false, id: 'human' }) };
  public user = { id: 'self' };
  public loggedIn = false;
  public destroyed = false;

  public async login(): Promise<void> {
    this.loggedIn = true;
    this.emit('ready');
  }

  public isReady(): boolean { return this.loggedIn; }
  public async destroy(): Promise<void> { this.destroyed = true; }
}

describe('DiscordVoiceRuntime', () => {
  it('uses only the injected voice join lifecycle, enables DAVE receive settings, and tears down on stop', async () => {
    const client = new TestClient();
    const joined: Parameters<typeof joinVoiceChannel>[0][] = [];
    const connection = new EventEmitter() as EventEmitter & { destroy: () => void; receiver: object; state: { status: VoiceConnectionStatus } };
    connection.state = { status: VoiceConnectionStatus.Ready };
    connection.receiver = {};
    let destroyed = false;
    connection.destroy = () => { destroyed = true; };
    const output = {
      attached: [] as unknown[],
      detached: 0,
      stopped: 0,
      attach(target: unknown) { this.attached.push(target); },
      detach() { this.detached += 1; },
      stop() { this.stopped += 1; },
      tryEnqueue: () => true,
    };
    const transcriber = new DiscordTranscriber({ transcribe: async () => ({ model: 'test', text: 'ok' }) });
    const runtime = createDiscordVoiceRuntime({
      channelId: 'channel',
      createClient: () => client,
      createReceive: () => ({ attach() {}, detach() {}, stopUser() {}, subscriptionCount: 0 }) as never,
      entersReady: async (target) => target,
      guildId: 'guild',
      join: (options) => {
        joined.push(options);
        return connection as never;
      },
      reconnectDelayMs: 0,
      token: 'test-token',
      transcriber,
      voiceOutput: output as never,
    });

    await runtime.start();
    expect(joined[0]).toMatchObject({
      channelId: 'channel',
      daveEncryption: true,
      guildId: 'guild',
      selfDeaf: false,
      selfMute: false,
    });
    expect(runtime.status()).toMatchObject({ connected: true, started: true });
    await runtime.sendReplyText('hello from the waifu');
    expect(client.sentMessages).toEqual(['hello from the waifu']);
    expect(output.attached).toEqual([connection]);
    expect(runtime.tryEnqueueOutput({ audio: Buffer.alloc(0), chunkIndex: 0, sampleRate: 48_000, sessionId: 'session', utteranceId: 'utterance' })).toBe(true);
    connection.emit('stateChange', { status: VoiceConnectionStatus.Ready }, { status: VoiceConnectionStatus.Disconnected });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(joined).toHaveLength(2);
    client.emit('voiceStateUpdate', { channelId: 'channel', guildId: 'guild', id: 'human' } satisfies DiscordVoiceStateLike, { channelId: null, guildId: 'guild', id: 'human' } satisfies DiscordVoiceStateLike);
    runtime.stop();
    expect(destroyed).toBe(true);
    expect(client.destroyed).toBe(true);
    expect(output.detached).toBeGreaterThan(0);
    expect(output.stopped).toBe(1);
  });

  it('joins without attaching receive subscriptions when listening is disabled', async () => {
    const client = new TestClient();
    const connection = new EventEmitter() as EventEmitter & { destroy: () => void; receiver: object; state: { status: VoiceConnectionStatus } };
    connection.state = { status: VoiceConnectionStatus.Ready };
    connection.receiver = {};
    connection.destroy = () => {};
    let receiveCreated = 0;
    const runtime = createDiscordVoiceRuntime({
      channelId: 'channel',
      createClient: () => client,
      createReceive: () => {
        receiveCreated += 1;
        return { attach() {}, detach() {}, stopUser() {}, subscriptionCount: 0 } as never;
      },
      entersReady: async (target) => target,
      guildId: 'guild',
      join: () => connection as never,
      listen: false,
      token: 'test-token',
      transcriber: new DiscordTranscriber({ transcribe: async () => ({ model: 'test', text: 'ok' }) }),
    });

    await runtime.start();

    expect(receiveCreated).toBe(0);
    expect(runtime.status()).toMatchObject({ connected: true, listening: false, subscriptions: 0 });
    runtime.stop();
  });
});
