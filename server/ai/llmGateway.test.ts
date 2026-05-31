import { describe, expect, it } from 'vitest';
import { buildProviderOptions, toModelMessages } from './llmGateway';

describe('LLM gateway message mapping', () => {
  it('passes Twitch stream frames as user image parts', () => {
    expect(
      toModelMessages([
        {
          role: 'user',
          content: 'What is happening on stream?',
          images: [
            {
              detail: 'high',
              imageUrl: 'data:image/jpeg;base64,abc123',
              mediaType: 'image/jpeg',
            },
          ],
        },
      ]),
    ).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What is happening on stream?' },
          {
            type: 'image',
            image: 'data:image/jpeg;base64,abc123',
            mediaType: 'image/jpeg',
          },
        ],
      },
    ]);
  });

  it('keeps non-user messages text-only even if stale image data is present', () => {
    expect(
      toModelMessages([
        {
          role: 'system',
          content: 'Stay in character.',
          images: [{ imageUrl: 'data:image/jpeg;base64,ignored' }],
        },
        {
          role: 'assistant',
          content: 'Sure.',
          images: [{ imageUrl: 'data:image/jpeg;base64,ignored' }],
        },
      ]),
    ).toEqual([
      { role: 'system', content: 'Stay in character.' },
      { role: 'assistant', content: 'Sure.' },
    ]);
  });
});

describe('LLM gateway provider options', () => {
  it('requires OpenRouter providers that support attached tools', () => {
    expect(
      buildProviderOptions(
        {
          provider: 'openrouter-responses',
          model: 'deepseek/deepseek-v4-flash',
        },
        false,
        true,
      ),
    ).toEqual({ openrouter: { provider: { require_parameters: true } } });
  });

  it('does not add OpenRouter require_parameters for plain text without tools', () => {
    expect(
      buildProviderOptions(
        {
          provider: 'openrouter-responses',
          model: 'deepseek/deepseek-v4-flash',
        },
        false,
        false,
      ),
    ).toBeUndefined();
  });
});
