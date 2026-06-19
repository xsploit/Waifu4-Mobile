import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { extname } from 'node:path';

type Finding = {
  file: string;
  kind: string;
  line?: number;
};

const blockedTrackedPathPatterns = [
  /^dist\//,
  /^release\//,
  /^docs\//,
  /^legacy-frontend\//,
  /^\.legacy-frontend\//,
  /(^|\/)\.env($|\.)/,
  /\.(db|sqlite|asar)$/i,
  /(^|\/)node_modules\//,
  /local-backup.*\.json$/i,
  /web-waifu-4-local-backup.*\.json$/i,
];

const binaryExtensions = new Set([
  '.gif',
  '.jpg',
  '.jpeg',
  '.lock',
  '.png',
  '.tgz',
  '.wasm',
  '.webp',
]);

const secretPatterns = [
  { kind: 'OpenAI-style key', pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { kind: 'Bearer token literal', pattern: /\bBearer\s+[A-Za-z0-9_.-]{24,}\b/ },
  {
    kind: 'Private key block',
    pattern: /-----BEGIN (?:RSA |OPENSSH |EC |DSA |PRIVATE )?PRIVATE KEY-----/,
  },
];

const blockedJsonPayloadPatterns = [
  {
    kind: 'local transfer backup JSON payload',
    patterns: [/"kind"\s*:\s*"local-transfer-backup"/, /"providerSecrets"\s*:/],
  },
];

function git(args: string[]) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function trackedFiles() {
  const output = git(['ls-files']);
  return output ? output.split(/\r?\n/).filter(Boolean) : [];
}

function checkBlockedPaths(files: string[]) {
  const findings: Finding[] = [];
  for (const file of files) {
    if (blockedTrackedPathPatterns.some((pattern) => pattern.test(file))) {
      findings.push({ file, kind: 'blocked tracked release path' });
    }
  }
  return findings;
}

function checkJsonPayloadPatterns(files: string[]) {
  const findings: Finding[] = [];
  for (const file of files) {
    if (extname(file).toLowerCase() !== '.json') {
      continue;
    }
    try {
      if (!statSync(file).isFile()) {
        continue;
      }
      const content = readFileSync(file, 'utf8');
      for (const { kind, patterns } of blockedJsonPayloadPatterns) {
        if (patterns.every((pattern) => pattern.test(content))) {
          findings.push({ file, kind });
        }
      }
    } catch {
      findings.push({ file, kind: 'unreadable tracked JSON file' });
    }
  }
  return findings;
}

function checkSecretPatterns(files: string[]) {
  const findings: Finding[] = [];
  for (const file of files) {
    const extension = extname(file).toLowerCase();
    if (binaryExtensions.has(extension)) {
      continue;
    }
    try {
      if (!statSync(file).isFile()) {
        continue;
      }
      const lines = readFileSync(file, 'utf8').split(/\r?\n/);
      lines.forEach((line, index) => {
        for (const { kind, pattern } of secretPatterns) {
          if (pattern.test(line)) {
            findings.push({ file, kind, line: index + 1 });
          }
        }
      });
    } catch {
      findings.push({ file, kind: 'unreadable tracked text file' });
    }
  }
  return findings;
}

function main() {
  const files = trackedFiles();
  const findings = [
    ...checkBlockedPaths(files),
    ...checkJsonPayloadPatterns(files),
    ...checkSecretPatterns(files),
  ];
  if (findings.length > 0) {
    console.error('Release audit failed:');
    for (const finding of findings) {
      const location = finding.line ? `${finding.file}:${finding.line}` : finding.file;
      console.error(`- ${location} ${finding.kind}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log(`Release audit passed: ${files.length} tracked files checked.`);
}

main();
