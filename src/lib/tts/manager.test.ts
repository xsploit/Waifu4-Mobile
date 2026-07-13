import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRemotePcmChunkSchedule, remoteSpeechTimingToWordBoundaries } from './manager';
import { TtsManager } from './manager';
import { synthesizePiperChunk } from './piper';
import { uploadPiperWav } from './piper-output';

vi.mock('./piper', () => ({ synthesizePiperChunk: vi.fn() }));
vi.mock('./piper-output', () => ({
  shouldUploadPiperOutput: (mode: string) => mode === 'discord-only' || mode === 'local+discord',
  uploadPiperWav: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function createPcm16Blob(samples: number[]) {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  samples.forEach((sample, index) => {
    view.setInt16(index * 2, sample, true);
  });
  return new Blob([bytes], { type: 'audio/pcm' });
}

function createRemotePcmHarness() {
  let nextTimerId = 1;
  const timers = new Map<number, { callback: () => void; delay: number }>();
  vi.stubGlobal('window', {
    setTimeout: (callback: () => void, delay = 0) => {
      const id = nextTimerId;
      nextTimerId += 1;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout: (id: number) => {
      timers.delete(id);
    },
  });

  const sources: Array<{
    buffer: { duration: number } | null;
    connections: unknown[];
    disconnected: boolean;
    onended: (() => void) | null;
    playbackRate: { value: number };
    startAt: number | null;
    stopped: boolean;
  }> = [];
  const gains: Array<{
    connections: unknown[];
    disconnected: boolean;
    events: Array<{ type: string; value?: number; time: number }>;
  }> = [];
  const context = {
    currentTime: 10,
    createBuffer: (_channels: number, length: number, sampleRate: number) => ({
      duration: length / sampleRate,
      getChannelData: () => new Float32Array(length),
    }),
    createBufferSource: () => {
      const source = {
        buffer: null as { duration: number } | null,
        connections: [] as unknown[],
        disconnected: false,
        onended: null as (() => void) | null,
        playbackRate: { value: 1 },
        startAt: null as number | null,
        stopped: false,
        connect(destination: unknown) {
          this.connections.push(destination);
        },
        disconnect() {
          this.disconnected = true;
        },
        start(when: number) {
          this.startAt = when;
        },
        stop() {
          this.stopped = true;
        },
      };
      sources.push(source);
      return source;
    },
    createGain: () => {
      const gain = {
        connections: [] as unknown[],
        disconnected: false,
        events: [] as Array<{ type: string; value?: number; time: number }>,
        connect(destination: unknown) {
          this.connections.push(destination);
        },
        disconnect() {
          this.disconnected = true;
        },
        gain: {
          cancelScheduledValues: (time: number) => {
            gain.events.push({ type: 'cancel', time });
          },
          linearRampToValueAtTime: (value: number, time: number) => {
            gain.events.push({ type: 'ramp', value, time });
          },
          setValueAtTime: (value: number, time: number) => {
            gain.events.push({ type: 'set', value, time });
          },
          value: 1,
        },
      };
      gains.push(gain);
      return gain;
    },
    destination: {},
    state: 'running',
  };
  const audioAnalyser = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    getByteFrequencyData: vi.fn(),
  };
  const masterGain = { connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1 } };
  const streamGain = { connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1 } };
  const lipsyncNode = {
    volume: 1,
    weights: { A: 0.8, I: 0.1, U: 0, E: 0, O: 0 },
  };
  const manager = new TtsManager();
  Object.assign(manager, {
    audioAnalyser,
    audioContext: context,
    audioDataArray: new Uint8Array(32),
    lipsyncNode,
    masterGain,
    streamGain,
  });

  return {
    audioAnalyser,
    context,
    fireTimer(id: number) {
      const timer = timers.get(id);
      if (!timer) {
        throw new Error(`Unknown timer ${id}`);
      }
      timers.delete(id);
      timer.callback();
    },
    gains,
    lipsyncNode,
    manager,
    sources,
    streamGain,
    timers,
  };
}

describe('TtsManager remote PCM scheduling', () => {
  it('keeps browser playback enabled for every additive output route', () => {
    const manager = new TtsManager();
    const localGain = { gain: { value: 1 } };
    const streamGain = { gain: { value: 1 } };
    Object.assign(manager, { masterGain: localGain, streamGain, volume: 0.8 });

    manager.setOutputRoute('discord-only');
    expect(localGain.gain.value).toBe(0.8);
    expect(streamGain.gain.value).toBe(0.8);

    manager.setOutputRoute('local+discord');
    expect(localGain.gain.value).toBe(0.8);
    expect(streamGain.gain.value).toBe(0.8);

    manager.setOutputRoute('external', 'virtual-cable');
    expect(localGain.gain.value).toBe(0.8);
    expect(streamGain.gain.value).toBe(0.8);
  });

  it('uses the same non-overlapping playhead math as the browser benchmark playback', () => {
    const first = getRemotePcmChunkSchedule(10, 0, 1);
    const second = getRemotePcmChunkSchedule(10.2, first.endAt, 1);
    const third = getRemotePcmChunkSchedule(12.5, second.endAt, 0.5);

    expect(first).toEqual({ startAt: 10, endAt: 11 });
    expect(second).toEqual({ startAt: 11, endAt: 12 });
    expect(third).toEqual({ startAt: 12.5, endAt: 13 });
  });

  it('activates remote PCM lip sync from the audio clock even when the start notification timer is late', async () => {
    const harness = createRemotePcmHarness();
    const onSpeechStarted = vi.fn();
    harness.manager.onSpeechStarted = onSpeechStarted;

    const stream = harness.manager.startRemotePcmPushStream('hello');
    await stream.push({
      audioBlob: createPcm16Blob([100, 200, 300, 400]),
      mimeType: 'audio/pcm',
      sampleRate: 4,
    });

    const startAt = harness.sources[0]?.startAt;
    expect(startAt).toBeCloseTo(10.05);
    expect(harness.timers.size).toBe(1);
    expect(harness.manager.getLipSyncWeights()).toBeNull();

    harness.context.currentTime = startAt ?? 0;
    expect(harness.manager.getLipSyncWeights()).toEqual({ A: 0.8, I: 0.1, U: 0, E: 0, O: 0 });
    expect(onSpeechStarted).not.toHaveBeenCalled();

    const timerId = [...harness.timers.keys()][0];
    expect(timerId).toBeDefined();
    harness.context.currentTime += 0.2;
    harness.fireTimer(timerId!);
    expect(onSpeechStarted).toHaveBeenCalledTimes(1);
    expect(harness.manager.getLipSyncWeights()).toEqual({ A: 0.8, I: 0.1, U: 0, E: 0, O: 0 });
  });

  it('keeps lip sync inactive during an underrun until the late chunk actually starts', async () => {
    const harness = createRemotePcmHarness();
    const stream = harness.manager.startRemotePcmPushStream('hello again');
    const chunk = {
      audioBlob: createPcm16Blob([100, 200, 300, 400]),
      mimeType: 'audio/pcm',
      sampleRate: 4,
    } as const;

    await stream.push(chunk);
    harness.context.currentTime = 11.2;
    harness.sources[0]?.onended?.();
    await stream.push(chunk);

    const secondStartAt = harness.sources[1]?.startAt;
    expect(secondStartAt).toBeCloseTo(11.22);
    expect(harness.manager.isPlaybackActive()).toBe(false);
    expect(harness.manager.getLipSyncWeights()).toBeNull();

    harness.context.currentTime = secondStartAt ?? 0;
    expect(harness.manager.isPlaybackActive()).toBe(true);
    expect(harness.manager.getLipSyncWeights()).toEqual({ A: 0.8, I: 0.1, U: 0, E: 0, O: 0 });
  });

  it('cancels a late start notification when the PCM stream finishes first', async () => {
    const harness = createRemotePcmHarness();
    const onSpeechStarted = vi.fn();
    const onSpeechFinished = vi.fn();
    harness.manager.onSpeechStarted = onSpeechStarted;
    harness.manager.onSpeechFinished = onSpeechFinished;

    const stream = harness.manager.startRemotePcmPushStream('brief');
    await stream.push({
      audioBlob: createPcm16Blob([100, 200]),
      mimeType: 'audio/pcm',
      sampleRate: 4,
    });

    expect(harness.timers.size).toBe(1);
    harness.context.currentTime = 11;
    harness.sources[0]?.onended?.();
    await stream.close();

    expect(onSpeechFinished).toHaveBeenCalledTimes(1);
    expect(harness.timers.size).toBe(0);
    expect(onSpeechStarted).not.toHaveBeenCalled();
    expect(harness.manager.isPlaying).toBe(false);
  });

  it('preserves remote PCM fades, overlap, graph routing, and one start notification', async () => {
    const harness = createRemotePcmHarness();
    const onSpeechStarted = vi.fn();
    harness.manager.onSpeechStarted = onSpeechStarted;
    const stream = harness.manager.startRemotePcmPushStream('hello world');
    const chunk = {
      audioBlob: createPcm16Blob([100, 200, 300, 400]),
      mimeType: 'audio/pcm',
      sampleRate: 4,
    } as const;

    await stream.push(chunk);
    await stream.push(chunk);

    expect(harness.sources).toHaveLength(2);
    expect(harness.gains).toHaveLength(2);
    expect(harness.sources[0]?.startAt).toBeCloseTo(10.05);
    expect(harness.sources[1]?.startAt).toBeCloseTo(11.046);
    expect(harness.gains[0]?.events.map(({ type, value }) => ({ type, value }))).toEqual([
      { type: 'cancel', value: undefined },
      { type: 'set', value: 0 },
      { type: 'ramp', value: 1 },
      { type: 'set', value: 1 },
      { type: 'ramp', value: 0 },
    ]);
    [10.05, 10.05, 10.056, 11.044, 11.05].forEach((time, index) => {
      expect(harness.gains[0]?.events[index]?.time).toBeCloseTo(time);
    });
    expect(harness.sources[0]?.connections[0]).toBe(harness.gains[0]);
    expect(harness.gains[0]?.connections).toContain(harness.audioAnalyser);
    expect(harness.gains[0]?.connections).toContain(harness.lipsyncNode);
    expect(harness.gains[1]?.connections).toContain(harness.audioAnalyser);
    expect(harness.gains[1]?.connections).toContain(harness.lipsyncNode);
    expect(harness.timers.size).toBe(1);

    const timerId = [...harness.timers.keys()][0];
    expect(timerId).toBeDefined();
    harness.context.currentTime = harness.sources[0]?.startAt ?? harness.context.currentTime;
    harness.fireTimer(timerId!);
    expect(onSpeechStarted).toHaveBeenCalledTimes(1);
  });

  it('resolves live push after scheduling instead of waiting for playback to end', async () => {
    Object.assign(globalThis, {
      window: {
        setTimeout: (callback: () => void) => {
          callback();
          return 1;
        },
      },
    });
    let sourceOnEnded: (() => void) | null = null;
    const source = {
      buffer: null,
      connect: () => {},
      disconnect: () => {},
      onended: null as (() => void) | null,
      playbackRate: { value: 1 },
      start: () => {
        sourceOnEnded = source.onended;
      },
      stop: () => {},
    };
    const context = {
      currentTime: 10,
      createBuffer: (_channels: number, length: number, sampleRate: number) => ({
        duration: length / sampleRate,
        getChannelData: () => new Float32Array(length),
      }),
      createBufferSource: () => source,
      createGain: () => ({
        connect: () => {},
        disconnect: () => {},
        gain: {
          cancelScheduledValues: () => {},
          linearRampToValueAtTime: () => {},
          setValueAtTime: () => {},
          value: 1,
        },
      }),
      destination: {},
      state: 'running',
    };
    const manager = new TtsManager();
    Object.assign(manager, {
      audioAnalyser: { connect: () => {} },
      audioContext: context,
      masterGain: { connect: () => {}, gain: { value: 1 } },
    });

    const stream = manager.startRemotePcmPushStream('hello');
    await expect(
      stream.push({
        audioBlob: createPcm16Blob([100, 200, 300, 400]),
        mimeType: 'audio/pcm',
        sampleRate: 4,
      }),
    ).resolves.toBeUndefined();

    expect(sourceOnEnded).toBeTypeOf('function');
  });

  it('schedules decoded PCM bytes without reading the compatibility blob again', async () => {
    Object.assign(globalThis, {
      window: { setTimeout: (callback: () => void) => (callback(), 1) },
    });
    const arrayBuffer = vi.fn().mockRejectedValue(new Error('unexpected blob read'));
    const source = {
      buffer: null,
      connect: () => {},
      disconnect: () => {},
      onended: null as (() => void) | null,
      playbackRate: { value: 1 },
      start: () => {},
      stop: () => {},
    };
    const context = {
      currentTime: 10,
      createBuffer: (_channels: number, length: number, sampleRate: number) => ({
        duration: length / sampleRate,
        getChannelData: () => new Float32Array(length),
      }),
      createBufferSource: () => source,
      createGain: () => ({
        connect: () => {},
        disconnect: () => {},
        gain: {
          cancelScheduledValues: () => {},
          linearRampToValueAtTime: () => {},
          setValueAtTime: () => {},
          value: 1,
        },
      }),
      destination: {},
      state: 'running',
    };
    const manager = new TtsManager();
    Object.assign(manager, {
      audioAnalyser: { connect: () => {} },
      audioContext: context,
      masterGain: { connect: () => {}, gain: { value: 1 } },
    });

    const stream = manager.startRemotePcmPushStream('hello');
    await stream.push({
      audioBlob: { arrayBuffer } as unknown as Blob,
      audioBytes: new Uint8Array([100, 0, 200, 0]),
      mimeType: 'audio/pcm',
      sampleRate: 4,
    });

    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it('converts provider speech timing into subtitle word boundaries with stream offsets', () => {
    expect(
      remoteSpeechTimingToWordBoundaries(
        {
          wordSource: 'provider',
          phonemeSource: 'derived',
          words: [
            { text: 'hello', start: 0.1, end: 0.4 },
            { text: 'world', start: 0.5, end: 0.9 },
          ],
          phonemes: [],
        },
        1.25,
        1,
      ),
    ).toEqual([
      { word: 'hello', offset: 13500000, duration: 3000000 },
      { word: 'world', offset: 17500000, duration: 4000000 },
    ]);
  });

  it('uses one Piper synthesis result for playback and a nonblocking Discord sidecar', async () => {
    const audioBlob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/wav' });
    vi.mocked(synthesizePiperChunk).mockResolvedValue({
      audioBlob,
      phonemes: null,
      sampleRate: null,
      text: 'hello',
      wordBoundaries: [],
    });
    const playAudioChunk = vi.fn().mockResolvedValue(undefined);
    const manager = new TtsManager();
    Object.assign(manager, { audioContext: {}, playAudioChunk });

    await manager.queuePiperText('hello', 'voice-1', {
      discordToken: 'bot-secret',
      outputMode: 'local+discord',
      segmentIndex: 0,
      ttsSessionId: 'session-1',
      utteranceId: 'utterance-1',
    });

    expect(synthesizePiperChunk).toHaveBeenCalledTimes(1);
    expect(playAudioChunk).toHaveBeenCalledWith(expect.objectContaining({ audioBlob, text: 'hello' }));
    expect(uploadPiperWav).toHaveBeenCalledWith(audioBlob, {
      discordToken: 'bot-secret',
      outputMode: 'local+discord',
      segmentIndex: 0,
      ttsSessionId: 'session-1',
      utteranceId: 'utterance-1',
    });
  });

  it('does not upload stale Piper audio after its speech queue is reset', async () => {
    let resolveChunk: ((value: Awaited<ReturnType<typeof synthesizePiperChunk>>) => void) | undefined;
    vi.mocked(synthesizePiperChunk).mockReturnValue(
      new Promise((resolve) => {
        resolveChunk = resolve;
      }),
    );
    const manager = new TtsManager();
    Object.assign(manager, { playAudioChunk: vi.fn().mockResolvedValue(undefined) });
    const queued = manager.queuePiperText('hello', 'voice-1', {
      discordToken: 'bot-secret',
      outputMode: 'discord-only',
      segmentIndex: 0,
      ttsSessionId: 'session-1',
      utteranceId: 'utterance-1',
    });
    manager.resetSpeechQueue();
    resolveChunk!({
      audioBlob: new Blob([new Uint8Array([1, 2])], { type: 'audio/wav' }),
      phonemes: null,
      sampleRate: null,
      text: 'hello',
      wordBoundaries: [],
    });

    await queued;
    expect(uploadPiperWav).not.toHaveBeenCalled();
  });

  it('keeps Piper Discord uploads in segment order when synthesis resolves out of order', async () => {
    const resolvers: Array<(value: Awaited<ReturnType<typeof synthesizePiperChunk>>) => void> = [];
    vi.mocked(synthesizePiperChunk).mockImplementation(
      () => new Promise((resolve) => resolvers.push(resolve)),
    );
    const manager = new TtsManager();
    Object.assign(manager, { audioContext: {}, playAudioChunk: vi.fn().mockResolvedValue(undefined) });
    const route = (segmentIndex: number) => ({
      discordToken: 'bot-secret',
      outputMode: 'discord-only' as const,
      segmentIndex,
      ttsSessionId: 'session-1',
      utteranceId: `utterance-${segmentIndex}`,
    });
    const first = manager.queuePiperText('first', 'voice-1', route(0));
    const second = manager.queuePiperText('second', 'voice-1', route(1));
    const chunk = (text: string) => ({
      audioBlob: new Blob([text], { type: 'audio/wav' }),
      phonemes: null,
      sampleRate: null,
      text,
      wordBoundaries: [],
    });

    resolvers[1]!(chunk('second'));
    await Promise.resolve();
    expect(uploadPiperWav).not.toHaveBeenCalled();
    resolvers[0]!(chunk('first'));
    await Promise.all([first, second]);
    await vi.waitFor(() => expect(uploadPiperWav).toHaveBeenCalledTimes(2));

    expect(vi.mocked(uploadPiperWav).mock.calls.map((call) => call[1].segmentIndex)).toEqual([0, 1]);
  });
});
