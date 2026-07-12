import { createAudioPlayer, createAudioResource, StreamType, type AudioResource, type VoiceConnection } from '@discordjs/voice';
import { Readable } from 'node:stream';

const DISCORD_SAMPLE_RATE = 48_000;
const DISCORD_CHANNELS = 2;
const PCM16_BYTES_PER_SAMPLE = Int16Array.BYTES_PER_ELEMENT;
const PCM16_STEREO_BYTES_PER_SECOND = DISCORD_SAMPLE_RATE * DISCORD_CHANNELS * PCM16_BYTES_PER_SAMPLE;
const MAX_QUEUED_MS = 2_000;
const MAX_QUEUED_BYTES = (PCM16_STEREO_BYTES_PER_SECOND * MAX_QUEUED_MS) / 1_000;
const RESAMPLE_EPSILON = 1e-9;

/** Structurally compatible with the PCM fields emitted by the server TTS fanout. */
export type DiscordVoiceOutputChunk = {
  audio?: Uint8Array;
  cancel?: boolean;
  chunkIndex: number;
  isFinal?: boolean;
  pcm?: Uint8Array;
  sampleRate: number;
  sessionId: string;
  utteranceId: string;
};

type AudioPlayerLike = {
  off(event: 'error' | 'stateChange', listener: (...args: any[]) => void): unknown;
  on(event: 'error' | 'stateChange', listener: (...args: any[]) => void): unknown;
  play(resource: AudioResource<null>): void;
  stop(force?: boolean): boolean;
};

type VoiceConnectionLike = Pick<VoiceConnection, 'subscribe'>;

type VoiceUtteranceState = {
  dropped: boolean;
  finalChunkIndex?: number;
  key: string;
  nextChunkIndex: number;
  resampler: Pcm16Resampler;
  resource: AudioResource<null>;
  sampleRate: number;
  stream: StreamingPcmReadable;
};

export type DiscordVoiceOutputDependencies = {
  createPlayer?: () => AudioPlayerLike;
  createResource?: (input: Readable) => AudioResource<null>;
};

export type DiscordVoiceOutputOptions = DiscordVoiceOutputDependencies & {
  onError?: (error: Error) => void;
};

export interface DiscordVoiceOutputLike {
  attach(connection: VoiceConnectionLike): void;
  detach(): void;
  stop(): void;
  tryEnqueue(chunk: DiscordVoiceOutputChunk): boolean;
}

class StreamingPcmReadable extends Readable {
  private ended = false;

  public get bufferedBytes(): number {
    return this.readableLength;
  }

  public append(chunk: Buffer): void {
    if (this.ended) throw new Error('Cannot append PCM after the Discord stream has ended.');
    if (chunk.length === 0) return;
    this.push(chunk);
  }

  public finish(): void {
    if (this.ended) return;
    this.ended = true;
    this.push(null);
  }

  public cancel(): void {
    this.ended = true;
    this.destroy();
  }

  public override _read(): void {}
}

class Pcm16Resampler {
  private pending = new Int16Array(0);
  private position = 0;

  public push(pcm: Uint8Array, sampleRate: number, final: boolean): Buffer {
    if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
      throw new RangeError('PCM sample rate must be a positive integer.');
    }
    if (pcm.byteLength % PCM16_BYTES_PER_SAMPLE !== 0) {
      throw new RangeError('PCM must contain complete PCM16 samples.');
    }
    const input = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / PCM16_BYTES_PER_SAMPLE);
    const samples = new Int16Array(this.pending.length + input.length);
    samples.set(this.pending);
    samples.set(input, this.pending.length);
    const output: number[] = [];
    const step = sampleRate / DISCORD_SAMPLE_RATE;

    while (this.position + 1 < samples.length || (final && this.position < samples.length - RESAMPLE_EPSILON)) {
      const leftIndex = Math.floor(this.position);
      const rightIndex = Math.min(leftIndex + 1, samples.length - 1);
      const fraction = this.position - leftIndex;
      output.push(Math.round(samples[leftIndex] + (samples[rightIndex] - samples[leftIndex]) * fraction));
      this.position += step;
    }

    const nearestInteger = Math.round(this.position);
    if (Math.abs(this.position - nearestInteger) < RESAMPLE_EPSILON) this.position = nearestInteger;
    const consumed = Math.min(Math.floor(this.position), samples.length);
    this.pending = samples.slice(consumed);
    this.position -= consumed;
    if (final && this.pending.length > 0) {
      output.push(this.pending[this.pending.length - 1]);
      this.pending = new Int16Array(0);
      this.position = 0;
    }
    return monoToStereoPcm16(output);
  }
}

