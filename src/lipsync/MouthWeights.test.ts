import { describe, expect, it } from 'vitest';
import { mapWLipSyncWeights } from './MouthWeights';

describe('mapWLipSyncWeights', () => {
  it('maps WLipSync phoneme labels to VRM mouth weights', () => {
    expect(mapWLipSyncWeights({ A: 0.2, I: 0.3, U: 0.4, E: 0.5, O: 0.6 })).toEqual({
      aa: 0.2,
      ih: 0.3,
      ou: 0.4,
      ee: 0.5,
      oh: 0.6,
    });
  });

  it('clamps values and ignores non-mouth labels', () => {
    expect(mapWLipSyncWeights({ A: 2, I: -1, S: 0.9 })).toEqual({
      aa: 1,
      ih: 0,
      ou: 0,
      ee: 0,
      oh: 0,
    });
  });
});
