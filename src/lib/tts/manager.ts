import type { WLipSyncAudioNode, Profile as WLipSyncProfile } from 'wlipsync';
import type { LipSyncData, WordBoundary } from './piper';
import { synthesizePiperChunk } from './piper';
import {
  createRemoteTtsStream,
  type RemoteTtsAudioChunk,
  type RemoteTtsProxyOptions,
  type RemoteTtsRequest,
} from './remote';
import type { SpeechTiming } from '../../tts/SpeechTimingTypes';

const LIP_SYNC_PROFILE_URL =
  typeof window === 'undefined'
    ? `${import.meta.env.BASE_URL}assets/lipsync-profile.json`
    : new URL(
        `${import.meta.env.BASE_URL}assets/lipsync-profile.json`,
        window.location.href,
      ).toString();
const AUTO_RESUME_AUDIO =
  import.meta.env['VITE_AUTO_RESUME_AUDIO'] === 'true' ||
  (typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('routelet') === '1');
const REMOTE_PCM_INITIAL_LEAD_SECONDS = 0.05;
const REMOTE_PCM_MIN_LEAD_SECONDS = 0.02;
const REMOTE_PCM_FADE_SECONDS = 0.006;
const REMOTE_PCM_CROSSFADE_SECONDS = 0.004;
const PIPER_TIMING_TICKS_PER_SECOND = 10000000;
interface ChunkData {
  audioBlob: Blob;
  wordBoundaries: WordBoundary[];
  phonemes: string[] | null;
  text: string;
  sampleRate?: number | null;
}

export type RemotePcmPushStream = {
  close: () => Promise<void>;
  push: (chunk: RemoteTtsAudioChunk) => Promise<void>;
};

type ScheduledRemotePcmChunk = {
  ended: Promise<void>;
};

export function getRemotePcmChunkSchedule(now: number, playhead: number, duration: number) {
  const startAt = Math.max(now, playhead);
  return {
    endAt: startAt + duration,
    startAt,
  };
}

export function remoteSpeechTimingToWordBoundaries(
  speechTiming: unknown,
  scheduledOffsetSeconds: number,
  playbackRate: number,
): WordBoundary[] {
  if (!speechTiming || typeof speechTiming !== 'object') {
    return [];
  }
  const words = (speechTiming as Partial<SpeechTiming>).words;
  if (!Array.isArray(words)) {
    return [];
  }
  const safePlaybackRate = Math.max(0.01, playbackRate);
  return words.flatMap((word): WordBoundary[] => {
    if (
      !word ||
      typeof word.text !== 'string' ||
      typeof word.start !== 'number' ||
      typeof word.end !== 'number' ||
      word.end < word.start
    ) {
      return [];
    }
    return [
      {
        duration: Math.round(
          ((word.end - word.start) / safePlaybackRate) * PIPER_TIMING_TICKS_PER_SECOND,
        ),
        offset: Math.round(
          (scheduledOffsetSeconds + word.start / safePlaybackRate) *
            PIPER_TIMING_TICKS_PER_SECOND,
        ),
        word: word.text,
      },
    ];
  });
}

function canAttemptAudioResume() {
  return AUTO_RESUME_AUDIO || navigator.userActivation?.isActive === true;
}

export class TtsManager {
  enableTts = true;
  playbackRate = 1;
  volume = 1;

  audioContext: AudioContext | null = null;
  isPlaying = false;
  currentSource: AudioBufferSourceNode | null = null;
  currentAudio: HTMLAudioElement | null = null;
  private currentStreamSources = new Set<AudioBufferSourceNode>();
  private currentStreamGains = new Set<GainNode>();
  private streamPlaybackEndTime = 0;
  private streamPlaybackStartTime = 0;
  private streamScheduledChunkCount = 0;
  private streamStartedTimer: number | null = null;

  wordBoundaries: WordBoundary[] = [];
  currentPhonemes: string[] | null = null;
  wordBoundaryStartTime: number | null = null;

