import { describe, expect, it } from 'vitest';
import { readQueryStringArray } from './queryValues';

describe('readQueryStringArray', () => {
  it('accepts a single query value', () => {
    expect(readQueryStringArray('local:local:subsect')).toEqual(['local:local:subsect']);
  });

  it('accepts comma-separated and repeated query values without duplicates', () => {
    expect(readQueryStringArray(['local:local:subsect, local:local:guest', 'local:local:subsect'])).toEqual([
      'local:local:subsect',
      'local:local:guest',
    ]);
  });

  it('ignores non-string and empty values', () => {
    expect(readQueryStringArray([null, '', '  '])).toEqual([]);
  });
});
