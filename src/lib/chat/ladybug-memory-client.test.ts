import { afterEach, describe, expect, it, vi } from 'vitest';
import {
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
});