  audioAnalyser: AnalyserNode | null = null;
  audioSource: MediaElementAudioSourceNode | null = null;
  audioDataArray: Uint8Array<ArrayBuffer> | null = null;
  lipsyncNode: WLipSyncAudioNode | null = null;
  masterGain: GainNode | null = null;
  streamDestination: MediaStreamAudioDestinationNode | null = null;
  private analyserConnected = false;

  onSpeechStarted: (() => void) | null = null;
  onSpeechFinished: (() => void) | null = null;
  onError: ((error: Error) => void) | null = null;
  onLipSyncData: ((data: LipSyncData) => void) | null = null;

  private playbackQueue: Promise<void> = Promise.resolve();
  private remoteSynthesisQueue: Promise<void> = Promise.resolve();
  private remoteAbortControllers = new Set<AbortController>();
  private queueGeneration = 0;

  private disconnectAudioSource() {
    if (!this.audioSource) {
      return;
    }

    try {
      this.audioSource.disconnect();
    } catch {
      // ignore
    }
    this.audioSource = null;
  }

  private disconnectAnalyserOutput() {
    if (!this.audioAnalyser || !this.masterGain || !this.analyserConnected) {
      return;
    }

    try {
      this.audioAnalyser.disconnect(this.masterGain);
    } catch {
      // ignore
    }
    try {
      this.masterGain.disconnect();
    } catch {
      // ignore
    }
    this.analyserConnected = false;
  }

  private clearPlaybackState() {
    this.isPlaying = false;
    this.wordBoundaries = [];
    this.currentPhonemes = null;
    this.wordBoundaryStartTime = null;
  }

  private teardownCurrentAudio(audioUrl?: string | null) {
    const nextAudioUrl =
      audioUrl ?? (this.currentAudio?.src?.startsWith('blob:') ? this.currentAudio.src : null);

    if (this.currentAudio) {
      this.currentAudio.onplay = null;
      this.currentAudio.onended = null;
      this.currentAudio.onerror = null;
      try {
        this.currentAudio.pause();
      } catch {
        // ignore
      }
      this.currentAudio.src = '';
      this.currentAudio.load();
      this.currentAudio = null;
    }

    for (const source of this.currentStreamSources) {
      try {
        source.stop();
      } catch {
        // ignore
      }
      try {
        source.disconnect();
      } catch {
        // ignore
      }
    }
    this.currentStreamSources.clear();
    for (const gain of this.currentStreamGains) {
      try {
        gain.disconnect();
      } catch {
        // ignore
      }
    }
    this.currentStreamGains.clear();
    if (this.streamStartedTimer !== null) {
      window.clearTimeout(this.streamStartedTimer);
      this.streamStartedTimer = null;
    }
    this.streamPlaybackEndTime = 0;
    this.streamPlaybackStartTime = 0;
    this.streamScheduledChunkCount = 0;
    this.disconnectAudioSource();
    this.clearPlaybackState();

    if (nextAudioUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(nextAudioUrl);
    }
  }

