import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export type DistAuditFinding = {
  file: string;
  kind: string;
  line?: number;
};

const textExtensions = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.map',
  '.svg',
  '.txt',
]);

const blockedDistPatterns = [
  { kind: 'Windows user path', pattern: /\b[A-Z]:[\\/]+Users[\\/]+/i },
  { kind: 'Unix home deployment path', pattern: /\/home\/(?:ubuntu|subsect|root)\//i },
  {
    kind: 'local backup filename',
    pattern: /web-waifu-4-local-backup-\d{4}-\d{2}-\d{2}T/i,
  },
  { kind: 'OpenAI-style key', pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { kind: 'Bearer token literal', pattern: /\bBearer\s+[A-Za-z0-9_.-]{24,}\b/ },
  {
    kind: 'Private key block',
    pattern: /-----BEGIN (?:RSA |OPENSSH |EC |DSA |PRIVATE )?PRIVATE KEY-----/,
  },
];

function normalizePath(value: string) {
  return value.split(sep).join('/');
}

function collectFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

export function checkDistText(file: string, content: string): DistAuditFinding[] {
  const findings: DistAuditFinding[] = [];
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const { kind, pattern } of blockedDistPatterns) {
      if (pattern.test(line)) {
        findings.push({ file, kind, line: index + 1 });
      }
    }
  });
  return findings;
}

export function auditDist(root = 'dist'): DistAuditFinding[] {
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    return [{ file: normalizePath(root), kind: 'missing dist directory' }];
  }

  const findings: DistAuditFinding[] = [];
  for (const file of collectFiles(root)) {
    if (!textExtensions.has(extname(file).toLowerCase())) {
      continue;
    }
    const relativeFile = normalizePath(relative(root, file));
    findings.push(...checkDistText(relativeFile, readFileSync(file, 'utf8')));
  }
  return findings;
}

function main() {
  const root = process.argv[2] ?? 'dist';
  const findings = auditDist(root);
  if (findings.length > 0) {
    console.error('Dist audit failed:');
    for (const finding of findings) {
      const location = finding.line ? `${finding.file}:${finding.line}` : finding.file;
      console.error(`- ${location} ${finding.kind}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log(`Dist audit passed: ${root}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}
