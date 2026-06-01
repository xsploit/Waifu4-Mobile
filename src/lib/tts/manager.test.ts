import { describe, expect, it } from 'vitest';
import { getRemotePcmChunkSchedule, remoteSpeechTimingToWordBoundaries } from './manager';
import { TtsManager } from './manager';

function createPcm16Blob(samples: number[]) {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  samples.forEach((sample, index) => {
    view.setInt16(index * 2, sample, true);
  });
  return new Blob([bytes], { type: 'audio/pcm' });
}

describe('TtsManager remote PCM scheduling', () => {
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
});