  async initialize() {
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        await this.audioContext.close();
      } catch {
        // ignore
      }
    }

    this.audioSource = null;
    this.lipsyncNode = null;
    this.masterGain = null;
    this.streamDestination = null;
    this.audioContext = new (
      window.AudioContext ||
      (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext
    )();
    this.audioAnalyser = this.audioContext.createAnalyser();
    this.audioAnalyser.fftSize = 256;
    this.audioAnalyser.smoothingTimeConstant = 0.08;
    this.masterGain = this.audioContext.createGain();
    this.streamDestination = this.audioContext.createMediaStreamDestination();
    this.masterGain.gain.value = Math.max(0, Math.min(2, this.volume));
    this.analyserConnected = false;
    this.audioDataArray = new Uint8Array(
      this.audioAnalyser.frequencyBinCount,
    ) as Uint8Array<ArrayBuffer>;
    await this.initLipSyncNode();
  }

  private async initLipSyncNode() {
    if (!this.audioContext) {
      return;
    }

    try {
      if (!lipSyncProfile) {
        const response = await fetch(LIP_SYNC_PROFILE_URL);
        if (!response.ok) {
          throw new Error(`Profile fetch failed: ${response.status}`);
        }
        lipSyncProfile = await response.json();
      }

      const { createWLipSyncNode } = await import('wlipsync');
      this.lipsyncNode = await createWLipSyncNode(this.audioContext, lipSyncProfile!);
      this.lipsyncNode.smoothness = 0.03;
      this.lipsyncNode.blockSize = 256;
    } catch (error) {
      console.warn('[TtsManager] wLipSync init failed, using frequency-band fallback:', error);
      this.lipsyncNode = null;
    }
  }

  async speakPiperText(text: string, voiceId: string) {
    this.resetSpeechQueue();
    await this.queuePiperText(text, voiceId);
  }

  async speakRemoteText(options: RemoteTtsRequest, proxyOptions?: RemoteTtsProxyOptions) {
    this.resetSpeechQueue();
    await this.queueRemoteText(options, proxyOptions);
  }

  startRemotePcmPushStream(text: string): RemotePcmPushStream {
    this.resetSpeechQueue();
    const cleaned = this.cleanForSpeech(text || 'Live speech stream');
    const generation = this.queueGeneration;
    const abortController = new AbortController();
    this.remoteAbortControllers.add(abortController);
    let started = false;
    let scheduleTail = Promise.resolve();
    let playbackTail = Promise.resolve();
    const ready = (async () => {
      if (!this.audioContext) {
        await this.initialize();
      }
      if (this.audioContext?.state === 'suspended' && canAttemptAudioResume()) {
        await this.audioContext.resume().catch(() => {});
      }
    })();

    return {
      push: (chunk: RemoteTtsAudioChunk) => {
        if (!this.enableTts || generation !== this.queueGeneration || abortController.signal.aborted) {
          return Promise.resolve();
        }
        if (chunk.mimeType !== 'audio/pcm') {
          return Promise.reject(new Error(`Live bridge expected audio/pcm, got ${chunk.mimeType}.`));
        }
        const scheduled = scheduleTail.then(async () => {
          await ready;
          if (
            generation !== this.queueGeneration ||
            abortController.signal.aborted ||
            !this.audioContext
          ) {
            return null;
          }
          if (!started) {
            started = true;
            this.beginRemotePcmStream(cleaned);
          }
          return this.scheduleRemotePcmChunk(chunk, generation, abortController.signal, cleaned);
        });
        scheduleTail = scheduled.then(
          () => undefined,
          () => undefined,
        );
        return scheduled.then((scheduledChunk) => {
          if (!scheduledChunk) {
            return;
          }
          playbackTail = scheduledChunk.ended.catch(() => {});
        });
      },
      close: async () => {
        await scheduleTail.catch(() => {});
        await playbackTail.catch(() => {});
        this.remoteAbortControllers.delete(abortController);
        if (generation === this.queueGeneration && !abortController.signal.aborted) {
          this.onSpeechFinished?.();
          this.clearPlaybackState();
        }
      },
    };
  }

  queuePiperText(text: string, voiceId: string) {
    if (!this.enableTts) {
      return Promise.resolve();
    }

    const cleaned = this.cleanForSpeech(text);
    if (!cleaned) {
      return Promise.resolve();
    }

    const generation = this.queueGeneration;
    const chunkPromise = synthesizePiperChunk(cleaned, voiceId);

    const playbackPromise = this.playbackQueue
      .catch(() => {
        // Keep later queued speech moving if an earlier chunk fails.
      })
      .then(async () => {
        const chunkData = await chunkPromise;
        if (generation !== this.queueGeneration) {
          return;
        }
        if (!this.audioContext) {
          await this.initialize();
        }
        if (generation !== this.queueGeneration) {
          return;
        }
        await this.playAudioChunk(chunkData);
      });

    this.playbackQueue = playbackPromise;
    return playbackPromise;
  }

  queueRemoteText(options: RemoteTtsRequest, proxyOptions?: RemoteTtsProxyOptions) {
    if (!this.enableTts) {
      return Promise.resolve();
    }

    const cleaned = this.cleanForSpeech(options.text);
    if (!cleaned) {
      return Promise.resolve();
    }

    const generation = this.queueGeneration;

    let playbackTail: Promise<void> = Promise.resolve();

    const synthesisPromise = this.remoteSynthesisQueue
      .catch(() => {
        // Keep later queued speech moving if an earlier remote request fails.
      })
      .then(async () => {
        if (generation !== this.queueGeneration) {
          return;
        }
        if (!this.audioContext) {
          await this.initialize();
        }
        if (generation !== this.queueGeneration) {
          return;
        }
        const abortController = new AbortController();
        this.remoteAbortControllers.add(abortController);
        const audioChunks: RemoteTtsAudioChunk[] = [];
        let playingPcmStream = false;
        let pcmScheduleTail: Promise<void> = Promise.resolve();
        let pcmStreamTail: Promise<void> = Promise.resolve();
        try {
          const remoteStream = createRemoteTtsStream(
            {
              ...options,
              text: cleaned,
            },
            abortController.signal,
            proxyOptions,
          );
          for await (const chunk of remoteStream) {
            if (generation !== this.queueGeneration || abortController.signal.aborted) {
              return;
            }
            if (chunk.mimeType === 'audio/pcm') {
              if (!playingPcmStream) {
                playingPcmStream = true;
                this.beginRemotePcmStream(cleaned);
              }
              pcmScheduleTail = pcmScheduleTail.then(async () => {
                const scheduled = await this.scheduleRemotePcmChunk(
                  chunk,
                  generation,
                  abortController.signal,
                  cleaned,
                );
                if (scheduled) {
                  pcmStreamTail = scheduled.ended;
                }
              });
            } else if (playingPcmStream) {
              console.warn('[TTS] Mixed remote audio formats during PCM stream; dropping chunk.');
            } else {
              audioChunks.push(chunk);
            }
          }
        } finally {
          this.remoteAbortControllers.delete(abortController);
        }
        if (playingPcmStream) {
          await pcmScheduleTail;
          await pcmStreamTail;
          if (generation === this.queueGeneration && !abortController.signal.aborted) {
            this.onSpeechFinished?.();
            this.clearPlaybackState();
          }
          return;
        }
        if (
          audioChunks.length === 0 &&
          generation === this.queueGeneration &&
          !abortController.signal.aborted
        ) {
          throw new Error('Remote TTS returned no audio chunks.');
        }
        if (generation !== this.queueGeneration || abortController.signal.aborted) {
          return;
        }

        const chunkData = this.combineRemoteAudioChunks(audioChunks, cleaned);
        playbackTail = this.playbackQueue
          .catch(() => {
            // Keep later queued speech moving if an earlier audio chunk fails.
          })
          .then(async () => {
            if (generation !== this.queueGeneration) {
              return;
            }
            if (!this.audioContext) {
              await this.initialize();
            }
            if (generation !== this.queueGeneration) {
              return;
            }
            await this.playAudioChunk(chunkData);
          });
        this.playbackQueue = playbackTail;
      });

    this.remoteSynthesisQueue = synthesisPromise;
    return synthesisPromise.then(() => playbackTail);
  }

  private combineRemoteAudioChunks(chunks: RemoteTtsAudioChunk[], text: string): ChunkData {
    const firstChunk = chunks[0];
    const mimeType = firstChunk?.mimeType || 'audio/mpeg';
    const sampleRate = chunks.find((chunk) => typeof chunk.sampleRate === 'number')?.sampleRate;
    return {
      audioBlob:
        chunks.length === 1
          ? firstChunk!.audioBlob
          : new Blob(
              chunks.map((chunk) => chunk.audioBlob),
              { type: mimeType },
            ),
      wordBoundaries: [],
      phonemes: null,
      text,
      sampleRate,
    };
  }

  private beginRemotePcmStream(text: string) {
    this.teardownCurrentAudio();
    this.disconnectAnalyserOutput();
    this.wordBoundaries = [];
    this.currentPhonemes = null;
    this.wordBoundaryStartTime = null;
    this.onLipSyncData?.({ wordBoundaries: [], phonemes: null, text });
    if (!this.audioContext) {
      throw new Error('AudioContext not initialized');
    }
    if (this.audioContext.state === 'suspended' && canAttemptAudioResume()) {
      void this.audioContext.resume().catch(() => {});
    }
    this.streamPlaybackEndTime = this.audioContext.currentTime + REMOTE_PCM_INITIAL_LEAD_SECONDS;
    this.streamPlaybackStartTime = this.streamPlaybackEndTime;
    this.streamScheduledChunkCount = 0;
  }

  private async scheduleRemotePcmChunk(
    chunk: RemoteTtsAudioChunk,
    generation: number,
    signal: AbortSignal,
    text: string,
  ): Promise<ScheduledRemotePcmChunk | null> {
    if (!this.audioContext || !this.audioAnalyser) {
      throw new Error('AudioContext not initialized');
    }
    const raw = new Uint8Array(await chunk.audioBlob.arrayBuffer());
    if (generation !== this.queueGeneration || signal.aborted || raw.byteLength < 2) {
      return null;
    }

    const sampleRate = chunk.sampleRate ?? 24000;
    const sampleCount = Math.floor(raw.byteLength / 2);
    const view = new DataView(raw.buffer, raw.byteOffset, sampleCount * 2);
    const audioBuffer = this.audioContext.createBuffer(1, sampleCount, sampleRate);
    const channel = audioBuffer.getChannelData(0);
    for (let index = 0; index < sampleCount; index += 1) {
      channel[index] = Math.max(-1, Math.min(1, view.getInt16(index * 2, true) / 32768));
    }

    const source = this.audioContext.createBufferSource();
    const frameGain = this.audioContext.createGain();
    source.buffer = audioBuffer;
    source.playbackRate.value = this.playbackRate;
    source.connect(frameGain);
    frameGain.connect(this.audioAnalyser);
    if (this.lipsyncNode) {
      frameGain.connect(this.lipsyncNode);
    }
    this.ensureAnalyserConnected();

    const duration = audioBuffer.duration / Math.max(0.01, this.playbackRate);
    const canCrossfade =
      this.streamScheduledChunkCount > 0 &&
      this.streamPlaybackEndTime > this.audioContext.currentTime + REMOTE_PCM_CROSSFADE_SECONDS;
    const overlap = canCrossfade
      ? Math.min(REMOTE_PCM_CROSSFADE_SECONDS, Math.max(0, duration * 0.35))
      : 0;
    const startAt = Math.max(
      this.streamPlaybackEndTime - overlap,
      this.audioContext.currentTime + REMOTE_PCM_MIN_LEAD_SECONDS,
    );
    const endAt = startAt + duration;
    const fadeSeconds = Math.min(REMOTE_PCM_FADE_SECONDS, Math.max(0, duration / 3));
    const fadeInEnd = startAt + fadeSeconds;
    const fadeOutStart = Math.max(fadeInEnd, endAt - fadeSeconds);
    frameGain.gain.cancelScheduledValues(startAt);
    frameGain.gain.setValueAtTime(0, startAt);
    if (fadeSeconds > 0) {
      frameGain.gain.linearRampToValueAtTime(1, fadeInEnd);
      if (fadeOutStart > fadeInEnd) {
        frameGain.gain.setValueAtTime(1, fadeOutStart);
      }
      frameGain.gain.linearRampToValueAtTime(0, endAt);
    } else {
      frameGain.gain.setValueAtTime(1, startAt);
    }
    this.streamPlaybackEndTime = endAt;
    const timedWordBoundaries = remoteSpeechTimingToWordBoundaries(
      chunk.speechTiming,
      Math.max(0, startAt - this.streamPlaybackStartTime),
      this.playbackRate,
    );
    if (timedWordBoundaries.length > 0) {
      this.wordBoundaries = [...this.wordBoundaries, ...timedWordBoundaries];
      this.onLipSyncData?.({ wordBoundaries: this.wordBoundaries, phonemes: null, text });
    }
    this.currentStreamSources.add(source);
    this.currentStreamGains.add(frameGain);
    this.streamScheduledChunkCount += 1;

    const ended = new Promise<void>((resolve) => {
      source.onended = () => {
        this.currentStreamSources.delete(source);
        this.currentStreamGains.delete(frameGain);
        try {
          source.disconnect();
        } catch {
          // ignore
        }
        try {
          frameGain.disconnect();
        } catch {
          // ignore
        }
        resolve();
      };
    });

    if (!this.isPlaying) {
      const delayMs = Math.max(0, (startAt - this.audioContext.currentTime) * 1000);
      this.streamStartedTimer = window.setTimeout(() => {
        this.streamStartedTimer = null;
        if (generation !== this.queueGeneration || signal.aborted) {
          return;
        }
        this.wordBoundaryStartTime = 0;
        this.isPlaying = true;
        this.onSpeechStarted?.();
        this.onLipSyncData?.({ wordBoundaries: [], phonemes: null, text });
      }, delayMs);
    }

    source.start(startAt);
    return { ended };
  }

  resetSpeechQueue() {
    this.queueGeneration += 1;
    this.playbackQueue = Promise.resolve();
    this.remoteSynthesisQueue = Promise.resolve();
    for (const controller of this.remoteAbortControllers) {
      controller.abort();
    }
    this.remoteAbortControllers.clear();
  }

  stop() {
    this.resetSpeechQueue();
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch {
        // ignore
      }
      this.currentSource = null;
    }

    this.teardownCurrentAudio();
  }

  // fallow-ignore-next-line unused-class-member
  destroy() {
    this.stop();
    if (this.audioContext && this.audioContext.state !== 'closed') {
      void this.audioContext.close().catch(() => {});
    }
    this.audioContext = null;
    this.audioAnalyser = null;
    this.audioDataArray = null;
    this.lipsyncNode = null;
    this.masterGain = null;
    this.streamDestination = null;
    this.analyserConnected = false;
  }

  setPlaybackRate(value: number) {
    this.playbackRate = Math.max(0.7, Math.min(1.35, value));
    if (this.currentAudio) {
      this.currentAudio.playbackRate = this.playbackRate;
      const audioWithPitch = this.currentAudio as HTMLAudioElement & {
        mozPreservesPitch?: boolean;
        preservesPitch?: boolean;
        webkitPreservesPitch?: boolean;
      };
      if ('preservesPitch' in audioWithPitch) {
        audioWithPitch.preservesPitch = true;
      }
      if ('webkitPreservesPitch' in audioWithPitch) {
        audioWithPitch.webkitPreservesPitch = true;
      }
      if ('mozPreservesPitch' in audioWithPitch) {
        audioWithPitch.mozPreservesPitch = true;
      }
    }
  }

  setVolume(value: number) {
    this.volume = Math.max(0, Math.min(2, value));
    if (this.masterGain) {
      this.masterGain.gain.value = this.volume;
    }
  }

  private ensureAnalyserConnected() {
    if (!this.audioContext || !this.audioAnalyser || !this.masterGain || this.analyserConnected) {
      return;
    }

    try {
      this.audioAnalyser.connect(this.masterGain);
      this.masterGain.connect(this.audioContext.destination);
      if (this.streamDestination) {
        this.masterGain.connect(this.streamDestination);
      }
      this.analyserConnected = true;
    } catch {
      // Ignore duplicate graph connections.
    }
  }

  async primeAudio() {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      await this.initialize();
    }

    if (this.audioContext?.state === 'suspended') {
      await this.audioContext.resume();
    }

    return this.audioContext?.state ?? 'closed';
  }

  getAudioState() {
    return this.audioContext?.state ?? 'uninitialized';
  }

  getOutputStream() {
    return this.streamDestination?.stream ?? null;
  }

  private async playAudioChunk(chunkData: ChunkData) {
    return new Promise<void>(async (resolve, reject) => {
      let { audioBlob, wordBoundaries, phonemes, text, sampleRate } = chunkData;

      this.teardownCurrentAudio();

      if (audioBlob.type === 'audio/pcm') {
        audioBlob = await this.pcmToWav(audioBlob, sampleRate ?? 24000);
      }

      this.wordBoundaries = wordBoundaries;
      this.currentPhonemes = phonemes;
      this.wordBoundaryStartTime = null;

      if (!this.audioContext) {
        reject(new Error('AudioContext not initialized'));
        return;
      }

      const audioUrl = URL.createObjectURL(audioBlob);
      this.currentAudio = new Audio(audioUrl);
      this.currentAudio.autoplay = true;
      this.currentAudio.preload = 'auto';
      this.currentAudio.playbackRate = this.playbackRate;
      this.currentAudio.volume = 1;
      const audioWithPitch = this.currentAudio as HTMLAudioElement & {
        mozPreservesPitch?: boolean;
        preservesPitch?: boolean;
        webkitPreservesPitch?: boolean;
      };
      if ('preservesPitch' in audioWithPitch) {
        audioWithPitch.preservesPitch = true;
      }
      if ('webkitPreservesPitch' in audioWithPitch) {
        audioWithPitch.webkitPreservesPitch = true;
      }
      if ('mozPreservesPitch' in audioWithPitch) {
        audioWithPitch.mozPreservesPitch = true;
      }
      if (this.masterGain) {
        this.masterGain.gain.value = this.volume;
      }

      try {
        this.disconnectAudioSource();
        this.audioSource = this.audioContext.createMediaElementSource(this.currentAudio);
        this.audioSource.connect(this.audioAnalyser!);
        if (this.lipsyncNode) {
          this.audioSource.connect(this.lipsyncNode);
        }
        this.ensureAnalyserConnected();
      } catch (error) {
        console.warn('[TtsManager] Audio graph connect:', error);
      }

      if (this.audioContext.state === 'suspended' && canAttemptAudioResume()) {
        void this.audioContext.resume().catch(() => {});
      }

      this.currentAudio.onplay = () => {
        this.wordBoundaryStartTime = this.currentAudio?.currentTime || 0;
        if (this.audioContext?.state === 'suspended' && canAttemptAudioResume()) {
          void this.audioContext.resume().catch(() => {});
        }
        if (!this.isPlaying) {
          this.isPlaying = true;
          this.onSpeechStarted?.();
        }
        this.onLipSyncData?.({ wordBoundaries, phonemes, text });
      };

      this.currentAudio.onended = () => {
        this.teardownCurrentAudio(audioUrl);
        this.onSpeechFinished?.();
        resolve();
      };

      this.currentAudio.onerror = () => {
        this.teardownCurrentAudio(audioUrl);
        reject(new Error('Audio playback failed.'));
      };

      this.currentAudio.play().catch((error) => {
        const nextError = error instanceof Error ? error : new Error(String(error));
        this.teardownCurrentAudio(audioUrl);
        this.onError?.(nextError);
        reject(nextError);
      });
    });
  }

  private pcmToWav(pcmBlob: Blob, sampleRate = 24000): Promise<Blob> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const pcmData = this.applyPcmEdgeFade(
          new Uint8Array(reader.result as ArrayBuffer),
          sampleRate,
        );
        const wavHeader = new ArrayBuffer(44);
        const view = new DataView(wavHeader);
        view.setUint32(0, 0x52494646, false);
        view.setUint32(4, 36 + pcmData.length, true);
        view.setUint32(8, 0x57415645, false);
        view.setUint32(12, 0x666d7420, false);
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        view.setUint32(36, 0x64617461, false);
        view.setUint32(40, pcmData.length, true);
        const pcmPart = new ArrayBuffer(pcmData.byteLength);
        new Uint8Array(pcmPart).set(pcmData);
        resolve(new Blob([wavHeader, pcmPart], { type: 'audio/wav' }));
      };
      reader.readAsArrayBuffer(pcmBlob);
    });
  }

  private applyPcmEdgeFade(pcmData: Uint8Array, sampleRate: number) {
    const sampleCount = Math.floor(pcmData.length / 2);
    if (sampleCount < 16) {
      return pcmData;
    }

    const faded = new Uint8Array(pcmData.length);
    faded.set(pcmData);
    const view = new DataView(faded.buffer, faded.byteOffset, faded.byteLength);
    const fadeSamples = Math.min(Math.floor(sampleRate * 0.008), Math.floor(sampleCount / 4));

    for (let index = 0; index < fadeSamples; index += 1) {
      const fadeIn = index / fadeSamples;
      const fadeOut = (fadeSamples - index) / fadeSamples;
      const startSample = view.getInt16(index * 2, true);
      const endOffset = (sampleCount - 1 - index) * 2;
      const endSample = view.getInt16(endOffset, true);
      view.setInt16(index * 2, Math.round(startSample * fadeIn), true);
      view.setInt16(endOffset, Math.round(endSample * fadeOut), true);
    }

    return faded;
  }

  private cleanForSpeech(text: string) {
    return text
      .replace(/\*[^*]*\*/g, '')
      .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '')
      .replace(/([.!?,;:—])\1+/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
  }

  getAudioAmplitude(): number {
    if (!this.audioAnalyser || !this.audioDataArray) {
      return this.isPlaying ? 0.5 : 0;
    }
    if (!this.isPlaying) {
      return 0;
    }
    if (this.currentAudio && this.currentAudio.paused) {
      return 0;
    }

    this.audioAnalyser.getByteFrequencyData(this.audioDataArray);

    let sum = 0;
    const length = this.audioDataArray.length;
    for (let index = 0; index < length; index += 1) {
      let weight = 1.0;
      if (index < 20) {
        weight = 2.0;
      } else if (index < 50) {
        weight = 1.5;
      }
      sum += (this.audioDataArray[index] ?? 0) * weight;
    }
    const average = sum / (length * 1.5);
    const scale = this.currentAudio ? 2.5 : 1.0;
    return Math.min((average / 255) * scale, 1.0);
  }

  getFrequencyBands(): { low: number; midLow: number; midHigh: number; high: number } | null {
    if (!this.audioAnalyser || !this.audioDataArray) {
      return null;
    }
    if (!this.isPlaying) {
      return null;
    }
    if (this.currentAudio && this.currentAudio.paused) {
      return null;
    }

    this.audioAnalyser.getByteFrequencyData(this.audioDataArray);
    const data = this.audioDataArray;
    const length = data.length;

    const bandEnergy = (start: number, end: number) => {
      const clampedEnd = Math.min(end, length);
      if (start >= clampedEnd) {
        return 0;
      }
      let sum = 0;
      for (let index = start; index < clampedEnd; index += 1) {
        sum += data[index] ?? 0;
      }
      return sum / ((clampedEnd - start) * 255);
    };

    const scale = this.currentAudio ? 2.5 : 1.0;
    return {
      low: Math.min(bandEnergy(0, 5) * scale, 1.0),
      midLow: Math.min(bandEnergy(5, 13) * scale, 1.0),
      midHigh: Math.min(bandEnergy(13, 20) * scale, 1.0),
      high: Math.min(bandEnergy(20, 35) * scale, 1.0),
    };
  }

  getLipSyncWeights(): { A: number; I: number; U: number; E: number; O: number } | null {
    if (!this.lipsyncNode || !this.isPlaying) {
      return null;
    }

    const weights = this.lipsyncNode.weights;
    const volume = this.lipsyncNode.volume;
    if (volume < 0.01) {
      return null;
    }

    return {
      A: (weights['A'] ?? 0) * volume,
      I: (weights['I'] ?? 0) * volume,
      U: (weights['U'] ?? 0) * volume,
      E: (weights['E'] ?? 0) * volume,
      O: (weights['O'] ?? 0) * volume,
    };
  }
}

let lipSyncProfile: WLipSyncProfile | null = null;
let instance: TtsManager | null = null;

export function getTtsManager() {
  if (!instance) {
    instance = new TtsManager();
  }
  return instance;
}
