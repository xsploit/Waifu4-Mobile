import { describe, expect, it } from 'vitest';
import { getRemotePcmChunkSchedule } from './manager';

describe('TtsManager remote PCM scheduling', () => {
  it('uses the same non-overlapping playhead math as the browser benchmark playback', () => {
    const first = getRemotePcmChunkSchedule(10, 0, 1);
    const second = getRemotePcmChunkSchedule(10.2, first.endAt, 1);
    const third = getRemotePcmChunkSchedule(12.5, second.endAt, 0.5);

    expect(first).toEqual({ startAt: 10, endAt: 11 });
    expect(second).toEqual({ startAt: 11, endAt: 12 });
    expect(third).toEqual({ startAt: 12.5, endAt: 13 });
  });
});

