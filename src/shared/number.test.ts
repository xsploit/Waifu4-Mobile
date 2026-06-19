import { describe, expect, it } from 'vitest';
import { clampInteger } from './number';

describe('clampInteger', () => {
  it('rounds finite numbers into the accepted range', () => {
    expect(clampInteger(10.6, 1, 20)).toBe(11);
    expect(clampInteger(-5, 1, 20)).toBe(1);
    expect(clampInteger(50, 1, 20)).toBe(20);
  });

  it('ignores non-finite and non-number values', () => {
    expect(clampInteger(Number.NaN, 1, 20)).toBeUndefined();
    expect(clampInteger('10', 1, 20)).toBeUndefined();
  });
});
