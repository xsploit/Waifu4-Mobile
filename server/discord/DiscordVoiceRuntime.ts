import { Client, GatewayIntentBits } from 'discord.js';
import {
  entersState,
  joinVoiceChannel,
  VoiceConnectionStatus,
  type VoiceConnection,
  type DiscordGatewayAdapterCreator,
} from '@discordjs/voice';
import { DiscordTranscriber, createDiscordAudioTranscriber, type DiscordTranscriptionConfig, type DiscordVoiceTranscript } from './DiscordTranscriber';
import { DiscordVoiceReceive, type DiscordVoiceUser } from './DiscordVoiceReceive';
import type { DiscordVoiceOutputChunk, DiscordVoiceOutputLike } from './DiscordVoiceOutput';
import type { VoiceActivityDetectorConfig, VoiceUtterance } from './VoiceActivityDetector';

type DiscordClientLike = {
  destroy: () => void | Promise<void>;
  guilds: { cache: { get: (guildId: string) => { voiceAdapterCreator: DiscordGatewayAdapterCreator } | undefined } };
  isReady?: () => boolean;
  login: (token: string) => Promise<unknown>;
  off: (event: 'ready' | 'voiceStateUpdate', listener: (...args: any[]) => void) => unknown;
  on: (event: 'voiceStateUpdate', listener: (oldState: DiscordVoiceStateLike, newState: DiscordVoiceStateLike) => void) => unknown;
  once: (event: 'ready', listener: () => void) => unknown;
  user?: { id: string } | null;
  users: { cache: { get: (userId: string) => DiscordVoiceUser | undefined }; fetch: (userId: string) => Promise<DiscordVoiceUser> };
};

export type DiscordVoiceStateLike = {
  channelId: string | null;
  guildId: string;
  id: string;
};

export type DiscordVoiceRuntimeStatus = {
  channelId: string;
  connected: boolean;
  guildId: string;
  listening: boolean;
  started: boolean;
  subscriptions: number;
};

export type DiscordVoiceRuntimeDependencies = {
  createClient?: () => DiscordClientLike;
  createReceive?: (connection: VoiceConnection, options: ConstructorParameters<typeof DiscordVoiceReceive>[1]) => DiscordVoiceReceive;
  createTranscriber?: (config: DiscordTranscriptionConfig) => DiscordTranscriber;
  entersReady?: (connection: VoiceConnection, timeoutMs: number) => Promise<VoiceConnection>;
  join?: (options: Parameters<typeof joinVoiceChannel>[0]) => VoiceConnection;
  setTimeout?: typeof globalThis.setTimeout;
};

export type DiscordVoiceRuntimeOptions = {
  channelId: string;
  guildId: string;
  listen?: boolean;
  onError?: (error: Error) => void;
  onStatusChange?: (status: DiscordVoiceRuntimeStatus) => void;
  onTranscript?: (transcript: DiscordVoiceTranscript) => void | Promise<void>;
  readyTimeoutMs?: number;
  reconnectDelayMs?: number;
  token: string;
  transcription?: DiscordTranscriptionConfig;
  transcriber?: DiscordTranscriber;
  vad?: Partial<Omit<VoiceActivityDetectorConfig, 'sampleRate'>>;
  voiceOutput?: DiscordVoiceOutputLike;
} & DiscordVoiceRuntimeDependencies;

const DEFAULT_READY_TIMEOUT_MS = 15_000;
const DEFAULT_RECONNECT_DELAY_MS = 2_000;

function createDefaultClient(): DiscordClientLike {
  return new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] }) as unknown as DiscordClientLike;
}

/**
 * Lifecycle owner for a single guild/channel receive session. DAVE decryption is
 * performed by @discordjs/voice before receiver subscriptions receive Opus packets.
 */
export class DiscordVoiceRuntime {
  private readonly client: DiscordClientLike;
  private readonly readyTimeoutMs: number;
  private readonly reconnectDelayMs: number;
  private readonly transcriber: DiscordTranscriber;
  private connection?: VoiceConnection;
  private receive?: DiscordVoiceReceive;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private started = false;
  private stopping = false;

  public constructor(private readonly options: DiscordVoiceRuntimeOptions) {
    if (!options.token.trim()) throw new Error('Discord bot token is required.');
    if (!options.guildId.trim() || !options.channelId.trim()) throw new Error('Discord guild and channel IDs are required.');
    this.client = options.createClient?.() ?? createDefaultClient();
    this.readyTimeoutMs = options.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS;
    this.reconnectDelayMs = options.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS;
    if (!Number.isInteger(this.readyTimeoutMs) || this.readyTimeoutMs <= 0) throw new RangeError('readyTimeoutMs must be a positive integer.');
    if (!Number.isInteger(this.reconnectDelayMs) || this.reconnectDelayMs < 0) throw new RangeError('reconnectDelayMs must be a non-negative integer.');
    this.transcriber = options.transcriber ?? (options.createTranscriber ?? ((config) => new DiscordTranscriber({
      onError: (error) => this.report(error),
      onTranscript: options.onTranscript,
      transcribe: createDiscordAudioTranscriber(config),
    })))(this.requireTranscription());
  }

  public status(): DiscordVoiceRuntimeStatus {
    return {
      channelId: this.options.channelId,
      connected: this.connection?.state.status === VoiceConnectionStatus.Ready,
      guildId: this.options.guildId,
      listening: this.options.listen ?? true,
      started: this.started,
      subscriptions: this.receive?.subscriptionCount ?? 0,
    };
  }

