import { describe, expect, it } from 'vitest';
import { cleanVrmModelName, validateVrmFile } from './custom-vrm-library';

function makeFile(name: string, size = 1024) {
  return {
    name,
    size,
    type: 'model/vrm',
  } as File;
}

describe('custom VRM library helpers', () => {
  it('derives a readable library name from the uploaded file', () => {
    expect(cleanVrmModelName('Hikari Custom.vrm')).toBe('Hikari Custom');
    expect(cleanVrmModelName('.vrm')).toBe('Custom VRM');
  });

  it('accepts VRM files case-insensitively', () => {
    expect(() => validateVrmFile(makeFile('avatar.VRM'))).not.toThrow();
  });

  it('rejects non-VRM and empty files before storage', () => {
    expect(() => validateVrmFile(makeFile('avatar.glb'))).toThrow('Choose a .vrm file.');
    expect(() => validateVrmFile(makeFile('avatar.vrm', 0))).toThrow(
      'The selected VRM file is empty.',
    );
  });
});
