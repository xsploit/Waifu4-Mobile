import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { joinVoiceChannel, VoiceConnectionStatus } from '@discordjs/voice';
import { DiscordTranscriber } from './DiscordTranscriber';
import { createDiscordVoiceRuntime, type DiscordVoiceStateLike } from './DiscordVoiceRuntime';

class TestClient extends EventEmitter {
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
      token: 'test-token',
      transcriber,
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
    connection.emit('stateChange', { status: VoiceConnectionStatus.Ready }, { status: VoiceConnectionStatus.Disconnected });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(joined).toHaveLength(1);
    client.emit('voiceStateUpdate', { channelId: 'channel', guildId: 'guild', id: 'human' } satisfies DiscordVoiceStateLike, { channelId: null, guildId: 'guild', id: 'human' } satisfies DiscordVoiceStateLike);
    runtime.stop();
    expect(destroyed).toBe(true);
    expect(client.destroyed).toBe(true);
  });
});
