import { EndBehaviorType } from '@discordjs/voice';
import prism from 'prism-media';
import type { Readable } from 'node:stream';
import { VoiceActivityDetector, type VoiceActivityDetectorConfig, type VoiceUtterance } from './VoiceActivityDetector';
import type { DiscordVoiceIdentity } from './DiscordTranscriber';

export type DiscordVoiceUser = {
  bot: boolean;
  displayName?: string;
  id: string;
  username?: string;
};

export type DiscordVoiceReceiveOptions = {
  createDecoder?: () => PcmDecoder;
  createVad?: () => VoiceActivityDetector;
  getUser: (userId: string) => Promise<DiscordVoiceUser | undefined> | DiscordVoiceUser | undefined;
  identity: Omit<DiscordVoiceIdentity, 'displayName' | 'userId' | 'username'>;
  isSelf: (userId: string) => boolean;
  now?: () => number;
  onError?: (error: Error, userId?: string) => void;
  onUtterance: (identity: DiscordVoiceIdentity, utterance: VoiceUtterance) => void;
  receiveSilenceMs?: number;
  vad?: Partial<Omit<VoiceActivityDetectorConfig, 'sampleRate'>>;
};

export interface PcmDecoder {
  destroy?: () => void;
  on(event: 'data', listener: (chunk: Buffer) => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
  pipe<T extends NodeJS.WritableStream>(destination: T): T;
  removeAllListeners?: () => void;
}

type VoiceReceiverLike = {
  speaking: {
    off(event: 'start', listener: (userId: string) => void): unknown;
    on(event: 'start', listener: (userId: string) => void): unknown;
  };
  subscribe(userId: string, options: { end: { behavior: EndBehaviorType.AfterSilence; duration: number } }): Readable;
};

interface ReceiverSubscription {
  decoder: PcmDecoder;
  identity: DiscordVoiceIdentity;
  stream: Readable;
  trailing: Buffer;
  vad: VoiceActivityDetector;
  nextTimestampMs: number;
}

const SAMPLE_RATE = 48_000;
const CHANNELS = 2;
const FRAME_MS = 20;
const SAMPLES_PER_FRAME = (SAMPLE_RATE / 1_000) * FRAME_MS;
const STEREO_PCM_BYTES_PER_FRAME = SAMPLES_PER_FRAME * CHANNELS * Int16Array.BYTES_PER_ELEMENT;
const DEFAULT_RECEIVE_SILENCE_MS = 1_200;

function createPrismDecoder(): PcmDecoder {
  // prism resolves the installed @discordjs/opus implementation at runtime.
  return new prism.opus.Decoder({ channels: CHANNELS, frameSize: SAMPLES_PER_FRAME, rate: SAMPLE_RATE });
}

function createDefaultVad(overrides: DiscordVoiceReceiveOptions['vad']): VoiceActivityDetector {
  return new VoiceActivityDetector({
    endSilenceMs: 600,
    maxUtteranceMs: 20_000,
    minSpeechMs: 240,
    preRollMs: 120,
    sampleRate: SAMPLE_RATE,
    startThreshold: 0.025,
    ...overrides,
  });
}

function stereoToMonoPcm16(stereo: Buffer): Int16Array {
  const stereoSamples = stereo.length / Int16Array.BYTES_PER_ELEMENT;
  if (!Number.isInteger(stereoSamples) || stereoSamples % CHANNELS !== 0) {
    throw new RangeError('Decoded PCM must contain complete stereo PCM16 samples.');
  }
  const mono = new Int16Array(stereoSamples / CHANNELS);
  for (let source = 0, target = 0; source < stereoSamples; source += CHANNELS, target += 1) {
    const left = stereo.readInt16LE(source * Int16Array.BYTES_PER_ELEMENT);
    const right = stereo.readInt16LE((source + 1) * Int16Array.BYTES_PER_ELEMENT);
    mono[target] = Math.max(-32_768, Math.min(32_767, Math.round((left + right) / 2)));
  }
  return mono;
}

/**
 * Owns inbound subscriptions for one connection. Each human gets exactly one Opus
 * subscription, decoder, PCM remainder, and VAD state until the stream or runtime ends.
 */
export class DiscordVoiceReceive {
  private readonly subscriptions = new Map<string, ReceiverSubscription>();
  private readonly pendingUsers = new Set<string>();
  private attached = false;

