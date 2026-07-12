import {
  transcribeAudio,
  type AudioTranscript,
  type TranscribeAudioOptions,
} from '../speech/transcribe';
import type { VoiceUtterance } from './VoiceActivityDetector';

export type DiscordVoiceIdentity = {
  channelId: string;
  displayName?: string;
  guildId: string;
  userId: string;
  username?: string;
};

export type DiscordVoiceTranscript = {
  identity: DiscordVoiceIdentity;
  utterance: VoiceUtterance;
  wav: Uint8Array;
} & AudioTranscript;

export type DiscordTranscriberOptions = {
  maxConcurrent?: number;
  maxQueuedPerUser?: number;
  maxQueuedUtterances?: number;
  onDropped?: (identity: DiscordVoiceIdentity) => void;
  onError?: (error: Error, identity: DiscordVoiceIdentity) => void;
  onTranscript?: (transcript: DiscordVoiceTranscript) => void | Promise<void>;
  sampleRate?: number;
  transcribe: (audio: Uint8Array, identity: DiscordVoiceIdentity) => Promise<AudioTranscript>;
};

export type DiscordTranscriptionConfig = Omit<TranscribeAudioOptions, 'audio'>;

type PendingUtterance = {
  identity: DiscordVoiceIdentity;
  utterance: VoiceUtterance;
  wav: Uint8Array;
};

const DEFAULT_MAX_CONCURRENT = 2;
const DEFAULT_MAX_QUEUED_PER_USER = 2;
const DEFAULT_MAX_QUEUED_UTTERANCES = 16;
const DEFAULT_SAMPLE_RATE = 48_000;

/** Encodes mono signed 16-bit little-endian PCM as a standards-compliant WAV file. */
export function encodeMonoPcm16Wav(
  utterance: VoiceUtterance,
  sampleRate = DEFAULT_SAMPLE_RATE,
): Uint8Array {
  if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
    throw new RangeError('sampleRate must be a positive integer');
  }

  const sampleCount = utterance.frames.reduce((count, frame) => count + frame.samples.length, 0);
  const dataBytes = sampleCount * Int16Array.BYTES_PER_ELEMENT;
  const wav = Buffer.allocUnsafe(44 + dataBytes);
  wav.write('RIFF', 0, 'ascii');
  wav.writeUInt32LE(36 + dataBytes, 4);
  wav.write('WAVEfmt ', 8, 'ascii');
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36, 'ascii');
  wav.writeUInt32LE(dataBytes, 40);

  let offset = 44;
  for (const frame of utterance.frames) {
    for (const sample of frame.samples) {
      wav.writeInt16LE(sample, offset);
      offset += 2;
    }
  }
  return wav;
}

export function createDiscordAudioTranscriber(config: DiscordTranscriptionConfig) {
  return async (audio: Uint8Array): Promise<AudioTranscript> => transcribeAudio({ ...config, audio });
}

/**
 * Bounded FIFO transcription queue. Identity is retained with every queued WAV so
 * completion and failure callbacks can always be attributed to the speaker.
 */
export class DiscordTranscriber {
  private readonly maxConcurrent: number;
  private readonly maxQueuedPerUser: number;
  private readonly maxQueuedUtterances: number;
  private readonly sampleRate: number;
  private readonly pending: PendingUtterance[] = [];
  private readonly queuedByUser = new Map<string, number>();
  private readonly activeUsers = new Set<string>();
  private active = 0;
  private closed = false;

  public constructor(private readonly options: DiscordTranscriberOptions) {
    this.maxConcurrent = options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
    this.maxQueuedPerUser = options.maxQueuedPerUser ?? DEFAULT_MAX_QUEUED_PER_USER;
    this.maxQueuedUtterances = options.maxQueuedUtterances ?? DEFAULT_MAX_QUEUED_UTTERANCES;
    this.sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;
    for (const [name, value] of [
      ['maxConcurrent', this.maxConcurrent],
      ['maxQueuedPerUser', this.maxQueuedPerUser],
      ['maxQueuedUtterances', this.maxQueuedUtterances],
      ['sampleRate', this.sampleRate],
    ] as const) {
      if (!Number.isInteger(value) || value <= 0) {
        throw new RangeError(`${name} must be a positive integer`);
      }
    }
  }

  public enqueue(identity: DiscordVoiceIdentity, utterance: VoiceUtterance): boolean {
    if (this.closed || this.pending.length >= this.maxQueuedUtterances) {
      this.options.onDropped?.(identity);
      return false;
    }
    const queuedForUser = this.queuedByUser.get(identity.userId) ?? 0;
    if (queuedForUser >= this.maxQueuedPerUser) {
      this.options.onDropped?.(identity);
      return false;
    }

    this.pending.push({
      identity,
      utterance,
      wav: encodeMonoPcm16Wav(utterance, this.sampleRate),
    });
    this.queuedByUser.set(identity.userId, queuedForUser + 1);
    this.pump();
    return true;
  }

  public close(): void {
    this.closed = true;
    while (this.pending.length > 0) {
      const item = this.pending.shift();
      if (item) {
        this.decrementQueued(item.identity.userId);
        this.options.onDropped?.(item.identity);
      }
    }
  }

  public async drain(): Promise<void> {
    while (this.active > 0 || this.pending.length > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  private pump(): void {
    while (!this.closed && this.active < this.maxConcurrent && this.pending.length > 0) {
      const index = this.pending.findIndex((item) => !this.activeUsers.has(item.identity.userId));
      if (index < 0) return;
      const [item] = this.pending.splice(index, 1);
      if (!item) return;
      this.decrementQueued(item.identity.userId);
      this.active += 1;
      this.activeUsers.add(item.identity.userId);
      void this.run(item);
    }
  }

  private async run(item: PendingUtterance): Promise<void> {
    try {
      const transcript = await this.options.transcribe(item.wav, item.identity);
      if (!this.closed) {
        await this.options.onTranscript?.({ ...transcript, ...item });
      }
    } catch (error) {
      if (!this.closed) {
        this.options.onError?.(error instanceof Error ? error : new Error('Discord transcription failed.'), item.identity);
      }
    } finally {
      this.active -= 1;
      this.activeUsers.delete(item.identity.userId);
      this.pump();
    }
  }

  private decrementQueued(userId: string): void {
    const queued = this.queuedByUser.get(userId) ?? 0;
    if (queued <= 1) {
      this.queuedByUser.delete(userId);
    } else {
      this.queuedByUser.set(userId, queued - 1);
    }
  }
}
