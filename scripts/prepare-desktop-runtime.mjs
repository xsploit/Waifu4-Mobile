import { copyFile, mkdir, rm, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import process from 'node:process';

const outputDir = join(process.cwd(), 'desktop-runtime');
const source = process.execPath;
const targetName = process.platform === 'win32' ? 'node.exe' : basename(source);
const target = join(outputDir, targetName);

await mkdir(outputDir, { recursive: true });
await rm(target, { force: true });
await copyFile(source, target);

const copied = await stat(target);
console.log(`[desktop-runtime] copied ${source} -> ${target} (${copied.size} bytes)`);
