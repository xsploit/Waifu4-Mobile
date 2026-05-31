import { describe, expect, it } from 'vitest';
import { parseOpenRouterModels, parseVercelGatewayModels, selectReplyFormat } from './modelCapability';

const SAMPLE = {
  data: [
    {
      id: 'openai/gpt-4o-mini',
      architecture: { input_modalities: ['text', 'image'] },
      context_length: 128000,
      name: 'GPT-4o mini',
      supported_parameters: ['tools', 'response_format', 'structured_outputs'],
      top_provider: { max_completion_tokens: 16384, supported_parameters: ['structured_outputs'] },
    },
    {
      id: 'some/legacy-model',
      supported_parameters: ['temperature'],
      top_provider: { supported_parameters: ['temperature'] },
    },
    { id: 'no/params-model' },
  ],
};

describe('parseOpenRouterModels', () => {
  it('derives supportsStructuredOutputs from union of model + top_provider params', () => {
    const models = parseOpenRouterModels(SAMPLE);
    expect(models).toHaveLength(3);
    expect(models[0]).toMatchObject({
      contextWindow: 128000,
      id: 'openai/gpt-4o-mini',
      maxTokens: 16384,
      name: 'GPT-4o mini',
      supportsStructuredOutputs: true,
      tags: ['text', 'image'],
    });
    expect(models[1].supportsStructuredOutputs).toBe(false);
    expect(models[2]).toEqual({
      id: 'no/params-model',
      supportedParameters: [],
      supportsStructuredOutputs: false,
      tags: [],
    });
  });

  it('returns [] for malformed payloads', () => {
    expect(parseOpenRouterModels(null)).toEqual([]);
    expect(parseOpenRouterModels({ data: 'nope' })).toEqual([]);
    expect(parseOpenRouterModels({ data: [42, null, {}] })).toEqual([]);
  });
});

describe('parseVercelGatewayModels', () => {
  it('keeps model ids and Gateway capability metadata from /v1/models', () => {
    const models = parseVercelGatewayModels({
      data: [
        {
          id: 'openai/gpt-5.4',
          name: 'GPT-5.4',
          type: 'language',
          context_window: 400000,
          max_tokens: 128000,
          tags: ['reasoning', 'tool-use'],
        },
        {
          id: 'openai/text-embedding-3-small',
          type: 'embedding',
          tags: [],
        },
      ],
    });

    expect(models[0]).toMatchObject({
      contextWindow: 400000,
      id: 'openai/gpt-5.4',
      maxTokens: 128000,
      name: 'GPT-5.4',
      supportedParameters: [],
      supportsStructuredOutputs: true,
      tags: ['reasoning', 'tool-use'],
      type: 'language',
    });
    expect(models[1]).toMatchObject({
      id: 'openai/text-embedding-3-small',
      supportsStructuredOutputs: false,
      type: 'embedding',
    });
  });

  it('returns [] for malformed payloads', () => {
    expect(parseVercelGatewayModels(null)).toEqual([]);
    expect(parseVercelGatewayModels({ data: 'nope' })).toEqual([]);
    expect(parseVercelGatewayModels({ data: [42, null, {}] })).toEqual([]);
  });
});

describe('selectReplyFormat', () => {
  it('openrouter: structured only when the model supports it', () => {
    expect(
      selectReplyFormat('openrouter-responses', {
        id: 'x',
        supportedParameters: ['structured_outputs'],
        supportsStructuredOutputs: true,
      }),
    ).toBe('structured');
    expect(
      selectReplyFormat('openrouter-responses', {
        id: 'y',
        supportedParameters: [],
        supportsStructuredOutputs: false,
      }),
    ).toBe('text');
  });

  it('openrouter: unknown model falls back to the safe text lane', () => {
    expect(selectReplyFormat('openrouter-responses', null)).toBe('text');
    expect(selectReplyFormat('openrouter-responses')).toBe('text');
  });

  it('vercel-gateway: structured by default regardless of info', () => {
    expect(selectReplyFormat('vercel-gateway')).toBe('structured');
    expect(selectReplyFormat('vercel-gateway', null)).toBe('structured');
  });
});
