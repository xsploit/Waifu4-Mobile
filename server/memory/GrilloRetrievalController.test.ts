import { describe, expect, it } from 'vitest';
import type { GrilloContextPacket } from '../../src/shared/grilloContext';
import { assessGrilloMemorySufficiency } from './GrilloRetrievalController';

function packet(overrides: Partial<GrilloContextPacket> = {}): GrilloContextPacket {
  return {
    background_information: [],
    channel_history: ['user: Earlier message', 'assistant: Earlier answer'],
    generatedAt: 1,
    output_description: [],
    recalled_memories: [
      {
        createdAt: 1,
        evidenceIds: ['turn:1'],
        id: 'recall:1',
        scopeKey: 'local:persona:hikari-chan',
        source: 'semantic',
        text: 'Subsect prefers direct technical answers.',
      },
    ],
    relationship_memory: ['trust: 4'],
    retrieval_receipt: {
      embedding: null,
      lanes: {
        recalled_memories: {
          droppedIds: [],
          duplicateIds: [],
          includedIds: ['recall:1'],
          requestedIds: ['recall:1'],
        },
      },
      query: 'test',
      strategy: 'lexical_fallback',
    },
    scopeKey: 'local:persona:hikari-chan',
    thoughts: [],
    ...overrides,
  };
}

describe('assessGrilloMemorySufficiency', () => {
  it.each([
    ['Actually, that is wrong; I meant blue.', 'correction'],
    ['What did I believe before that changed?', 'temporal'],
    ['What did you promise we were supposed to finish?', 'commitment'],
    ['How do you feel about me and our relationship?', 'relationship'],
    ['Do you remember my favorite color?', 'personal'],
    ['Why did your memory forget that context?', 'metacognitive'],
  ] as const)('detects %s as %s and produces a deterministic probe', (query, intent) => {
    const receipt = assessGrilloMemorySufficiency(query, packet());
    expect(receipt.intents).toContain(intent);
    expect(receipt.probes[0]).toBe(query);
    expect(receipt.status).toBe('sufficient');
  });

  it('reports missing recall and dropped relevant evidence without inventing sufficiency', () => {
    const receipt = assessGrilloMemorySufficiency(
      'What did you promise me last time?',
      packet({
        recalled_memories: [],
        retrieval_receipt: {
          embedding: null,
          lanes: {
            recalled_memories: {
              droppedIds: ['recall:dropped'],
              duplicateIds: [],
              includedIds: [],
              requestedIds: ['recall:dropped'],
            },
          },
          query: 'What did you promise me last time?',
          strategy: 'none',
        },
        provenance_receipt: {
          stage: 'server_context_packet',
          version: '1.0.0',
          lanes: {
            channel_history: lane(),
            relationship_memory: lane(),
            recalled_memories: lane({ droppedIds: ['recall:dropped'] }),
            thoughts: lane(),
          },
        },
      }),
    );
    expect(receipt).toMatchObject({
      droppedRelevantIds: ['recall:dropped'],
      missingLanes: ['recalled_memories'],
      status: 'partial',
    });
    expect(receipt.reasons).toContain('memory-requiring query produced no semantic or lexical recall');
  });

  it('keeps ordinary chat sufficient without requiring memory lanes', () => {
    expect(
      assessGrilloMemorySufficiency('Tell me a short story.', packet({ channel_history: [] })),
    ).toMatchObject({ intents: ['general'], requiredLanes: [], status: 'sufficient' });
  });
});

function lane(overrides: Record<string, unknown> = {}) {
  return {
    dropped: [],
    droppedIds: [],
    duplicateIds: [],
    includedIds: [],
    includedOccurrences: [],
    requestedIds: [],
    requestedOccurrences: [],
    ...overrides,
  };
}
