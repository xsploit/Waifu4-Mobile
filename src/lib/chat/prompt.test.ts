import { describe, expect, it } from 'vitest';
import { createDefaultRelationshipMemory, HIKARI_PERSONA } from './defaults';
import { buildChatCompletionMessages } from './prompt';

describe('buildChatCompletionMessages', () => {
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