  public async start(): Promise<void> {
    if (this.started) return;
    this.stopping = false;
    await this.client.login(this.options.token);
    await this.waitForClientReady();
    this.client.on('voiceStateUpdate', this.handleVoiceStateUpdate);
    this.started = true;
    this.reportStatus();
    await this.join();
  }

  public stop(): void {
    this.stopping = true;
    this.started = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.client.off('voiceStateUpdate', this.handleVoiceStateUpdate);
    this.options.voiceOutput?.stop();
    this.teardownConnection(false);
    this.transcriber.close();
    this.reportStatus();
    void this.client.destroy();
  }

  /** Attempts optional Discord playback without coupling the receive runtime to a TTS provider. */
  public tryEnqueueOutput(chunk: DiscordVoiceOutputChunk): boolean {
    return this.options.voiceOutput?.tryEnqueue(chunk) ?? false;
  }

  private async join(): Promise<void> {
    if (!this.started || this.stopping) return;
    try {
      this.teardownConnection();
      const guild = this.client.guilds.cache.get(this.options.guildId);
      if (!guild) throw new Error('Discord guild is unavailable to the bot.');
      const connection = (this.options.join ?? joinVoiceChannel)({
        adapterCreator: guild.voiceAdapterCreator,
        channelId: this.options.channelId,
        daveEncryption: true,
        group: `webwaifu-discord-receive:${this.options.guildId}`,
        guildId: this.options.guildId,
        selfDeaf: false,
        selfMute: false,
      });
      this.connection = connection;
      connection.on('error', this.report);
      connection.on('stateChange', this.handleConnectionStateChange);
      await (this.options.entersReady ?? ((target, timeoutMs) => entersState(target, VoiceConnectionStatus.Ready, timeoutMs)))(connection, this.readyTimeoutMs);
      if (!this.started || this.connection !== connection) return;
      this.options.voiceOutput?.attach(connection);
      if (this.options.listen === false) {
        this.reportStatus();
        return;
      }
      const receiveOptions: ConstructorParameters<typeof DiscordVoiceReceive>[1] = {
        getUser: (userId) => this.resolveUser(userId),
        identity: { channelId: this.options.channelId, guildId: this.options.guildId },
        isSelf: (userId) => userId === this.client.user?.id,
        onError: (error) => this.report(error),
        onUtterance: (identity, utterance) => this.enqueueUtterance(identity, utterance),
        vad: this.options.vad,
      };
      this.receive = (this.options.createReceive ?? ((target, options) => new DiscordVoiceReceive(target.receiver, options)))(connection, receiveOptions);
      this.receive.attach();
      this.reportStatus();
    } catch (error) {
      this.teardownConnection();
      this.report(error instanceof Error ? error : new Error('Discord voice connection failed.'));
      this.reportStatus();
      this.scheduleReconnect();
    }
  }

  private async waitForClientReady(): Promise<void> {
    if (this.client.isReady?.()) return;
    await new Promise<void>((resolve, reject) => {
      const timeout = (this.options.setTimeout ?? globalThis.setTimeout)(() => reject(new Error('Discord client ready timed out.')), this.readyTimeoutMs);
      this.client.once('ready', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  private readonly handleConnectionStateChange = (_oldState: unknown, newState: { status: VoiceConnectionStatus }): void => {
    if (!this.started || this.stopping) return;
    if (newState.status === VoiceConnectionStatus.Disconnected || newState.status === VoiceConnectionStatus.Destroyed) {
      this.receive?.detach();
      this.receive = undefined;
      this.options.voiceOutput?.detach();
      this.reportStatus();
      this.scheduleReconnect();
    }
  };

  private readonly handleVoiceStateUpdate = (oldState: DiscordVoiceStateLike, newState: DiscordVoiceStateLike): void => {
    if (oldState.guildId !== this.options.guildId || oldState.channelId !== this.options.channelId) return;
    if (newState.channelId !== this.options.channelId) this.receive?.stopUser(oldState.id);
  };

  private scheduleReconnect(): void {
    if (!this.started || this.stopping || this.reconnectTimer) return;
    this.reconnectTimer = (this.options.setTimeout ?? globalThis.setTimeout)(() => {
      this.reconnectTimer = undefined;
      this.reportStatus();
      void this.join();
    }, this.reconnectDelayMs);
  }

  private teardownConnection(detachOutput = true): void {
    this.receive?.detach();
    this.receive = undefined;
    if (detachOutput) this.options.voiceOutput?.detach();
    const connection = this.connection;
    this.connection = undefined;
    if (!connection) return;
    connection.off('error', this.report);
    connection.off('stateChange', this.handleConnectionStateChange);
    connection.destroy();
  }

  private async resolveUser(userId: string): Promise<DiscordVoiceUser | undefined> {
    if (userId === this.client.user?.id) return undefined;
    return this.client.users.cache.get(userId) ?? this.client.users.fetch(userId).catch(() => undefined);
  }

  private enqueueUtterance(identity: Parameters<DiscordTranscriber['enqueue']>[0], utterance: VoiceUtterance): void {
    this.transcriber.enqueue(identity, utterance);
  }

  private requireTranscription(): DiscordTranscriptionConfig {
    if (!this.options.transcription) throw new Error('Discord transcription configuration or a transcriber is required.');
    return this.options.transcription;
  }

  private readonly report = (error: Error): void => {
    this.options.onError?.(error);
  };

  private reportStatus(): void {
    this.options.onStatusChange?.(this.status());
  }
}

export function createDiscordVoiceRuntime(options: DiscordVoiceRuntimeOptions): DiscordVoiceRuntime {
  return new DiscordVoiceRuntime(options);
}
