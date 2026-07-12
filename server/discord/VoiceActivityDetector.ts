export interface Pcm16AudioFrame {
  speakerId: string;
  timestampMs: number;
  samples: Int16Array;
}

export interface VoiceActivityDetectorConfig {
  sampleRate: number;
  startThreshold: number;
  endSilenceMs: number;
  minSpeechMs: number;
  maxUtteranceMs: number;
  preRollMs?: number;
  endThreshold?: number;
  maxTrackedSpeakers?: number;
}

export interface VoiceUtterance {
  speakerId: string;
  startTimestampMs: number;
  endTimestampMs: number;
  frames: readonly Pcm16AudioFrame[];
  speechDurationMs: number;
}

interface BufferedFrame {
  frame: Pcm16AudioFrame;
  durationMs: number;
  voiced: boolean;
}

interface SpeakerState {
  speakerId: string;
  preRoll: BufferedFrame[];
  utterance: BufferedFrame[];
  utteranceDurationMs: number;
  speechDurationMs: number;
  silenceDurationMs: number;
  lastTimestampMs: number;
  sequence: number;
}

const DEFAULT_PRE_ROLL_MS = 0;
const DEFAULT_MAX_TRACKED_SPEAKERS = 64;

/**
 * Deterministic, per-speaker energy VAD for decoded mono PCM16 frames.
 * Timestamps are frame start times in milliseconds.
 */
export class VoiceActivityDetector {
  private readonly config: Required<VoiceActivityDetectorConfig>;
  private readonly speakers = new Map<string, SpeakerState>();
  private sequence = 0;

  public constructor(config: VoiceActivityDetectorConfig) {
    const endThreshold = config.endThreshold ?? config.startThreshold;
    const normalized = {
      ...config,
      preRollMs: config.preRollMs ?? DEFAULT_PRE_ROLL_MS,
      endThreshold,
      maxTrackedSpeakers: config.maxTrackedSpeakers ?? DEFAULT_MAX_TRACKED_SPEAKERS,
    };

    if (!Number.isFinite(normalized.sampleRate) || normalized.sampleRate <= 0) {
      throw new RangeError("sampleRate must be greater than zero");
    }
    for (const [name, value] of [
      ["startThreshold", normalized.startThreshold],
      ["endThreshold", normalized.endThreshold],
    ] as const) {
      if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw new RangeError(`${name} must be between zero and one`);
      }
    }
    for (const [name, value] of [
      ["endSilenceMs", normalized.endSilenceMs],
      ["minSpeechMs", normalized.minSpeechMs],
      ["maxUtteranceMs", normalized.maxUtteranceMs],
      ["preRollMs", normalized.preRollMs],
    ] as const) {
      if (!Number.isFinite(value) || value < 0) {
        throw new RangeError(`${name} must be finite and non-negative`);
      }
    }
    if (normalized.maxUtteranceMs <= 0) {
      throw new RangeError("maxUtteranceMs must be greater than zero");
    }
    if (!Number.isInteger(normalized.maxTrackedSpeakers) || normalized.maxTrackedSpeakers <= 0) {
      throw new RangeError("maxTrackedSpeakers must be a positive integer");
    }

