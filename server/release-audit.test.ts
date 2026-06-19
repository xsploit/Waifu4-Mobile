import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  auditTrackedFiles,
  checkBlockedPaths,
  checkJsonPayloadPatterns,
  checkSecretPatterns,
} from '../scripts/release-audit';

const tempRoots: string[] = [];

function tempFile(name: string, content: string) {
  const root = mkdtempSync(join(tmpdir(), 'webwaifu-release-audit-'));
  tempRoots.push(root);
  const file = join(root, name);
  writeFileSync(file, content, 'utf8');
  return file;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { force: true, recursive: true });
    }
  }
});

describe('release audit', () => {
  it('blocks tracked release-only paths and local backup filenames', () => {
    expect(
      checkBlockedPaths([
        'docs/source-of-truth.md',
        'release/win-unpacked/app.exe',
        'web-waifu-4-local-backup-example.json',
      ]),
    ).toEqual([
      { file: 'docs/source-of-truth.md', kind: 'blocked tracked release path' },
      { file: 'release/win-unpacked/app.exe', kind: 'blocked tracked release path' },
      { file: 'web-waifu-4-local-backup-example.json', kind: 'blocked tracked release path' },
    ]);
  });

  it('blocks renamed local transfer backup JSON payloads', () => {
    const backup = tempFile(
      'settings.json',
      JSON.stringify({
        app: 'web-waifu-4-local',
        kind: 'local-transfer-backup',
        providerSecrets: [],
      }),
    );

    expect(checkJsonPayloadPatterns([backup])).toEqual([
      { file: backup, kind: 'local transfer backup JSON payload' },
    ]);
  });

  it('does not block source files that only mention backup fields', () => {
    const source = tempFile(
      'example.ts',
      'const kind = "local-transfer-backup"; const providerSecrets = [];',
    );

    expect(checkJsonPayloadPatterns([source])).toEqual([]);
  });

  it('finds token-shaped secrets in tracked text files with line numbers', () => {
    const source = tempFile(
      'example.ts',
      ['const ok = true;', 'const key = "sk-' + 'a'.repeat(24) + '";'].join('\n'),
    );

    expect(checkSecretPatterns([source])).toEqual([
      { file: source, kind: 'OpenAI-style key', line: 2 },
    ]);
  });

  it('combines path, payload, and secret findings', () => {
    const backup = tempFile(
      'renamed.json',
      JSON.stringify({ kind: 'local-transfer-backup', providerSecrets: [] }),
    );

    const findings = auditTrackedFiles(['dist/app.js', backup]);
    expect(findings).toEqual([
      { file: 'dist/app.js', kind: 'blocked tracked release path' },
      { file: backup, kind: 'local transfer backup JSON payload' },
    ]);
  });
});
