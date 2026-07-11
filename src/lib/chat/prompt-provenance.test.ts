import { describe, expect, it, vi } from 'vitest';
import { buildPromptProvenanceReceipt } from './prompt-provenance';
import type { GrilloClientContextReceipt } from './grillo-context';

describe('buildPromptProvenanceReceipt', () => {
  it('proves normalized POML inclusion and exact outbound system preservation', async () => {
    const grilloContext = 'line one\nline two';
    const pomlMessages = [
      { role: 'system' as const, content: `Memory Context\n${grilloContext.replace('\n', ' ')}` },
      { role: 'user' as const, content: 'hello' },
    ];
    const outboundMessages = [
      ...pomlMessages,
      { role: 'user' as const, content: 'vision frame attached elsewhere' },
    ];
    const receipt = await buildPromptProvenanceReceipt({
      grilloContext,
      grilloReceipt: clientReceipt(),
      outboundMessages,
      pomlMessages,
      postPomlTransform: 'stream-vision',
      scopeKey: 'local:persona:hikari-chan',
    });

    expect(receipt).toMatchObject({
      blockOccurrenceCount: 1,
      blockProof: 'normalized_equivalent',
      postPomlTransform: 'stream-vision',
      systemMessageUnchanged: true,
      version: '1.0.0',
    });
    expect(receipt.grilloBlockHash).toBeTruthy();
    expect(receipt.pomlMessagesHash).not.toBe(receipt.outboundMessagesHash);
  });

  it('marks repeated blocks and a changed system message as unverified', async () => {
    const block = 'same block';
    const receipt = await buildPromptProvenanceReceipt({
      grilloContext: block,
      grilloReceipt: clientReceipt(),
      outboundMessages: [{ role: 'system', content: 'changed system' }],
      pomlMessages: [{ role: 'system', content: `${block} ${block}` }],
      postPomlTransform: 'none',
      scopeKey: 'local:persona:test',
    });

    expect(receipt).toMatchObject({
      blockOccurrenceCount: 2,
      blockProof: 'missing_or_repeated',
      outboundProof: 'unavailable',
      systemMessageUnchanged: false,
    });
  });

  it('uses a clearly labeled non-cryptographic fallback when Web Crypto is unavailable', async () => {
    vi.stubGlobal('crypto', undefined);
    try {
      const receipt = await buildPromptProvenanceReceipt({
        grilloContext: 'memory block',
        grilloReceipt: clientReceipt(),
        outboundMessages: [{ role: 'system', content: 'memory block' }],
        pomlMessages: [{ role: 'system', content: 'memory block' }],
        postPomlTransform: 'none',
        scopeKey: 'local:persona:test',
      });
      expect(receipt.hashAlgorithm).toBe('fnv1a-utf8');
      expect(receipt.outboundProof).toBe('unavailable');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

function clientReceipt(): GrilloClientContextReceipt {
  const lane = {
    dropped: [],
    droppedIds: [],
    duplicateIds: [],
    includedIds: [],
    includedOccurrences: [],
    requestedIds: [],
    requestedOccurrences: [],
  };
  return {
    lanes: {
      channel_history: lane,
      recalled_memories: lane,
      relationship_memory: lane,
      thoughts: lane,
    },
    reductions: [],
    stage: 'client_context_reducer',
    totalTokens: 0,
    usedFallback: false,
    version: '1.0.0',
  };
}
