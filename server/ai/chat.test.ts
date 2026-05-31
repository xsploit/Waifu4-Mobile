import { describe, expect, it } from 'vitest';
import { normalizeChatRequest } from './chat';

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
});

