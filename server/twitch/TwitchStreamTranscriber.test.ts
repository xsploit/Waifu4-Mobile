import { describe, expect, it } from 'vitest';
import {
  getTwitchFrameScaleFilter,
  validateTwitchTranscriptText,
} from './TwitchStreamTranscriber';

describe('TwitchStreamTranscriber', () => {
  it('maps stream frame detail to ffmpeg capture scale', () => {
    expect(getTwitchFrameScaleFilter('low')).toBe('scale=960:-2');
    expect(getTwitchFrameScaleFilter('auto')).toBe('scale=1280:-2');
    expect(getTwitchFrameScaleFilter('high')).toBe('scale=1920:-2');
  });

  it('keeps Twitch prompt-echo rejection and stream-specific errors at the adapter boundary', () => {
    expect(() =>
      validateTwitchTranscriptText('Preserve names from Twitch livestream audio.', 'openrouter'),
    ).toThrow('OpenRouter transcription returned no usable stream speech.');
  });
});
