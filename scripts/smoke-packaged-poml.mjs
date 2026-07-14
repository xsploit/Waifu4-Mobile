import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const projectDir = process.cwd();
const appOutDir = path.join(projectDir, 'release', 'win-unpacked');
const nestedNode = path.join(appOutDir, 'resources', 'desktop-runtime', 'node.exe');
const node = existsSync(nestedNode)
  ? nestedNode
  : path.join(projectDir, 'desktop-runtime', 'node.exe');
const pomlEntry = path.join(
  appOutDir,
  'resources',
  'app.asar.unpacked',
  'node_modules',
  'pomljs',
  'dist',
  'index.js',
);
const script = `
  const { read, write } = await import(${JSON.stringify(pathToFileURL(pomlEntry).href)});
  const rendered = write(await read('<poml><system-msg>packaged POML works</system-msg></poml>'));
  if (!String(rendered).includes('packaged POML works')) {
    throw new Error('Packaged POML smoke test returned no system message.');
  }
`;

execFileSync(node, ['--input-type=module', '--eval', script], {
  cwd: projectDir,
  stdio: 'inherit',
});
console.log('[desktop-poml] packaged renderer smoke test passed');
