import type { RelationshipMemory } from './types';

export function commitScopedRelationshipMemoryState(
  current: Record<string, RelationshipMemory>,
  stateKey: string,
  memory: RelationshipMemory,
) {
  const key = stateKey.trim();
  if (!key) {
    return current;
  }

  return {
    ...current,
    [key]: memory,
  };
}

export function clearScopedRelationshipMemoryState(
  current: Record<string, RelationshipMemory>,
  stateKey: string,
) {
  const key = stateKey.trim();
  if (!key || !(key in current)) {
    return current;
  }

  const next = { ...current };
  delete next[key];
  return next;
}

export function shouldExposeScopedRelationshipMemory(stateKey: string, activeStateKey: string) {
  return stateKey.trim() === activeStateKey.trim();
}
