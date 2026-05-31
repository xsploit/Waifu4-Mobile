import type { ChatMessage, RelationshipMemory } from './types';
import {
  dedupeFacts,
  deriveRelationshipStage,
  extractFactsFromUserMessage,
} from './memory-shared';

export function updateRelationshipMemory(
  current: RelationshipMemory,
  _history: ChatMessage[],
  userMessage: string,
) {
  const nextTurnCount = current.turnCount + 1;
  const nextFacts = dedupeFacts([...current.facts, ...extractFactsFromUserMessage(userMessage)]);

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
    facts: nextFacts,
  } satisfies RelationshipMemory;
}
