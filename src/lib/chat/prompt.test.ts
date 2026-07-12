import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderYourWifeyPomlResponse } from '../../../server/ai/PomlRenderer';
import { createDefaultRelationshipMemory, HIKARI_PERSONA } from './defaults';
import {
  buildChatCompletionMessages,
  buildChatCompletionMessagesWithReceipt,
  updateChatMessageContent,
} from './prompt';

describe('updateChatMessageContent', () => {
  const history = [
    { content: 'hello', createdAt: 1, id: 'user-1', role: 'user' as const },
    { content: 'partial', createdAt: 2, id: 'assistant-1', role: 'assistant' as const },
  ];

  it('copies only the changed message and preserves the other entries', () => {
    const updated = updateChatMessageContent(history, 'assistant-1', 'complete');

    expect(updated).not.toBe(history);
    expect(updated[0]).toBe(history[0]);
    expect(updated[1]).toEqual({ ...history[1], content: 'complete' });
  });

  it('preserves the array identity for missing messages and unchanged content', () => {
    expect(updateChatMessageContent(history, 'missing', 'complete')).toBe(history);
    expect(updateChatMessageContent(history, 'assistant-1', 'partial')).toBe(history);
  });
});

describe('buildChatCompletionMessages', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-11T18:00:00.000Z'));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
        const result = await renderYourWifeyPomlResponse(body.variables);
        return new Response(JSON.stringify(result), {
          headers: {
            'Content-Type': 'application/json',
          },
          status: result.ok ? 200 : 500,
        });
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('injects runtime situation into the prompt context', async () => {
    const messages = await buildChatCompletionMessages({
      history: [],
      persona: HIKARI_PERSONA,
      relationshipMemory: createDefaultRelationshipMemory(),
      turnContext: {
        conversationScope: 'twitch-chat',
        runtimeSituation:
          'You are reading another Twitch channel, but nobody there can see or hear you.',
        source: 'twitch',
        turnKind: 'direct',
      },
    });

    const promptText = messages.map((message) => message.content).join('\n');

    expect(promptText).toContain(
      'You are reading another Twitch channel, but nobody there can see or hear you.',
    );
    expect(promptText).toContain('runtime_situation');
  });

  it('keeps a trusted Discord controller distinct from the local controller', async () => {
    const messages = await buildChatCompletionMessages({
      history: [],
      persona: HIKARI_PERSONA,
      relationshipMemory: createDefaultRelationshipMemory(),
      turnContext: {
        displayName: 'Subsect Server Nickname',
        guildId: 'guild-42',
        isLocal: false,
        isTrustedController: true,
        source: 'discord',
        turnKind: 'direct',
        userId: 'user-99',
        voiceChannelId: 'voice-7',
      },
    });

    const promptText = messages.map((message) => message.content).join('\n');

    expect(promptText).toContain('Discord trusted controller');
    expect(promptText).toContain('Discord guild voice chat');
    expect(promptText).toContain('guild-42');
    expect(promptText).toContain('voice-7');
    expect(promptText).toContain('Discord mode is active');
  });

  it('returns byte-identical messages from the receipt-aware builder', async () => {
    const options = {
      history: [],
      persona: HIKARI_PERSONA,
      relationshipMemory: createDefaultRelationshipMemory(),
      semanticMemoryContext: 'Subsect prefers exact provenance checks.',
      turnContext: {
        conversationScope: 'local-chat',
        source: 'local',
        stateKey: 'local:persona:hikari-chan',
      },
    };
    const legacyMessages = await buildChatCompletionMessages(options);
    const result = await buildChatCompletionMessagesWithReceipt(options);

    expect(result.messages).toEqual(legacyMessages);
    expect(result.grilloReceipt.stage).toBe('client_context_reducer');
    const renderedSystem = normalizeWhitespace(result.messages[0]?.content ?? '');
    const renderedGrillo = normalizeWhitespace(result.grilloContext);
    expect(renderedSystem).toContain(renderedGrillo);
    expect(renderedSystem.split(renderedGrillo)).toHaveLength(2);
  });
});

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}
