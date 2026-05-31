import type { ChatMessage, RelationshipMemory } from './types';

export type ScopedConversationSnapshot = {
  chatHistory: ChatMessage[];
  relationshipMemory: RelationshipMemory;
};

export function resolveScopedConversationSnapshot({
  fallbackChatHistory,
  fallbackRelationshipMemory,
  chatHistories,
  relationshipMemories,
  stateKey,
}: {
  fallbackChatHistory: ChatMessage[];
  fallbackRelationshipMemory: RelationshipMemory;
  chatHistories: Record<string, ChatMessage[]>;
  relationshipMemories: Record<string, RelationshipMemory>;
  stateKey: string;
}): ScopedConversationSnapshot {
  return {
    chatHistory: chatHistories[stateKey] ?? fallbackChatHistory,
    relationshipMemory: relationshipMemories[stateKey] ?? fallbackRelationshipMemory,
  };
}
