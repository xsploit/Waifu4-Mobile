import { describe, expect, it } from 'vitest';
import { normalizeEmbeddingModel, normalizeEmbeddingText } from './embeddings';

describe('embedding request normalization', () => {
  it('trims and bounds embedding text', () => {
    expect(normalizeEmbeddingText('  hello  ')).toBe('hello');
    expect(normalizeEmbeddingText(` ${'x'.repeat(4100)} `)).toHaveLength(4000);
  });

  it('uses a safe default embedding model when no provider model is set', () => {
    expect(normalizeEmbeddingModel('')).toBe('openai/text-embedding-3-small');
    expect(normalizeEmbeddingModel(undefined)).toBe('openai/text-embedding-3-small');
    expect(normalizeEmbeddingModel(' google/text-embedding-005 ')).toBe('google/text-embedding-005');
  });

  it('falls back when copied chat model ids are used as embedding models', () => {
    expect(normalizeEmbeddingModel('openai/gpt-4o-mini')).toBe('openai/text-embedding-3-small');
    expect(normalizeEmbeddingModel('gpt-5-nano')).toBe('openai/text-embedding-3-small');
    expect(normalizeEmbeddingModel('openai/o3-mini')).toBe('openai/text-embedding-3-small');
  });
});
