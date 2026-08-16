#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

const [, , sourcePath, destinationPath, maxTextureArg = '2048'] = process.argv;
if (!sourcePath || !destinationPath) {
  throw new Error(
    'Usage: optimize-vrm-textures.mjs <source.vrm> <destination.vrm> [maxTextureSize]',
  );
}
const maxTextureSize = Number.parseInt(maxTextureArg, 10);
if (!Number.isInteger(maxTextureSize) || maxTextureSize < 256 || maxTextureSize > 4096) {
  throw new Error('maxTextureSize must be an integer from 256 through 4096.');
}

const source = readFileSync(sourcePath);
if (source.subarray(0, 4).toString('ascii') !== 'glTF') {
  throw new Error(`${sourcePath} is not a binary glTF/VRM file.`);
}
const jsonLength = source.readUInt32LE(12);
const jsonType = source.readUInt32LE(16);
if (jsonType !== 0x4e4f534a) throw new Error('The first GLB chunk is not JSON.');
const jsonStart = 20;
const jsonEnd = jsonStart + jsonLength;
const document = JSON.parse(source.subarray(jsonStart, jsonEnd).toString('utf8').trimEnd());
const binHeaderStart = jsonEnd;
const binLength = source.readUInt32LE(binHeaderStart);
const binType = source.readUInt32LE(binHeaderStart + 4);
if (binType !== 0x004e4942) throw new Error('The second GLB chunk is not BIN.');
const binStart = binHeaderStart + 8;
const binary = Buffer.from(source.subarray(binStart, binStart + binLength));
const workDirectory = mkdtempSync(join(tmpdir(), 'webwaifu-vrm-'));

let resized = 0;
let originalImageBytes = 0;
let optimizedImageBytes = 0;
try {
  for (const [index, image] of (document.images ?? []).entries()) {
    if (!Number.isInteger(image.bufferView)) continue;
    const view = document.bufferViews?.[image.bufferView];
    if (!view || !Number.isInteger(view.byteLength)) continue;
    const offset = view.byteOffset ?? 0;
    const original = binary.subarray(offset, offset + view.byteLength);
    const extension = image.mimeType === 'image/jpeg' ? 'jpg' : 'png';
    const inputPath = join(workDirectory, `image-${index}.${extension}`);
    const outputPath = join(workDirectory, `image-${index}-mobile.${extension}`);
    writeFileSync(inputPath, original);
    const dimensions = execFileSync(
      'magick',
      ['identify', '-format', '%w %h', inputPath],
      { encoding: 'utf8' },
    ).trim().split(' ').filter(Boolean).map(Number);
    const [width, height] = dimensions;
    originalImageBytes += original.length;
    if (width <= maxTextureSize && height <= maxTextureSize) {
      optimizedImageBytes += original.length;
      continue;
    }
    const outputOptions =
      extension === 'jpg'
        ? ['-quality', '88']
        : ['-define', 'png:compression-level=9'];
    execFileSync(
      'magick',
      [
        `${inputPath}[0]`,
        '-resize',
        `${maxTextureSize}x${maxTextureSize}>`,
        '-strip',
        ...outputOptions,
        outputPath,
      ],
    );
    const optimized = readFileSync(outputPath);
    if (optimized.length > original.length) {
      optimizedImageBytes += original.length;
      continue;
    }
    optimized.copy(binary, offset);
    binary.fill(0, offset + optimized.length, offset + view.byteLength);
    view.byteLength = optimized.length;
    optimizedImageBytes += optimized.length;
    resized += 1;
  }

  const json = Buffer.from(JSON.stringify(document), 'utf8');
  const paddedJsonLength = Math.ceil(json.length / 4) * 4;
  const output = Buffer.alloc(12 + 8 + paddedJsonLength + 8 + binary.length, 0x20);
  output.write('glTF', 0, 'ascii');
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(paddedJsonLength, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  json.copy(output, 20);
  const outputBinHeader = 20 + paddedJsonLength;
  output.writeUInt32LE(binary.length, outputBinHeader);
  output.writeUInt32LE(0x004e4942, outputBinHeader + 4);
  binary.copy(output, outputBinHeader + 8);
  writeFileSync(destinationPath, output);
  process.stdout.write(
    `${basename(sourcePath)}: resized ${resized} texture(s), embedded images ` +
      `${Math.round(originalImageBytes / 1024 / 1024)} MB -> ` +
      `${Math.round(optimizedImageBytes / 1024 / 1024)} MB\n`,
  );
} finally {
  rmSync(workDirectory, { recursive: true, force: true });
}