function monoToStereoPcm16(samples: readonly number[]): Buffer {
  const output = Buffer.allocUnsafe(samples.length * DISCORD_CHANNELS * PCM16_BYTES_PER_SAMPLE);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-32_768, Math.min(32_767, samples[index]));
    output.writeInt16LE(sample, index * DISCORD_CHANNELS * PCM16_BYTES_PER_SAMPLE);
    output.writeInt16LE(sample, (index * DISCORD_CHANNELS + 1) * PCM16_BYTES_PER_SAMPLE);
  }
  return output;
}

/**
 * Optional, non-blocking Discord playback for streaming PCM. It owns one reusable
 * AudioPlayer while the runtime owns the VoiceConnection lifecycle.
 */
export class DiscordVoiceOutput implements DiscordVoiceOutputLike {
  private active: VoiceUtteranceState | undefined;
  private attached = false;
  private readonly dropped = new Set<string>();
  private readonly player: AudioPlayerLike;
  private pendingBytes = 0;
  private readonly pendingChunks: Array<{ chunk: DiscordVoiceOutputChunk; estimatedBytes: number }> = [];
  private pendingScheduled = false;
  private readonly queue: VoiceUtteranceState[] = [];
  private readonly states = new Map<string, VoiceUtteranceState>();
  private subscription: { unsubscribe?: () => void } | undefined;

  public constructor(private readonly options: DiscordVoiceOutputOptions = {}) {
    this.player = options.createPlayer?.() ?? createAudioPlayer();
    this.player.on('error', this.handlePlayerError);
    this.player.on('stateChange', this.handlePlayerStateChange);
  }

  public attach(connection: VoiceConnectionLike): void {
    this.detach();
    try {
      this.subscription = connection.subscribe(this.player as never) as { unsubscribe?: () => void } | undefined;
      this.attached = true;
      this.playNext();
    } catch (error) {
      this.report(error);
      this.dropAll();
    }
  }

  public detach(): void {
    this.attached = false;
    this.subscription?.unsubscribe?.();
    this.subscription = undefined;
    this.player.stop(true);
    this.pendingChunks.length = 0;
    this.pendingBytes = 0;
    this.dropAll();
  }

  public stop(): void {
    this.detach();
    this.player.off('error', this.handlePlayerError);
    this.player.off('stateChange', this.handlePlayerStateChange);
  }

  public tryEnqueue(chunk: DiscordVoiceOutputChunk): boolean {
    const key = utteranceKey(chunk);
    if (!key || !this.attached) return false;
    if (this.dropped.has(key)) {
      if (chunk.isFinal || chunk.cancel) this.dropped.delete(key);
      return false;
    }
    const audio = chunk.pcm ?? chunk.audio;
    if (
      !chunk.cancel &&
      (!audio || !Number.isInteger(chunk.sampleRate) || chunk.sampleRate <= 0 || audio.byteLength % 2 !== 0)
    ) {
      this.report(new RangeError('A complete PCM16 chunk and positive sample rate are required.'));
      return false;
    }
    const estimatedBytes = chunk.cancel
      ? 0
      : audio && Number.isInteger(chunk.sampleRate) && chunk.sampleRate > 0
        ? Math.ceil(audio.byteLength * (DISCORD_SAMPLE_RATE / chunk.sampleRate) * DISCORD_CHANNELS)
        : Number.POSITIVE_INFINITY;
    if (this.bufferedBytes() + this.pendingBytes + estimatedBytes > MAX_QUEUED_BYTES) {
      const state = this.states.get(key);
      if (state) this.dropState(state);
      this.dropped.add(key);
      return false;
    }
    this.pendingChunks.push({ chunk, estimatedBytes });
    this.pendingBytes += estimatedBytes;
    if (!this.pendingScheduled) {
      this.pendingScheduled = true;
      setImmediate(() => this.processPendingChunks());
    }
    return true;
  }

  private processPendingChunks(): void {
    this.pendingScheduled = false;
    while (this.attached && this.pendingChunks.length > 0) {
      const pending = this.pendingChunks.shift();
      if (!pending) continue;
      this.pendingBytes = Math.max(0, this.pendingBytes - pending.estimatedBytes);
      this.processChunk(pending.chunk);
    }
  }