    this.config = normalized;
  }

  public get trackedSpeakerCount(): number {
    return this.speakers.size;
  }

  public push(frame: Pcm16AudioFrame): VoiceUtterance[] {
    this.validateFrame(frame);
    const durationMs = (frame.samples.length / this.config.sampleRate) * 1000;
    if (durationMs <= 0) {
      return [];
    }

    const emitted: VoiceUtterance[] = [];
    let state = this.speakers.get(frame.speakerId);
    if (!state) {
      if (this.speakers.size >= this.config.maxTrackedSpeakers) {
        const oldest = this.oldestState();
        if (oldest) {
          const utterance = this.finish(oldest);
          if (utterance) emitted.push(utterance);
          this.speakers.delete(oldest.speakerId);
        }
      }
      state = {
        speakerId: frame.speakerId,
        preRoll: [],
        utterance: [],
        utteranceDurationMs: 0,
        speechDurationMs: 0,
        silenceDurationMs: 0,
        lastTimestampMs: frame.timestampMs,
        sequence: ++this.sequence,
      };
      this.speakers.set(frame.speakerId, state);
    }
    if (frame.timestampMs < state.lastTimestampMs) {
      throw new RangeError("speaker frame timestamps must be non-decreasing");
    }
    state.lastTimestampMs = frame.timestampMs;

    const voiced = this.isVoiced(frame.samples, state.utterance.length > 0);
    const buffered: BufferedFrame = {
      frame: { ...frame, samples: new Int16Array(frame.samples) },
      durationMs,
      voiced,
    };

    if (state.utterance.length === 0) {
      if (voiced) {
        state.utterance = [...state.preRoll, buffered];
        state.preRoll = [];
        state.utteranceDurationMs = state.utterance.reduce((total, item) => total + item.durationMs, 0);
        state.speechDurationMs = durationMs;
        state.silenceDurationMs = 0;
        if (state.utteranceDurationMs >= this.config.maxUtteranceMs) {
          const utterance = this.finish(state);
          if (utterance) emitted.push(utterance);
          this.resetActive(state);
        }
      } else {
        this.addPreRoll(state, buffered);
      }
      return emitted;
    }

    state.utterance.push(buffered);
    state.utteranceDurationMs += durationMs;
    if (voiced) {
      state.speechDurationMs += durationMs;
      state.silenceDurationMs = 0;
    } else {
      state.silenceDurationMs += durationMs;
    }

    if (state.utteranceDurationMs >= this.config.maxUtteranceMs) {
      const utterance = this.finish(state);
      if (utterance) emitted.push(utterance);
      this.resetActive(state);
    } else if (state.silenceDurationMs >= this.config.endSilenceMs) {
      const utterance = this.finish(state);
      if (utterance) emitted.push(utterance);
      this.resetActive(state);
    }
    return emitted;
  }

  public flush(speakerId?: string): VoiceUtterance[] {
    const states = speakerId === undefined
      ? [...this.speakers.values()].sort((a, b) => a.sequence - b.sequence)
      : [this.speakers.get(speakerId)].filter((state): state is SpeakerState => state !== undefined);
    const emitted: VoiceUtterance[] = [];
    for (const state of states) {
      const utterance = this.finish(state);
      if (utterance) emitted.push(utterance);
      this.speakers.delete(state.speakerId);
    }
    return emitted;
  }

  public disconnect(speakerId: string): VoiceUtterance[] {
    return this.flush(speakerId);
  }

  private isVoiced(samples: Int16Array, active: boolean): boolean {
    let sumSquares = 0;
    let peak = 0;
    for (const sample of samples) {
      const magnitude = Math.abs(sample) / 32768;
      sumSquares += magnitude * magnitude;
      peak = Math.max(peak, magnitude);
    }
    const rms = Math.sqrt(sumSquares / samples.length);
    const threshold = active ? this.config.endThreshold : this.config.startThreshold;
    return Math.max(rms, peak) >= threshold;
  }

  private addPreRoll(state: SpeakerState, buffered: BufferedFrame): void {
    if (this.config.preRollMs === 0) return;
    state.preRoll.push(buffered);
    let duration = state.preRoll.reduce((total, item) => total + item.durationMs, 0);
    while (duration > this.config.preRollMs && state.preRoll.length > 1) {
      const removed = state.preRoll.shift();
      if (removed) duration -= removed.durationMs;
    }
  }

  private finish(state: SpeakerState): VoiceUtterance | undefined {
    if (state.utterance.length === 0 || state.speechDurationMs < this.config.minSpeechMs) {
      return undefined;
    }
    const first = state.utterance[0];
    const last = state.utterance[state.utterance.length - 1];
    if (!first || !last) return undefined;
    return {
      speakerId: state.speakerId,
      startTimestampMs: first.frame.timestampMs,
      endTimestampMs: last.frame.timestampMs + last.durationMs,
      frames: state.utterance.map(({ frame }) => frame),
      speechDurationMs: state.speechDurationMs,
    };
  }

  private resetActive(state: SpeakerState): void {
    state.utterance = [];
    state.utteranceDurationMs = 0;
    state.speechDurationMs = 0;
    state.silenceDurationMs = 0;
    state.preRoll = [];
  }

  private oldestState(): SpeakerState | undefined {
    return [...this.speakers.values()].sort((a, b) => a.sequence - b.sequence)[0];
  }

  private validateFrame(frame: Pcm16AudioFrame): void {
    if (!frame.speakerId) throw new TypeError("speakerId is required");
    if (!Number.isFinite(frame.timestampMs)) throw new TypeError("timestampMs must be finite");
    if (!(frame.samples instanceof Int16Array)) throw new TypeError("samples must be Int16Array");
  }
}
