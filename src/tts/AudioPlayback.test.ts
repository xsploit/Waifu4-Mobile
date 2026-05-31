import { describe, expect, it } from 'vitest';
import { AudioPlayback, pcm16ToFloat } from './AudioPlayback';

class FakeAudioBuffer {
  readonly duration: number;
  private readonly data: Float32Array;

  constructor(length: number, sampleRate: number) {
    this.duration = length / sampleRate;
    this.data = new Float32Array(length);
  }

  getChannelData() {
    return this.data;
  }
}

class FakeAudioContext {
  currentTime = 10;
  state = 'running';
  destination = {};
  starts: number[] = [];
  sources: Array<{ connections: unknown[]; onended: (() => void) | null }> = [];

  async resume() {}

  createBuffer(_channels: number, length: number, sampleRate: number) {
    return new FakeAudioBuffer(length, sampleRate);
  }

  createBufferSource() {
    const source = {
      buffer: null as FakeAudioBuffer | null,
      onended: null as (() => void) | null,
      connections: [] as unknown[],
      connect: (target: unknown) => {
        source.connections.push(target);
      },
      start: (when: number) => {
        this.starts.push(when);
      },
      stop: () => {},
    };
    this.sources.push(source);
    return source;
  }
}

describe('AudioPlayback', () => {
  it('converts signed 16-bit PCM into normalized floats and RMS amplitude', () => {
    const { samples, amplitude } = pcm16ToFloat(new Uint8Array([0x00, 0x40, 0x00, 0xc0]));
    expect([...samples]).toEqual([0.5, -0.5]);
    expect(amplitude).toBeCloseTo(0.5);
  });

  it('schedules chunks on a running playhead', async () => {
    const context = new FakeAudioContext();
    const states: unknown[] = [];
    const playback = new AudioPlayback({ context, onState: (state) => states.push(state) });
    await playback.playPcmChunk(new Uint8Array([0, 0, 0, 0]), 2);
    await playback.playPcmChunk(new Uint8Array([0, 0, 0, 0]), 2);
    expect(context.starts).toEqual([10, 11]);
    expect(playback.getState()).toMatchObject({ status: 'playing', chunks: 2, bytes: 8, queuedSeconds: 2 });
    expect(states).toHaveLength(2);
  });

  it('routes playback audio into an optional lipsync tap', async () => {
    const context = new FakeAudioContext();
    const tap = { input: { kind: 'wlipsync' } };
    const playback = new AudioPlayback({ context, tap });
    await playback.playPcmChunk(new Uint8Array([0, 0]), 2);
    expect(context.sources[0]?.connections).toEqual([context.destination, tap.input]);
    expect(playback.getState().chunks).toBe(1);
  });

  it('resolves waitForIdle after the final source ends', async () => {
    const context = new FakeAudioContext();
    const playback = new AudioPlayback({ context });
    await playback.playPcmChunk(new Uint8Array([0, 0]), 2);
    let resolved = false;
    const idle = playback.waitForIdle().then(() => {
      resolved = true;
    });
    expect(resolved).toBe(false);
    context.sources[0]?.onended?.();
    await idle;
    expect(resolved).toBe(true);
  });
});
