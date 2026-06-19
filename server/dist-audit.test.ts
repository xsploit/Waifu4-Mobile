import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { auditDist, checkDistText } from '../scripts/dist-audit';

const tempRoots: string[] = [];

function tempRoot() {
  const root = mkdtempSync(join(tmpdir(), 'webwaifu-dist-audit-'));
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { force: true, recursive: true });
    }
  }
});

describe('dist audit', () => {
  it('finds local paths and token-shaped strings in text artifacts', () => {
    expect(
      checkDistText(
        'assets/index.js',
        [
          'const path = "C:/Users/SUBSECT/Downloads/file.json";',
          'const key = "sk-' + 'a'.repeat(24) + '";',
        ].join('\n'),
      ),
    ).toEqual([
      { file: 'assets/index.js', kind: 'Windows user path', line: 1 },
      { file: 'assets/index.js', kind: 'OpenAI-style key', line: 2 },
    ]);
  });

  it('passes clean text artifacts and ignores binary assets', () => {
    const root = tempRoot();
    writeFileSync(join(root, 'index.html'), '<script src="/assets/index.js"></script>', 'utf8');
    writeFileSync(join(root, 'model.vrm'), 'C:/Users/SUBSECT/not-scanned', 'utf8');

    expect(auditDist(root)).toEqual([]);
  });

  it('reports a missing dist directory', () => {
    const missingRoot = join(tempRoot(), 'missing');
    expect(auditDist(missingRoot)).toEqual([
      { file: missingRoot.replaceAll('\\', '/'), kind: 'missing dist directory' },
    ]);
  });
});
