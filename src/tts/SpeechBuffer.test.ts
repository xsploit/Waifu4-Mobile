import { describe, expect, it } from 'vitest';
import { createSpeechBuffer } from './SpeechBuffer';

describe('SpeechBuffer', () => {
  it('holds partial deltas until a speakable sentence boundary', () => {
    const buffer = createSpeechBuffer({ minChars: 8 });
    expect(buffer.push('Once upon')).toEqual([]);
    expect(buffer.push(' a time. Then')).toEqual(['Once upon a time.']);
    expect(buffer.flush()).toEqual(['Then']);
  });

  it('cuts long text at a word boundary before waiting forever', () => {
    const buffer = createSpeechBuffer({ minChars: 8, maxChars: 24 });
    expect(buffer.push('This is a long sentence with no punctuation yet')).toEqual([
      'This is a long sentence',
    ]);
  });

  it('keeps very short interjections with the following sentence', () => {
    const buffer = createSpeechBuffer({ minChars: 12 });
    expect(buffer.push('Oh! That works.')).toEqual(['Oh! That works.']);
  });
});
