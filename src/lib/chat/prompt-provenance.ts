import type { GrilloClientContextReceipt } from './grillo-context';

type PromptProvenanceMessage = {
  content: unknown;
  role: string;
};

export type PromptProvenanceReceipt = {
  blockOccurrenceCount: number;
  blockProof: 'missing_or_repeated' | 'normalized_equivalent';
  grillo: GrilloClientContextReceipt;
  grilloBlockHash: string;
  hashAlgorithm: 'fnv1a-utf8' | 'sha-256';
  outboundMessagesHash: string;
  outboundProof: 'unavailable' | 'verified';
  pomlMessagesHash: string;
  postPomlTransform: 'none' | 'stream-vision';
  scopeKey: string;
  systemMessageHash: string;
  systemMessageUnchanged: boolean;
  version: '1.0.0';
};

export async function buildPromptProvenanceReceipt(input: {
  grilloContext: string;
  grilloReceipt: GrilloClientContextReceipt;
  outboundMessages: PromptProvenanceMessage[];
  pomlMessages: PromptProvenanceMessage[];
  postPomlTransform: PromptProvenanceReceipt['postPomlTransform'];
  scopeKey: string;
}): Promise<PromptProvenanceReceipt> {
  const normalizedBlock = normalizeWhitespace(input.grilloContext);
  const normalizedSystem = normalizeWhitespace(systemText(input.pomlMessages));
  const blockOccurrenceCount = countOccurrences(normalizedSystem, normalizedBlock);
  const pomlSystem = systemText(input.pomlMessages);
  const outboundSystem = systemText(input.outboundMessages);
  const payloads = [
    normalizedBlock,
    JSON.stringify(input.pomlMessages),
    JSON.stringify(input.outboundMessages),
    outboundSystem,
  ];
  const hashed = await hashPayloads(payloads);
  const systemMessageUnchanged = pomlSystem === outboundSystem;
  return {
    blockOccurrenceCount,
    blockProof: blockOccurrenceCount === 1 ? 'normalized_equivalent' : 'missing_or_repeated',
    grillo: input.grilloReceipt,
    grilloBlockHash: hashed.hashes[0]!,
    hashAlgorithm: hashed.algorithm,
    outboundMessagesHash: hashed.hashes[2]!,
    outboundProof:
      hashed.algorithm === 'sha-256' && systemMessageUnchanged && blockOccurrenceCount === 1
        ? 'verified'
        : 'unavailable',
    pomlMessagesHash: hashed.hashes[1]!,
    postPomlTransform: input.postPomlTransform,
    scopeKey: input.scopeKey,
    systemMessageHash: hashed.hashes[3]!,
    systemMessageUnchanged,
    version: '1.0.0',
  };
}

function systemText(messages: PromptProvenanceMessage[]) {
  return messages
    .filter((message) => message.role === 'system' && typeof message.content === 'string')
    .map((message) => message.content)
    .join('\n\n');
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function countOccurrences(haystack: string, needle: string) {
  if (!needle) return 0;
  let count = 0;
  let offset = 0;
  while ((offset = haystack.indexOf(needle, offset)) >= 0) {
    count += 1;
    offset += needle.length;
  }
  return count;
}

async function hashPayloads(payloads: string[]) {
  if (globalThis.crypto?.subtle) {
    const hashes = await Promise.all(
      payloads.map(async (payload) => {
        const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
        return bytesToHex(new Uint8Array(digest));
      }),
    );
    return { algorithm: 'sha-256' as const, hashes };
  }
  return {
    algorithm: 'fnv1a-utf8' as const,
    hashes: payloads.map(fnv1aUtf8),
  };
}

function fnv1aUtf8(value: string) {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
