import { describe, expect, it } from 'vitest';
import {
  formatTtsBenchmarkResults,
  summarizeTtsBenchmarkResults,
  summarizeTtsBenchmarkTiming,
} from './benchmark';
import type { TtsBenchmarkResult } from './benchmark';

describe('TTS browser benchmark helpers', () => {
  it('summarizes provider word and phoneme timestamps', () => {
    expect(
      summarizeTtsBenchmarkTiming({
        wordAlignment: {
          words: ['hello', 'morning'],
          phoneticDetails: [
            {
              phones: [
                { visemeSymbol: 'aa' },
                { visemeSymbol: 'aa' },
                { visemeSymbol: 'ih' },
              ],
            },
          ],
        },
      }),
    ).toEqual({
      timestampChunks: 1,
      words: 2,
      phonemes: 3,
      visemes: 2,
    });
  });

  it('prefers derived speech timing when present', () => {
    expect(
      summarizeTtsBenchmarkTiming(
        { wordAlignment: { words: ['ignored'] } },
        {
          wordSource: 'provider',
          phonemeSource: 'derived',
          words: [{ text: 'hello', start: 0, end: 1 }],
          phonemes: [
            { wordIndex: 0, phone: 'HH', viseme: 'aa', start: 0, end: 0.2 },
            { wordIndex: 0, phone: 'AH', viseme: 'ih', start: 0.2, end: 0.4 },
          ],
        },
      ),
    ).toEqual({
      timestampChunks: 1,
      words: 1,
      phonemes: 2,
      visemes: 2,
    });
  });

  it('formats average benchmark rows for clipboard sharing', () => {
    const results: TtsBenchmarkResult[] = [
      {
        id: 'fish-websocket',
        label: 'Fish WebSocket',
        round: 1,
        ok: true,
        firstAudioMs: 500,
        totalMs: 1000,
        playbackMs: 2000,
        chunks: 4,
        bytes: 2048,
        timing: { timestampChunks: 0, words: 0, phonemes: 0, visemes: 0 },
      },
      {
        id: 'fish-websocket',
        label: 'Fish WebSocket',
        round: 2,
        ok: true,
        firstAudioMs: 700,
        totalMs: 1200,
        playbackMs: 2200,
        chunks: 6,
        bytes: 4096,
        timing: { timestampChunks: 0, words: 0, phonemes: 0, visemes: 0 },
      },
    ];

    expect(summarizeTtsBenchmarkResults(results)).toEqual([
      {
        label: 'Fish WebSocket',
        rounds: 2,
        firstAudioMs: 600,
        totalMs: 1100,
        playbackMs: 2100,
        chunks: 5,
        kb: 3,
        words: 0,
        phones: 0,
      },
    ]);
    expect(formatTtsBenchmarkResults('hello', results)).toContain('| Fish WebSocket | 2 | 600 | 1100 | 2100 | 5 | 3 | 0 | 0 |');
  });
});
