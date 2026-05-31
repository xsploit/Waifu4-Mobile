import { describe, expect, it } from 'vitest';
import { buildSpeechTiming, createSpeechTimingAccumulator, summarizeNativeTiming } from './SpeechTiming';
import type { TtsTimestampInfo } from '../../src/tts/TtsClient';

describe('speech timing normalization', () => {
  it('builds provider-neutral words and derived phoneme timing', () => {
    const timing = buildSpeechTiming({
      wordAlignment: {
        words: ['star'],
        wordStartTimeSeconds: [0.4],
        wordEndTimeSeconds: [0.8],
      },
    });

    expect(timing?.wordSource).toBe('provider');
    expect(timing?.phonemeSource).toBe('derived');
    expect(timing?.words).toEqual([{ text: 'star', start: 0.4, end: 0.8 }]);
    expect(timing?.phonemes.map((phone) => phone.viseme)).toContain('aa');
    expect(timing?.phonemes[0]?.start).toBe(0.4);
    expect(timing?.phonemes.at(-1)?.end).toBe(0.8);
  });

  it('keeps native metadata as telemetry while deduping repeated provider words', () => {
    const timestamps: TtsTimestampInfo = {
      wordAlignment: {
        words: ['hello'],
        wordStartTimeSeconds: [0],
        wordEndTimeSeconds: [0.5],
        phoneticDetails: [
          {
            wordIndex: 0,
            phones: [
              { phoneSymbol: 'HH', visemeSymbol: 'rest' },
              { phoneSymbol: 'AH', visemeSymbol: 'aa' },
            ],
          },
        ],
      },
    };
    const accumulator = createSpeechTimingAccumulator();
    accumulator.add(buildSpeechTiming(timestamps), timestamps);
    accumulator.add(buildSpeechTiming(timestamps), timestamps);

    expect(summarizeNativeTiming(timestamps)).toEqual({
      nativeWords: 1,
      nativePhonemes: 2,
      nativeVisemes: 2,
    });
    expect(accumulator.summary()).toMatchObject({
      timestampChunks: 2,
      words: 1,
      nativeWords: 2,
      nativePhonemes: 4,
      nativeVisemes: 2,
    });
  });
});
