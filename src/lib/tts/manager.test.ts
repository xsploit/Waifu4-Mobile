import { beforeEach, describe, expect, it, vi } from 'vitest';
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

function createPcm16Blob(samples: number[]) {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  samples.forEach((sample, index) => {
    view.setInt16(index * 2, sample, true);
  });
  return new Blob([bytes], { type: 'audio/pcm' });
}

describe('TtsManager remote PCM scheduling', () => {
  it('mutes only the local destination for Discord and external output modes', () => {
    const manager = new TtsManager();
    const localGain = { gain: { value: 1 } };
    const streamGain = { gain: { value: 1 } };
    Object.assign(manager, { masterGain: localGain, streamGain, volume: 0.8 });

    manager.setOutputRoute('discord-only');
    expect(localGain.gain.value).toBe(0);
    expect(streamGain.gain.value).toBe(0.8);

    manager.setOutputRoute('local+discord');
    expect(localGain.gain.value).toBe(0.8);
    expect(streamGain.gain.value).toBe(0.8);

    manager.setOutputRoute('external', 'virtual-cable');
    expect(localGain.gain.value).toBe(0);
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
      outputMode: 'local+discord',
      segmentIndex: 0,
      ttsSessionId: 'session-1',
      utteranceId: 'utterance-1',
    });

    expect(synthesizePiperChunk).toHaveBeenCalledTimes(1);
    expect(playAudioChunk).toHaveBeenCalledWith(expect.objectContaining({ audioBlob, text: 'hello' }));
    expect(uploadPiperWav).toHaveBeenCalledWith(audioBlob, {
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
});
