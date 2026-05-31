import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AI_GATEWAY_MODEL,
  DEFAULT_OPENROUTER_MODEL,
  createDefaultAiSettings,
} from './defaults';
import {
  applyLlmProviderSwitchDefaults,
  filterSafeProviderModels,
  getProviderFallbackModels,
  isPremiumCostModelId,
  normalizeLlmProviderCompatibility,
} from './provider-defaults';

describe('LLM provider defaults', () => {
  it('switches OpenAI settings to the OpenRouter-compatible defaults', () => {
    const current = {
      ...createDefaultAiSettings(),
      maxTokens: 740,
      temperature: 1.05,
    };

    const next = applyLlmProviderSwitchDefaults(current, 'openrouter-responses');

    expect(next).toMatchObject({
      aiTransportMode: 'http-stream',
      llmProvider: 'openrouter-responses',
      maxTokens: 740,
      memoryAgentModel: DEFAULT_OPENROUTER_MODEL,
      model: DEFAULT_OPENROUTER_MODEL,
      openAiStateMode: 'stateless',
      temperature: 1.05,
    });
  });

  it('normalizes legacy direct-provider settings back to Vercel AI Gateway defaults', () => {
    const current = {
      ...createDefaultAiSettings(),
      aiTransportMode: 'http-stream' as const,
      llmProvider: 'openrouter-responses' as const,
      memoryAgentModel: 'anthropic/claude-3.5-haiku',
      model: 'anthropic/claude-3.5-haiku',
      openAiStateMode: 'stateless' as const,
    };

    const next = applyLlmProviderSwitchDefaults(current, 'openai-responses');

    expect(next).toMatchObject({
      aiTransportMode: 'http-stream',
      llmProvider: 'vercel-gateway',
      memoryAgentModel: DEFAULT_AI_GATEWAY_MODEL,
      model: DEFAULT_AI_GATEWAY_MODEL,
      openAiStateMode: 'stateless',
    });
  });

  it('switches to Vercel AI Gateway HTTP app-owned defaults', () => {
    const next = applyLlmProviderSwitchDefaults(createDefaultAiSettings(), 'vercel-gateway');

    expect(next).toMatchObject({
      aiTransportMode: 'http-stream',
      llmProvider: 'vercel-gateway',
      memoryAgentModel: DEFAULT_AI_GATEWAY_MODEL,
      model: DEFAULT_AI_GATEWAY_MODEL,
      openAiStateMode: 'stateless',
    });
  });

  it('normalizes legacy DeepSeek direct to Vercel AI Gateway defaults', () => {
    const next = applyLlmProviderSwitchDefaults(createDefaultAiSettings(), 'deepseek');

    expect(next).toMatchObject({
      aiTransportMode: 'http-stream',
      llmProvider: 'vercel-gateway',
      memoryAgentModel: DEFAULT_AI_GATEWAY_MODEL,
      model: DEFAULT_AI_GATEWAY_MODEL,
      openAiStateMode: 'stateless',
    });
  });

  it('repairs legacy OpenAI model ids saved under OpenRouter', () => {
    const next = normalizeLlmProviderCompatibility({
      ...createDefaultAiSettings(),
      aiTransportMode: 'server-default',
      llmProvider: 'openrouter-responses',
      memoryAgentModel: 'gpt-5.4-mini',
      model: 'gpt-5.4-nano',
      openAiStateMode: 'conversation',
    } as any);

    expect(next).toMatchObject({
      aiTransportMode: 'http-stream',
      memoryAgentModel: DEFAULT_OPENROUTER_MODEL,
      model: DEFAULT_OPENROUTER_MODEL,
      openAiStateMode: 'stateless',
    });
  });

  it('preserves explicit OpenRouter model ids', () => {
    const next = normalizeLlmProviderCompatibility({
      ...createDefaultAiSettings(),
      aiTransportMode: 'server-default',
      llmProvider: 'openrouter-responses',
      memoryAgentModel: 'anthropic/claude-3.5-haiku',
      model: 'anthropic/claude-3.5-haiku',
      openAiStateMode: 'conversation',
    } as any);

    expect(next).toMatchObject({
      aiTransportMode: 'http-stream',
      memoryAgentModel: 'anthropic/claude-3.5-haiku',
      model: 'anthropic/claude-3.5-haiku',
      openAiStateMode: 'stateless',
    });
  });

  it('exposes fallback model ids for provider model pickers', () => {
    expect(getProviderFallbackModels('openrouter-responses')).toEqual([DEFAULT_OPENROUTER_MODEL]);
    expect(getProviderFallbackModels('openai-responses')).toEqual([DEFAULT_AI_GATEWAY_MODEL]);
    expect(getProviderFallbackModels('vercel-gateway')).toEqual([DEFAULT_AI_GATEWAY_MODEL]);
    expect(getProviderFallbackModels('deepseek')).toEqual([DEFAULT_AI_GATEWAY_MODEL]);
  });

  it('blocks known high-cost model ids from persisted settings and model pickers', () => {
    expect(isPremiumCostModelId('o1')).toBe(true);
    expect(isPremiumCostModelId('o1-pro-2025-03-19')).toBe(true);
    expect(isPremiumCostModelId('openai/o1-pro-2025-03-19')).toBe(true);
    expect(isPremiumCostModelId('gpt-5_4-pro-2026-03-05')).toBe(true);
    expect(isPremiumCostModelId('openai/gpt-5_4-pro-2026-03-05')).toBe(true);
    expect(isPremiumCostModelId('google/gemini-2.5-pro')).toBe(false);
    expect(isPremiumCostModelId('anthropic/claude-3-opus')).toBe(false);
    expect(isPremiumCostModelId('gpt-5_5-2026-04-23')).toBe(false);
    expect(isPremiumCostModelId(DEFAULT_AI_GATEWAY_MODEL)).toBe(false);

    const next = normalizeLlmProviderCompatibility({
      ...createDefaultAiSettings(),
      memoryAgentModel: 'o1-pro-2025-03-19',
      model: 'o1-pro-2025-03-19',
    });

    expect(next.model).toBe(DEFAULT_AI_GATEWAY_MODEL);
    expect(next.memoryAgentModel).toBe(DEFAULT_AI_GATEWAY_MODEL);
    expect(
      filterSafeProviderModels([
        'gpt-5.4-nano',
        'o1-pro-2025-03-19',
        'openai/o1-pro-2025-03-19',
        'google/gemini-2.5-pro',
      ]),
    ).toEqual(['gpt-5.4-nano', 'google/gemini-2.5-pro']);
  });
});
