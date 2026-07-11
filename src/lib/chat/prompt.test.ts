import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderYourWifeyPomlResponse } from '../../../server/ai/PomlRenderer';
import { createDefaultRelationshipMemory, HIKARI_PERSONA } from './defaults';
import {
  buildChatCompletionMessages,
  buildChatCompletionMessagesWithReceipt,
} from './prompt';

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
