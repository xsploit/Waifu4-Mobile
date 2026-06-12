import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderYourWifeyPomlResponse } from '../../../server/ai/PomlRenderer';
import { createDefaultRelationshipMemory, HIKARI_PERSONA } from './defaults';
import { buildChatCompletionMessages } from './prompt';

describe('buildChatCompletionMessages', () => {
  beforeEach(() => {
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
});
