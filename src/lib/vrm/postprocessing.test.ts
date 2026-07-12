import { describe, expect, it, vi } from 'vitest';
import { resizePostProcessing, type PostProcessingRefs } from './postprocessing';

describe('resizePostProcessing', () => {
  it('uses the supplied canvas size and skips duplicate resizes', () => {
    const setSize = vi.fn();
    const refs = {
      composer: { setSize },
      height: 0,
      width: 0,
    } as unknown as PostProcessingRefs;

    resizePostProcessing(refs, 960, 540);
    resizePostProcessing(refs, 960, 540);
    resizePostProcessing(refs, 1280, 720);

    expect(setSize.mock.calls).toEqual([
      [960, 540],
      [1280, 720],
    ]);
  });
});
