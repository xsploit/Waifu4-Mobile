import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = path.join(root, 'release');

try {
  await fs.rm(releaseDir, {
    force: true,
    maxRetries: 8,
    recursive: true,
    retryDelay: 750,
  });
  console.log(`[desktop] cleaned ${releaseDir}`);
} catch (error) {
  console.error(`[desktop] failed to clean ${releaseDir}`);
  console.error(
    'Close any running WebWaifu 4 packaged window or Windows error dialog, then retry.',
  );
  throw error;
}
