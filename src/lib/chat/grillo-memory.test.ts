import { describe, expect, it, vi } from 'vitest';
import {
  buildGrilloMemoryPromptAdditionsFailClosedAsync,
  createEmptyGrilloMemoryPromptAdditions,
  recordGrilloMemoryTurnFailClosedAsync,
} from './grillo-memory';

describe('GRILLO memory fail-closed helpers', () => {
  it('returns empty prompt additions when memory context loading fails', async () => {
    const onError = vi.fn();

    await expect(
      buildGrilloMemoryPromptAdditionsFailClosedAsync(
        {
          query: 'hello',
          scopeKey: null as unknown as string,
        },
        onError,
      ),
    ).resolves.toEqual(createEmptyGrilloMemoryPromptAdditions());
    expect(onError).toHaveBeenCalledOnce();
  });

  it('drops failed post-turn writes instead of throwing into chat', async () => {
    const onError = vi.fn();

    await expect(
      recordGrilloMemoryTurnFailClosedAsync(
        {
          assistantText: '',
          persona: null,
          scopeKey: null as unknown as string,
          turns: [],
        },
        onError,
      ),
    ).resolves.toBeNull();
    expect(onError).toHaveBeenCalledOnce();
  });
});