  public constructor(
    private readonly receiver: VoiceReceiverLike,
    private readonly options: DiscordVoiceReceiveOptions,
  ) {}

  public get subscriptionCount(): number {
    return this.subscriptions.size;
  }

  public attach(): void {
    if (this.attached) return;
    this.receiver.speaking.on('start', this.handleSpeakingStart);
    this.attached = true;
  }

  public detach(): void {
    if (this.attached) {
      this.receiver.speaking.off('start', this.handleSpeakingStart);
      this.attached = false;
    }
    for (const userId of [...this.subscriptions.keys()]) {
      this.stopUser(userId);
    }
  }

  public stopUser(userId: string): void {
    const subscription = this.subscriptions.get(userId);
    if (!subscription) return;
    this.subscriptions.delete(userId);
    subscription.stream.removeAllListeners();
    subscription.stream.destroy();
    subscription.decoder.removeAllListeners?.();
    subscription.decoder.destroy?.();
    this.emitUtterances(subscription.identity, subscription.vad.disconnect(userId));
  }

  private readonly handleSpeakingStart = (userId: string): void => {
    void this.startUser(userId);
  };

  private async startUser(userId: string): Promise<void> {
    if (!this.attached || this.subscriptions.has(userId) || this.pendingUsers.has(userId) || this.options.isSelf(userId)) return;
    this.pendingUsers.add(userId);
    try {
      const user = await this.options.getUser(userId);
      if (!this.attached || this.subscriptions.has(userId) || !user || user.bot || this.options.isSelf(userId)) return;

      const stream = this.receiver.subscribe(userId, {
        end: { behavior: EndBehaviorType.AfterSilence, duration: this.options.receiveSilenceMs ?? DEFAULT_RECEIVE_SILENCE_MS },
      });
      const decoder = this.options.createDecoder?.() ?? createPrismDecoder();
      const identity: DiscordVoiceIdentity = {
        ...this.options.identity,
        displayName: user.displayName,
        userId: user.id,
        username: user.username,
      };
      const subscription: ReceiverSubscription = {
        decoder,
        identity,
        nextTimestampMs: this.now(),
        stream,
        trailing: Buffer.alloc(0),
        vad: this.options.createVad?.() ?? createDefaultVad(this.options.vad),
      };
      this.subscriptions.set(userId, subscription);
      decoder.on('data', (chunk) => this.handlePcm(userId, chunk));
      decoder.on('error', (error) => this.report(error, userId));
      stream.on('error', (error) => this.report(error, userId));
      stream.once('end', () => this.stopUser(userId));
      stream.once('close', () => this.stopUser(userId));
      stream.pipe(decoder as unknown as NodeJS.WritableStream);
    } catch (error) {
      this.report(error instanceof Error ? error : new Error('Discord voice receive setup failed.'), userId);
    } finally {
      this.pendingUsers.delete(userId);
    }
  }

  private handlePcm(userId: string, chunk: Buffer): void {
    const subscription = this.subscriptions.get(userId);
    if (!subscription || chunk.length === 0) return;
    const combined = subscription.trailing.length === 0 ? chunk : Buffer.concat([subscription.trailing, chunk]);
    let offset = 0;
    while (offset + STEREO_PCM_BYTES_PER_FRAME <= combined.length) {
      const frame = combined.subarray(offset, offset + STEREO_PCM_BYTES_PER_FRAME);
      const timestampMs = Math.max(this.now(), subscription.nextTimestampMs);
      subscription.nextTimestampMs = timestampMs + FRAME_MS;
      this.emitUtterances(subscription.identity, subscription.vad.push({
        samples: stereoToMonoPcm16(frame),
        speakerId: userId,
        timestampMs,
      }));
      offset += STEREO_PCM_BYTES_PER_FRAME;
    }
    subscription.trailing = Buffer.from(combined.subarray(offset));
  }

  private emitUtterances(identity: DiscordVoiceIdentity, utterances: VoiceUtterance[]): void {
    for (const utterance of utterances) {
      this.options.onUtterance(identity, utterance);
    }
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  private report(error: Error, userId?: string): void {
    this.options.onError?.(error, userId);
  }
}
