import { describe, expect, it } from 'vitest';
import {
  createLaneBParser,
  extractStructuredReply,
  monotonicDelta,
  parseLaneB,
} from './replyParser';

const META = '{"emotion":"amused","valence":0.4,"arousal":0.5,"dominance":0.1}';

function streamThrough(chunks: string[]) {
  const parser = createLaneBParser();
  let visible = '';
  for (const c of chunks) {
    visible += parser.push(c);
  }
  const fin = parser.finish();
  visible += fin.flushedDelta;
  return { visible, ...fin };
}

describe('Lane B parser', () => {
  it('parses a clean reply with a meta block', () => {
    const { visibleText, metadata } = parseLaneB(`Hello there\n<yw-meta>${META}</yw-meta>`);
    expect(visibleText).toBe('Hello there');
    expect(metadata).toEqual({ emotion: 'amused', valence: 0.4, arousal: 0.5, dominance: 0.1 });
  });

  it('streams visible text and never leaks the tag, even split across chunks', () => {
    const { visible, visibleText, metadata } = streamThrough([
      'Hel',
      'lo th',
      'ere<yw-me',
      'ta>' + META.slice(0, 10),
      META.slice(10) + '</yw-meta>',
    ]);
    expect(visible).not.toContain('<yw-meta>');
    expect(visible).not.toContain('emotion');
    expect(visibleText).toBe('Hello there');
    expect(metadata?.emotion).toBe('amused');
  });

  it('produces identical visible text whether chunked or whole', () => {
    const full = `The quick brown fox.\n<yw-meta>${META}</yw-meta>`;
    const charByChar = streamThrough(full.split(''));
    expect(charByChar.visibleText).toBe('The quick brown fox.');
    expect(charByChar.visible.replace(/\s+$/, '')).toBe('The quick brown fox.');
  });

  it('treats text with no meta block as all visible', () => {
    const { visibleText, metadata } = parseLaneB('just talking, no metadata here');
    expect(visibleText).toBe('just talking, no metadata here');
    expect(metadata).toBeNull();
  });

  it('does not prematurely emit a lone "<" that could start the tag', () => {
    const parser = createLaneBParser();
    const out = parser.push('done <');
    expect(out).toBe('done '); // the trailing "<" is held back
  });

  it('returns null metadata for malformed JSON but keeps visible text', () => {
    const { visibleText, metadata } = parseLaneB('spoken<yw-meta>{not valid json}</yw-meta>');
    expect(visibleText).toBe('spoken');
    expect(metadata).toBeNull();
  });

  it('parses metadata even when the close tag is missing', () => {
    const { visibleText, metadata } = parseLaneB(`spoken<yw-meta>${META}`);
    expect(visibleText).toBe('spoken');
    expect(metadata?.valence).toBe(0.4);
  });

  it('rejects out-of-range VAD values via schema', () => {
    const { metadata } = parseLaneB(
      'x<yw-meta>{"emotion":"happy","valence":9,"arousal":0.5,"dominance":0}</yw-meta>',
    );
    expect(metadata).toBeNull();
  });
});

describe('Lane A helpers', () => {
  it('extracts message + metadata from a structured object', () => {
    const { visibleText, metadata } = extractStructuredReply({
      message: 'hi',
      emotion: 'happy',
      valence: 0.2,
      arousal: 0.3,
      dominance: 0.1,
    });
    expect(visibleText).toBe('hi');
    expect(metadata?.emotion).toBe('happy');
  });

  it('handles a missing message gracefully', () => {
    expect(extractStructuredReply({ emotion: 'sad' }).visibleText).toBe('');
  });

  it('computes monotonic deltas', () => {
    expect(monotonicDelta('Hel', 'Hello')).toBe('lo');
    expect(monotonicDelta('Hello', 'Hello')).toBe('');
    expect(monotonicDelta('Hello', 'Goodbye')).toBe(''); // non-monotonic guard
  });
});
