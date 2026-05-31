import { describe, expect, it } from 'vitest';
import { getTwitchFrameScaleFilter } from './TwitchStreamTranscriber';

describe('TwitchStreamTranscriber', () => {
  it('maps stream frame detail to ffmpeg capture scale', () => {
    expect(getTwitchFrameScaleFilter('low')).toBe('scale=960:-2');
    expect(getTwitchFrameScaleFilter('auto')).toBe('scale=1280:-2');
    expect(getTwitchFrameScaleFilter('high')).toBe('scale=1920:-2');
  });
});
