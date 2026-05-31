import { describe, expect, it } from 'vitest';
import { createDefaultRelationshipMemory } from './defaults';
import {
  clearScopedRelationshipMemoryState,
  commitScopedRelationshipMemoryState,
  shouldExposeScopedRelationshipMemory,
} from './scoped-relationship-memory';

describe('scoped relationship memory', () => {
  it('stores inactive scope updates without exposing them as the active memory', () => {
    const localMemory = {
      ...createDefaultRelationshipMemory(),
      summary: 'local persona memory',
    };
    const twitchMemory = {
      ...createDefaultRelationshipMemory(),
      summary: 'twitch channel memory',
    };
    const activeStateKey = 'local:persona:riko';
    const twitchStateKey = 'twitch:subsect:persona:riko';

    const next = commitScopedRelationshipMemoryState(
      { [activeStateKey]: localMemory },
      twitchStateKey,
      twitchMemory,
    );

    expect(next[activeStateKey]?.summary).toBe('local persona memory');
    expect(next[twitchStateKey]?.summary).toBe('twitch channel memory');
    expect(shouldExposeScopedRelationshipMemory(twitchStateKey, activeStateKey)).toBe(false);
    expect(shouldExposeScopedRelationshipMemory(activeStateKey, activeStateKey)).toBe(true);
  });

  it('removes only the cleared scope from relationship memory state', () => {
    const localMemory = {
      ...createDefaultRelationshipMemory(),
      summary: 'local persona memory',
    };
    const twitchMemory = {
      ...createDefaultRelationshipMemory(),
      summary: 'twitch channel memory',
    };
    const localStateKey = 'local:persona:riko';
    const twitchStateKey = 'twitch:subsect:persona:riko';

    const next = clearScopedRelationshipMemoryState(
      {
        [localStateKey]: localMemory,
        [twitchStateKey]: twitchMemory,
      },
      localStateKey,
    );

    expect(next[localStateKey]).toBeUndefined();
    expect(next[twitchStateKey]?.summary).toBe('twitch channel memory');
  });
});
