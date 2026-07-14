import { describe, expect, it } from 'vitest';

import { createDefaultRelationshipMemory } from './defaults';
import { updateRelationshipMemory } from './memory';

describe('relationship memory counters', () => {
  it('updates immediate relationship progress without inventing durable facts', () => {
    const current = {
      ...createDefaultRelationshipMemory(),
      facts: ['Existing evidence-backed fact.'],
    };

    const updated = updateRelationshipMemory(
      current,
      [],
      'My name is Subsect and I love synthwave.',
    );

    expect(updated.turnCount).toBe(current.turnCount + 1);
    expect(updated.lastSeenAt).toBeGreaterThan(0);
    expect(updated.facts).toEqual(['Existing evidence-backed fact.']);
  });
});
