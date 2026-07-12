import { beforeEach, describe, expect, it, vi } from 'vitest';

const remoteRecords = vi.hoisted(() => [] as Array<Record<string, unknown>>);

vi.mock('./ladybug-memory-client', () => ({
  deleteLadybugSemanticMemory: vi.fn(async () => true),
  loadLadybugSemanticMemory: vi.fn(async () => remoteRecords),
  saveLadybugSemanticMemory: vi.fn(async (_scopeKey: string, records: unknown[]) => {
    remoteRecords.splice(0, remoteRecords.length, ...(records as Array<Record<string, unknown>>));
    return true;
  }),
  searchLadybugSemanticMemory: vi.fn(async () =>
    remoteRecords.map((record) => ({ ...record, score: 1 })),
  ),
}));

import { addSemanticMemoryTurn, findSemanticMemoryMatches } from './semantic-memory';

describe('participant-scoped semantic memory', () => {
  beforeEach(() => {
    remoteRecords.length = 0;
  });

  it('normalizes participant identity and blocks other or unknown remote participants', async () => {
    const scopeKey = 'twitch:channel:collab:persona:hikari';
    const write = await addSemanticMemoryTurn({
      assistantText: 'I will remember your synthwave preference.',
      embedding: [1, 0],
      participantKeys: [' Twitch:Collab:Alice ', 'twitch:collab:alice'],
      persona: null,
      scopeKey,
      userText: 'Synthwave helps me focus.',
    });
    expect(write?.record.participantKeys).toEqual(['twitch:collab:alice']);

    remoteRecords.push(
      {
        ...write!.record,
        id: 'semantic-bob',
        participantKeys: ['twitch:collab:bob'],
      },
      {
        ...write!.record,
        id: 'semantic-legacy',
        participantKeys: [],
      },
    );

    const aliceMatches = await findSemanticMemoryMatches(
      scopeKey,
      'synthwave focus',
      [1, 0],
      4,
      ['twitch:collab:alice'],
    );
    expect(aliceMatches.map((match) => match.id)).toEqual([write!.record.id]);
  });
});
