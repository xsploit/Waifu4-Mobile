import type { ChatMessage, RelationshipMemory } from './types';
import { createDefaultRelationshipMemory } from './defaults';

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
  allowLegacyFallback = false,
}: {
  allowLegacyFallback?: boolean;
  fallbackChatHistory: ChatMessage[];
  fallbackRelationshipMemory: RelationshipMemory;
  chatHistories: Record<string, ChatMessage[]>;
  relationshipMemories: Record<string, RelationshipMemory>;
  stateKey: string;
}): ScopedConversationSnapshot {
  return {
    chatHistory: chatHistories[stateKey] ?? (allowLegacyFallback ? fallbackChatHistory : []),
    relationshipMemory:
      relationshipMemories[stateKey] ??
      (allowLegacyFallback ? fallbackRelationshipMemory : createDefaultRelationshipMemory()),
  };
}
