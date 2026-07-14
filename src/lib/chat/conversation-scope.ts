import type { ChatMessage, RelationshipMemory } from './types';
import { createDefaultRelationshipMemory } from './defaults';

export type ScopedConversationSnapshot = {
  chatHistory: ChatMessage[];
  relationshipMemory: RelationshipMemory;
};

export type ChatInputSurface = 'discord' | 'local' | 'twitch';

export function selectConversationStateKey(
  surface: ChatInputSurface,
  keys: { local: string; twitch: string },
): string {
  return surface === 'twitch' ? keys.twitch : keys.local;
}

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
