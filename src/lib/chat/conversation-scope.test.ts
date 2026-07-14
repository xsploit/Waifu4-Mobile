import { describe, expect, it } from 'vitest';
import { createDefaultRelationshipMemory } from './defaults';
import type { ChatMessage } from './types';
import { resolveScopedConversationSnapshot, selectConversationStateKey } from './conversation-scope';

const fallbackHistory: ChatMessage[] = [
  {
    content: 'global history',
    createdAt: 1,
    id: 'global-user',
    role: 'user',
  },
];

describe('resolveScopedConversationSnapshot', () => {
  it('keeps Discord voice in the local typed-chat scope while isolating Twitch', () => {
    const keys = {
      local: 'local:persona:hikari',
      twitch: 'twitch:somebody-else:persona:hikari',
    };

    expect(selectConversationStateKey('local', keys)).toBe(keys.local);
    expect(selectConversationStateKey('discord', keys)).toBe(keys.local);
    expect(selectConversationStateKey('twitch', keys)).toBe(keys.twitch);
  });

  it('uses scoped chat history and relationship memory for the active state key', () => {
    const scopedHistory: ChatMessage[] = [
      {
        content: 'persona scoped history',
        createdAt: 2,
        id: 'scoped-user',
        role: 'user',
      },
    ];
    const scopedMemory = {
      ...createDefaultRelationshipMemory(),
      summary: 'persona scoped memory',
    };

    const snapshot = resolveScopedConversationSnapshot({
      chatHistories: {
        'local:persona:hikari': scopedHistory,
      },
      fallbackChatHistory: fallbackHistory,
      fallbackRelationshipMemory: {
        ...createDefaultRelationshipMemory(),
        summary: 'global memory',
      },
      relationshipMemories: {
        'local:persona:hikari': scopedMemory,
      },
      stateKey: 'local:persona:hikari',
    });

    expect(snapshot.chatHistory).toBe(scopedHistory);
    expect(snapshot.relationshipMemory).toBe(scopedMemory);
  });

  it('falls back to legacy global chat history and memory when scoped data is absent', () => {
    const fallbackMemory = {
      ...createDefaultRelationshipMemory(),
      summary: 'global memory',
    };

    const snapshot = resolveScopedConversationSnapshot({
      allowLegacyFallback: true,
      chatHistories: {},
      fallbackChatHistory: fallbackHistory,
      fallbackRelationshipMemory: fallbackMemory,
      relationshipMemories: {},
      stateKey: 'local:persona:hikari',
    });

    expect(snapshot.chatHistory).toBe(fallbackHistory);
    expect(snapshot.relationshipMemory).toBe(fallbackMemory);
  });

  it('does not leak fallback history or memory into a new source scope', () => {
    const snapshot = resolveScopedConversationSnapshot({
      chatHistories: {},
      fallbackChatHistory: fallbackHistory,
      fallbackRelationshipMemory: {
        ...createDefaultRelationshipMemory(),
        summary: 'local-only memory',
      },
      relationshipMemories: {},
      stateKey: 'twitch:somebody-else:persona:hikari',
    });

    expect(snapshot.chatHistory).toEqual([]);
    expect(snapshot.relationshipMemory.summary).toBe('');
  });
});
