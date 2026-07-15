import { describe, expect, it } from 'vitest';
import { buildProviderOptions, resolveTemperature, toModelMessages } from './llmGateway';

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
  it('sorts Vercel Gateway providers by time to first token', () => {
    expect(
      buildProviderOptions(
        {
          provider: 'vercel-gateway',
          model: 'anthropic/claude-haiku-4.5',
        },
        false,
        false,
      ),
    ).toEqual({ gateway: { sort: 'ttft' } });
  });

  it('prefers the verified structured-output providers for DeepSeek V4 Flash', () => {
    expect(
      buildProviderOptions(
        {
          provider: 'vercel-gateway',
          model: 'deepseek/deepseek-v4-flash',
        },
        true,
        false,
      ),
    ).toEqual({
      deepseek: { thinking: { type: 'disabled' } },
      gateway: {
        order: ['azure', 'fireworks'],
      },
    });
  });

  it('keeps dynamic TTFT routing for unstructured DeepSeek V4 Flash', () => {
    expect(
      buildProviderOptions(
        {
          provider: 'vercel-gateway',
          model: 'deepseek/deepseek-v4-flash',
        },
        false,
        false,
      ),
    ).toEqual({
      deepseek: { thinking: { type: 'disabled' } },
      gateway: { sort: 'ttft' },
    });
  });

  it('prefers verified strict-tool providers for structured DeepSeek V4 Pro', () => {
    expect(
      buildProviderOptions(
        {
          provider: 'vercel-gateway',
          model: 'deepseek/deepseek-v4-pro',
        },
        true,
        true,
      ),
    ).toEqual({
      deepseek: { thinking: { type: 'disabled' } },
      gateway: { order: ['baseten', 'deepseek', 'fireworks'] },
    });
  });

  it('keeps Vercel TTFT routing when request-scoped BYOK is present', () => {
    expect(
      buildProviderOptions(
        {
          provider: 'vercel-gateway',
          model: 'openai/gpt-5-nano',
          byokOpenAiKey: ' openai-key ',
        },
        false,
        false,
      ),
    ).toEqual({
      gateway: {
        byok: { openai: [{ apiKey: 'openai-key' }] },
        sort: 'ttft',
      },
      openai: { reasoningEffort: 'minimal' },
    });
  });

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
    ).toEqual({
      openrouter: {
        provider: { require_parameters: true },
      },
    });
  });

  it('does not send reasoning options to ordinary OpenRouter models', () => {
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

  it('uses explicit catalog-derived OpenRouter reasoning policy', () => {
    expect(buildProviderOptions({
      provider: 'openrouter-responses',
      model: 'moonshotai/kimi-k2.6',
      openRouterReasoningEffort: 'none',
    }, true)).toEqual({
      openrouter: {
        provider: { require_parameters: true },
        reasoning: { effort: 'none' },
      },
    });
    expect(buildProviderOptions({
      provider: 'openrouter-responses',
      model: 'google/gemini-3.5-flash',
      openRouterReasoningEffort: 'minimal',
    }, true)).toEqual({
      openrouter: {
        provider: { require_parameters: true },
        reasoning: { effort: 'minimal', exclude: true },
      },
    });
  });

  it('disables DeepSeek thinking for every Vercel DeepSeek model and lane', () => {
    expect(
      buildProviderOptions(
        {
          provider: 'vercel-gateway',
          model: 'deepseek/deepseek-v4-flash',
        },
        false,
        false,
      ),
    ).toEqual({
      deepseek: { thinking: { type: 'disabled' } },
      gateway: { sort: 'ttft' },
    });
  });

  it('maps explicit Vercel throughput and cost routing', () => {
    expect(buildProviderOptions({
      provider: 'vercel-gateway',
      model: 'deepseek/deepseek-v4-pro',
      vercelRouting: { mode: 'throughput' },
    }, true)).toMatchObject({ gateway: { sort: 'tps' } });
    expect(buildProviderOptions({
      provider: 'vercel-gateway',
      model: 'deepseek/deepseek-v4-pro',
      vercelRouting: { mode: 'cost' },
    }, true)).toMatchObject({ gateway: { sort: 'cost' } });
  });

  it('maps Vercel pinned providers to order or only based on fallback policy', () => {
    expect(buildProviderOptions({
      provider: 'vercel-gateway',
      model: 'deepseek/deepseek-v4-pro',
      vercelRouting: { mode: 'pinned', providers: ['deepseek', 'baseten'], allowFallbacks: true },
    }, true)).toMatchObject({ gateway: { order: ['deepseek', 'baseten'] } });
    expect(buildProviderOptions({
      provider: 'vercel-gateway',
      model: 'deepseek/deepseek-v4-pro',
      vercelRouting: { mode: 'pinned', providers: ['baseten'], allowFallbacks: false },
    }, true)).toMatchObject({ gateway: { only: ['baseten'] } });
  });
});

describe('LLM gateway generation settings', () => {
  it('omits unsupported temperature for OpenAI reasoning models', () => {
    expect(resolveTemperature({ model: 'openai/gpt-5-nano', temperature: 0.85 })).toBeUndefined();
    expect(resolveTemperature({ model: 'openai/o3-mini', temperature: 0.4 })).toBeUndefined();
  });

  it('keeps temperature for ordinary chat models', () => {
    expect(resolveTemperature({ model: 'deepseek/deepseek-v4-flash', temperature: 0.85 })).toBe(0.85);
  });
});
