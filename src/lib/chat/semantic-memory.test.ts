import { beforeEach, describe, expect, it, vi } from 'vitest';

const remoteState = vi.hoisted(() => ({
  deleteResult: true,
  records: [] as Array<Record<string, unknown>>,
}));

vi.mock('./ladybug-memory-client', () => ({
  deleteLadybugSemanticMemory: vi.fn(async () => remoteState.deleteResult),
  loadLadybugSemanticMemory: vi.fn(async () => remoteState.records),
  saveLadybugSemanticMemory: vi.fn(async (_scopeKey: string, records: unknown[]) => {
    remoteState.records.splice(
      0,
      remoteState.records.length,
      ...(records as Array<Record<string, unknown>>),
    );
    return true;
  }),
  searchLadybugSemanticMemory: vi.fn(async () =>
    remoteState.records.map((record) => ({ ...record, score: 1 })),
  ),
}));

import {
  addSemanticMemoryTurn,
  clearSemanticMemory,
  findSemanticMemoryMatches,
} from './semantic-memory';

describe('participant-scoped semantic memory', () => {
  beforeEach(() => {
    remoteState.deleteResult = true;
    remoteState.records.length = 0;
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

    remoteState.records.push(
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

  it('does not report semantic memory cleared when Ladybug rejects the delete', async () => {
    const scopeKey = 'local:persona:delete-failure';
    const write = await addSemanticMemoryTurn({
      assistantText: 'I will keep this until the canonical delete succeeds.',
      embedding: [1, 0],
      persona: null,
      scopeKey,
      userText: 'Remember this durable fact.',
    });
    remoteState.deleteResult = false;

    await expect(clearSemanticMemory(scopeKey)).rejects.toThrow(
      'Ladybug semantic memory delete failed.',
    );

    const matches = await findSemanticMemoryMatches(scopeKey, 'durable fact', [1, 0], 4);
    expect(matches.map((match) => match.id)).toContain(write!.record.id);
  });
});
