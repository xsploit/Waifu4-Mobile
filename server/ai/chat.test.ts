import { describe, expect, it } from 'vitest';
import { buildChatDoneEventPayload, normalizeChatRequest } from './chat';

describe('chat request normalization', () => {
  it('preserves copied frontend tool controls for the main assistant tool loop', () => {
    expect(
      normalizeChatRequest({
        provider: 'openrouter-responses',
        model: 'deepseek/deepseek-v4-flash',
        messages: [{ role: 'user', content: 'look this up' }],
        toolChoiceMode: 'required',
        maxToolRounds: 4,
        stream: true,
      }),
    ).toMatchObject({
      provider: 'openrouter-responses',
      model: 'deepseek/deepseek-v4-flash',
      replyFormat: 'text',
      toolChoiceMode: 'required',
      maxToolRounds: 4,
      stream: true,
    });
  });

  it('keeps the responseFormat compatibility fallback for structured replies', () => {
    expect(
      normalizeChatRequest({
        llmProvider: 'vercel-gateway',
        model: 'openai/gpt-5-mini',
        messages: [{ role: 'user', content: 'hi' }],
        responseFormat: { type: 'json_schema' },
        stream: false,
      }).replyFormat,
    ).toBe('structured');
  });

  it('keeps provider stream metadata separate from assistant emotion telemetry', () => {
    expect(
      buildChatDoneEventPayload({
        provider: 'vercel-gateway',
        model: 'openai/gpt-5-mini',
        visibleText: 'Hey there.',
        metadata: {
          emotion: 'happy',
          valence: 0.7,
          arousal: 0.4,
          dominance: 0.1,
        },
      }),
    ).toEqual({
      ok: true,
      text: 'Hey there.',
      meta: {
        provider: 'vercel-gateway',
        model: 'openai/gpt-5-mini',
      },
      replyMetadata: {
        emotion: 'happy',
        valence: 0.7,
        arousal: 0.4,
        dominance: 0.1,
      },
    });
  });
});
