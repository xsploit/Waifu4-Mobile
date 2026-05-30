import { describe, expect, it } from 'vitest';
import { parseOpenRouterModels, selectReplyFormat } from './modelCapability';

const SAMPLE = {
  data: [
    {
      id: 'openai/gpt-4o-mini',
      supported_parameters: ['tools', 'response_format', 'structured_outputs'],
      top_provider: { supported_parameters: ['structured_outputs'] },
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
    expect(models[0]).toMatchObject({ id: 'openai/gpt-4o-mini', supportsStructuredOutputs: true });
    expect(models[1].supportsStructuredOutputs).toBe(false);
    expect(models[2]).toEqual({
      id: 'no/params-model',
      supportedParameters: [],
      supportsStructuredOutputs: false,
    });
  });

  it('returns [] for malformed payloads', () => {
    expect(parseOpenRouterModels(null)).toEqual([]);
    expect(parseOpenRouterModels({ data: 'nope' })).toEqual([]);
    expect(parseOpenRouterModels({ data: [42, null, {}] })).toEqual([]);
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
