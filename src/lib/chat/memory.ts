import type { ChatMessage, RelationshipMemory } from './types';
import { deriveRelationshipStage } from './memory-shared';

export function updateRelationshipMemory(
  current: RelationshipMemory,
  _history: ChatMessage[],
  _userMessage: string,
) {
  const nextTurnCount = current.turnCount + 1;

  return {
    ...current,
    turnCount: nextTurnCount,
    lastSeenAt: Date.now(),
    relationshipStage: deriveRelationshipStage({
      turnCount: nextTurnCount,
      trust: current.trust,
      respect: current.respect,
      attraction: current.attraction,
      guard: current.guard,
    }),
  } satisfies RelationshipMemory;
}
