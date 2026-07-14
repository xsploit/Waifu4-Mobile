import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

const DEPENDENCY = 'react-keyed-flatten-children';

export async function repairDesktopPomlRuntime(projectDir, appOutDir) {
  const source = path.join(
    projectDir,
    'node_modules',
    'pomljs',
    'node_modules',
    DEPENDENCY,
  );
  const target = path.join(
    appOutDir,
    'resources',
    'app.asar.unpacked',
    'node_modules',
    'pomljs',
    'node_modules',
    DEPENDENCY,
  );

  await mkdir(path.dirname(target), { recursive: true });
  await rm(target, { force: true, recursive: true });
  await cp(source, target, { force: true, recursive: true });

  const manifest = JSON.parse(await readFile(path.join(target, 'package.json'), 'utf8'));
  if (manifest.name !== DEPENDENCY) {
    throw new Error(`Packaged POML dependency repair failed at ${target}`);
  }
  console.log(`[desktop-poml] installed ${manifest.name}@${manifest.version} beside POML React`);
}
