import { describe, expect, it } from 'vitest';
import {
  createEstimatedSubtitleWordBoundaries,
  getPlaybackSubtitleLine,
} from './subtitles';

describe('subtitle timing', () => {
  it('builds stable estimated boundaries from known speech text', () => {
    expect(createEstimatedSubtitleWordBoundaries('  hello   bright world  ', 0.25)).toEqual([
      { duration: 2_500_000, offset: 0, word: 'hello' },
      { duration: 2_500_000, offset: 2_500_000, word: 'bright' },
      { duration: 2_500_000, offset: 5_000_000, word: 'world' },
    ]);
  });

  it('reveals a rolling word window from playback time', () => {
    const text = 'one two three four five';
    const boundaries = createEstimatedSubtitleWordBoundaries(text, 0.25);

    expect(getPlaybackSubtitleLine(text, boundaries, 0, 3)).toBe('one');
    expect(getPlaybackSubtitleLine(text, boundaries, 0.76, 3)).toBe('two three four');
    expect(getPlaybackSubtitleLine(text, boundaries, 2, 3)).toBe('three four five');
  });

  it('falls back to clean complete text when timing is unavailable', () => {
    expect(getPlaybackSubtitleLine('  hello   world  ', [], 0)).toBe('hello world');
  });
});