  private processChunk(chunk: DiscordVoiceOutputChunk): boolean {
    const key = utteranceKey(chunk);
    if (!key || !this.attached) return false;
    if (this.dropped.has(key)) {
      if (chunk.isFinal) this.dropped.delete(key);
      return false;
    }

    let state = this.states.get(key);
    try {
      if (chunk.cancel) {
        if (state) {
          this.dropState(state);
          this.dropped.delete(key);
        }
        return true;
      }
      if (!state) {
        if (chunk.chunkIndex !== 0) return false;
        state = this.createState(key, chunk.sampleRate);
        this.states.set(key, state);
        this.queue.push(state);
      }
      if (state.finalChunkIndex !== undefined) {
        return chunk.chunkIndex <= state.finalChunkIndex;
      }
      if (chunk.chunkIndex < state.nextChunkIndex) return true;
      if (chunk.chunkIndex !== state.nextChunkIndex || chunk.sampleRate !== state.sampleRate) {
        this.dropState(state);
        this.playNext();
        return false;
      }

      const pcm = chunk.pcm ?? chunk.audio;
      if (!pcm) throw new RangeError('Discord PCM chunk audio is required.');
      const converted = state.resampler.push(pcm, chunk.sampleRate, chunk.isFinal === true);
      if (this.bufferedBytes() + converted.length > MAX_QUEUED_BYTES) {
        this.dropState(state);
        this.playNext();
        return false;
      }
      state.stream.append(converted);
      state.nextChunkIndex += 1;
      if (chunk.isFinal) {
        state.finalChunkIndex = chunk.chunkIndex;
        state.stream.finish();
      }
      this.playNext();
      return !state.dropped;
    } catch (error) {
      if (state) this.dropState(state);
      this.playNext();
      this.report(error);
      return false;
    }
  }

  private createState(key: string, sampleRate: number): VoiceUtteranceState {
    const stream = new StreamingPcmReadable({ highWaterMark: MAX_QUEUED_BYTES });
    const state: VoiceUtteranceState = {
      dropped: false,
      key,
      nextChunkIndex: 0,
      resampler: new Pcm16Resampler(),
      resource: (this.options.createResource ?? createRawPcmResource)(stream),
      sampleRate,
      stream,
    };
    stream.on('error', (error) => {
      this.dropState(state, error);
      this.playNext();
    });
    return state;
  }

  private playNext(): void {
    if (!this.attached || this.active) return;
    while (this.queue.length > 0) {
      const state = this.queue.shift();
      if (!state || !this.states.has(state.key)) continue;
      this.active = state;
      try {
        this.player.play(state.resource);
      } catch (error) {
        this.dropState(state, error);
        continue;
      }
      return;
    }
  }

  private readonly handlePlayerError = (error: Error): void => {
    if (this.active) this.dropState(this.active, error);
    else this.report(error);
    this.playNext();
  };

  private readonly handlePlayerStateChange = (_oldState: unknown, newState: { status?: string }): void => {
    if (newState.status !== 'idle' || !this.active) return;
    const state = this.active;
    this.active = undefined;
    this.states.delete(state.key);
    this.playNext();
  };

  private dropState(state: VoiceUtteranceState, error?: unknown): void {
    const wasActive = this.active === state;
    state.dropped = true;
    this.states.delete(state.key);
    this.dropped.add(state.key);
    const index = this.queue.indexOf(state);
    if (index >= 0) this.queue.splice(index, 1);
    state.stream.cancel();
    if (wasActive) {
      this.active = undefined;
      this.player.stop(true);
    }
    if (error) this.report(error);
  }

  private dropAll(): void {
    for (const state of [...this.states.values()]) this.dropState(state);
    this.queue.length = 0;
    this.active = undefined;
    this.dropped.clear();
  }

  private bufferedBytes(): number {
    let total = 0;
    for (const state of this.states.values()) total += state.stream.bufferedBytes;
    return total;
  }

  private report(error: unknown): void {
    this.options.onError?.(error instanceof Error ? error : new Error('Discord voice output failed.'));
  }
}

function utteranceKey(chunk: DiscordVoiceOutputChunk): string | undefined {
  if (!chunk || !chunk.sessionId || !chunk.utteranceId || !Number.isInteger(chunk.chunkIndex) || chunk.chunkIndex < 0) return undefined;
  return `${chunk.sessionId}\u0000${chunk.utteranceId}`;
}

function createRawPcmResource(input: Readable): AudioResource<null> {
  return createAudioResource(input, { inputType: StreamType.Raw });
}

export function createDiscordVoiceOutput(options?: DiscordVoiceOutputOptions): DiscordVoiceOutput {
  return new DiscordVoiceOutput(options);
}
