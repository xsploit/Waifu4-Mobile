import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  loadLadybugGrilloContextPacket,
  saveLadybugGrilloState,
  saveLadybugGrilloTurnPair,
} from './ladybug-memory-client';
import { createDefaultGrilloMemoryState } from './grillo-memory';

describe('ladybug memory client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('retries transient idempotent memory writes once', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('temporary unavailable', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await expect(
      saveLadybugGrilloState('local:persona:test', createDefaultGrilloMemoryState('local:persona:test')),
    ).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry GRILLO turn ingestion posts', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('temporary unavailable', { status: 503 }));

    await expect(
      saveLadybugGrilloTurnPair({
        assistantText: 'hi',
        scopeKey: 'local:persona:test',
        userText: 'hello',
      }),
    ).resolves.toBe(false);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('posts the query embedding and provenance metadata for native GRILLO recall', async () => {
    const packet = {
      background_information: [],
      channel_history: [],
      generatedAt: 1770000000000,
      output_description: [],
      recalled_memories: [],
      relationship_memory: [],
      retrieval_receipt: {
        embedding: null,
        lanes: {
          recalled_memories: {
            droppedIds: [],
            duplicateIds: [],
            includedIds: [],
            requestedIds: [],
          },
        },
        query: 'synthwave focus',
        strategy: 'none' as const,
      },
      scopeKey: 'local:persona:test',
      thoughts: [],
    };
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, packet }), { status: 200 }),
      );

    await expect(
      loadLadybugGrilloContextPacket('local:persona:test', {
        embeddingModel: 'all-MiniLM-L6-v2',
        embeddingProvider: 'transformers-local',
        embeddingVersion: 'model-revision-unspecified',
        participantKeys: ['local:local:subsect'],
        query: 'synthwave focus',
        queryEmbedding: [1, 0, 0],
      }),
    ).resolves.toEqual(packet);

    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toMatchObject({
      embeddingModel: 'all-MiniLM-L6-v2',
      embeddingProvider: 'transformers-local',
      participantKeys: ['local:local:subsect'],
      query: 'synthwave focus',
      queryEmbedding: [1, 0, 0],
      scopeKey: 'local:persona:test',
    });
  });
});
