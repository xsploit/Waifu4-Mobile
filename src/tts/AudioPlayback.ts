export type PlaybackStatus = 'idle' | 'playing';

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

export type PlaybackSnapshot = {
  status: PlaybackStatus;
  chunks: number;
  bytes: number;
  queuedSeconds: number;
  amplitude: number;
};

type AudioNodeLike = {
  connect(destination: unknown): void;
  start(when: number): void;
  stop?: () => void;
  onended: (() => void) | null;
};

type AudioContextLike = {
  currentTime: number;
  state: string;
  destination: unknown;
  resume(): Promise<void>;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBufferLike;
  createBufferSource(): AudioNodeLike & { buffer: AudioBufferLike | null };
};

type AudioBufferLike = {
  duration: number;
  getChannelData(channel: number): Float32Array;
};

export class AudioPlayback {
  private context: AudioContextLike | null;
  private playhead = 0;
  private activeSources = 0;
  private sources = new Set<AudioNodeLike>();
  private snapshot: PlaybackSnapshot = {
    status: 'idle',
    chunks: 0,
    bytes: 0,
    queuedSeconds: 0,
    amplitude: 0,
  };

  constructor(
    private readonly options: {
      context?: AudioContextLike;
      onState?: (state: PlaybackSnapshot) => void;
    } = {},
  ) {
    this.context = options.context ?? null;
  }

  getState(): PlaybackSnapshot {
    return { ...this.snapshot };
  }

  reset(): void {
    this.playhead = this.context?.currentTime ?? 0;
    this.activeSources = 0;
    this.update({ status: 'idle', chunks: 0, bytes: 0, queuedSeconds: 0, amplitude: 0 });
  }

  stop(): void {
    for (const source of this.sources) {
      try {
        source.stop?.();
      } catch {
        /* already stopped */
      }
      source.onended = null;
    }
    this.sources.clear();
    this.playhead = this.context?.currentTime ?? 0;
    this.activeSources = 0;
    this.update({ status: 'idle', queuedSeconds: 0, amplitude: 0 });
  }

  async playPcmChunk(chunk: Uint8Array, sampleRate: number): Promise<PlaybackSnapshot> {
    const context = this.ensureContext();
    if (context.state === 'suspended') {
      await context.resume();
    }
    const { samples, amplitude } = pcm16ToFloat(chunk);
    if (samples.length === 0) {
      return this.getState();
    }

    const buffer = context.createBuffer(1, samples.length, sampleRate);
    buffer.getChannelData(0).set(samples);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);

    const now = context.currentTime;
    const startAt = Math.max(now, this.playhead);
    this.playhead = startAt + buffer.duration;
    this.activeSources += 1;
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      this.activeSources = Math.max(0, this.activeSources - 1);
      if (this.activeSources === 0) {
        this.update({ status: 'idle', queuedSeconds: 0, amplitude: 0 });
      }
    };
    source.start(startAt);

    this.update({
      status: 'playing',
      chunks: this.snapshot.chunks + 1,
      bytes: this.snapshot.bytes + chunk.byteLength,
      queuedSeconds: Math.max(0, this.playhead - now),
      amplitude,
    });
    return this.getState();
  }

  private ensureContext(): AudioContextLike {
    if (this.context) {
      return this.context;
    }
    const Ctor = window.AudioContext ?? window.webkitAudioContext;
    this.context = new Ctor() as AudioContextLike;
    return this.context;
  }

  private update(patch: Partial<PlaybackSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.options.onState?.(this.getState());
  }
}

export function pcm16ToFloat(bytes: Uint8Array): { samples: Float32Array; amplitude: number } {
  const sampleCount = Math.floor(bytes.byteLength / 2);
  const samples = new Float32Array(sampleCount);
  let sumSquares = 0;
  for (let i = 0; i < sampleCount; i += 1) {
    const lo = bytes[i * 2] ?? 0;
    const hi = bytes[i * 2 + 1] ?? 0;
    const signed = ((hi << 8) | lo) << 16 >> 16;
    const value = Math.max(-1, signed / 32768);
    samples[i] = value;
    sumSquares += value * value;
  }
  return {
    samples,
    amplitude: sampleCount === 0 ? 0 : Math.sqrt(sumSquares / sampleCount),
  };
}
