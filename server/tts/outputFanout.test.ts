import { describe, expect, it, vi } from 'vitest';
import { TtsOutputFanout, type TtsOutputChunk } from './outputFanout';

const chunk: TtsOutputChunk = {
  audio: new Uint8Array([1, 2, 3]),
  chunkIndex: 0,
  format: 'pcm',
  sampleRate: 44_100,
  segmentIndex: 0,
  sessionId: 'session-1',
  utteranceId: 'utterance-1',
};

describe('TtsOutputFanout', () => {
  it('does no sidecar work for browser and external-only modes', () => {
    const tryEnqueue = vi.fn(() => true);
    const fanout = new TtsOutputFanout();
    fanout.setDiscordSink({ tryEnqueue });

    expect(fanout.tryEnqueue('local-only', chunk)).toBe(true);
    expect(fanout.tryEnqueue('external', chunk)).toBe(true);
    expect(tryEnqueue).not.toHaveBeenCalled();
  });

  it('forwards Discord modes synchronously without returning a promise', () => {
    const tryEnqueue = vi.fn(() => true);
    const fanout = new TtsOutputFanout();
    fanout.setDiscordSink({ tryEnqueue });

    const result = fanout.tryEnqueue('local+discord', chunk);
    expect(result).toBe(true);
    expect(result).not.toBeInstanceOf(Promise);
    expect(tryEnqueue).toHaveBeenCalledWith(chunk);
  });

  it('isolates a missing, full, or throwing Discord sink', () => {
    const fanout = new TtsOutputFanout();
    expect(fanout.tryEnqueue('discord-only', chunk)).toBe(false);

    fanout.setDiscordSink({ tryEnqueue: () => false });
    expect(fanout.tryEnqueue('discord-only', chunk)).toBe(false);

    fanout.setDiscordSink({ tryEnqueue: () => { throw new Error('blocked'); } });
    expect(fanout.tryEnqueue('discord-only', chunk)).toBe(false);
  });
});
