import { describe, expect, it } from 'vitest';
import {
  isChatModel,
  isEmbeddingModel,
  parseOpenRouterModels,
  parseVercelGatewayModels,
  selectReplyFormat,
  supportsImageInput,
} from './modelCapability';

const SAMPLE = {
  data: [
    {
      id: 'openai/gpt-4o-mini',
      architecture: { input_modalities: ['text', 'IMAGE'], output_modalities: ['text'] },
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
    {
      id: 'openai/text-embedding-3-small',
      architecture: { input_modalities: ['text'] },
      type: 'embedding',
    },
  ],
};

describe('parseOpenRouterModels', () => {
  it('derives supportsStructuredOutputs from union of model + top_provider params', () => {
    const models = parseOpenRouterModels(SAMPLE);
    expect(models).toHaveLength(4);
    expect(models[0]).toMatchObject({
      contextWindow: 128000,
      id: 'openai/gpt-4o-mini',
      inputModalities: ['text', 'image'],
      maxTokens: 16384,
      name: 'GPT-4o mini',
      outputModalities: ['text'],
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
    expect(models[3]).toMatchObject({
      id: 'openai/text-embedding-3-small',
      supportsStructuredOutputs: false,
      type: 'embedding',
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
          description: 'Fast language model',
          context_window: 400000,
          max_tokens: 128000,
          tags: ['Reasoning', 'tool-use', 'implicit-caching'],
          architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] },
          endpoints: [
            {
              supported_parameters: ['tools', 'structured_outputs'],
              supports_implicit_caching: true,
            },
          ],
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
      description: 'Fast language model',
      id: 'openai/gpt-5.4',
      inputModalities: ['text', 'image'],
      maxTokens: 128000,
      name: 'GPT-5.4',
      outputModalities: ['text'],
      supportedParameters: ['tools', 'structured_outputs'],
      supportsImplicitCaching: true,
      supportsStructuredOutputs: true,
      tags: ['reasoning', 'tool-use', 'implicit-caching', 'text', 'image'],
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

  it('vercel-gateway: honors endpoint params when richer metadata is available', () => {
    expect(
      selectReplyFormat('vercel-gateway', {
        id: 'safe',
        supportedParameters: ['structured_outputs'],
        supportsStructuredOutputs: true,
        type: 'language',
      }),
    ).toBe('structured');
    expect(
      selectReplyFormat('vercel-gateway', {
        id: 'plain',
        supportedParameters: ['tools'],
        supportsStructuredOutputs: false,
        type: 'language',
      }),
    ).toBe('text');
  });
});

describe('model capability helpers', () => {
  it('detects chat models from provider type metadata', () => {
    expect(isChatModel({ id: 'x', supportedParameters: [], supportsStructuredOutputs: true })).toBe(
      true,
    );
    expect(
      isChatModel({
        id: 'x',
        supportedParameters: [],
        supportsStructuredOutputs: true,
        type: 'language',
      }),
    ).toBe(true);
    expect(
      isChatModel({
        id: 'x',
        supportedParameters: [],
        supportsStructuredOutputs: false,
        type: 'embedding',
      }),
    ).toBe(false);
  });

  it('detects image input from provider modality tags', () => {
    expect(
      supportsImageInput({
        id: 'x',
        inputModalities: ['text'],
        supportedParameters: [],
        supportsStructuredOutputs: true,
        tags: ['text', 'IMAGE'],
      }),
    ).toBe(true);
    expect(
      supportsImageInput({
        id: 'y',
        supportedParameters: [],
        supportsStructuredOutputs: true,
        tags: ['text'],
      }),
    ).toBe(false);
  });

  it('detects embedding models from provider type, tags, and ids', () => {
    expect(
      isEmbeddingModel({
        id: 'openai/text-embedding-3-small',
        supportedParameters: [],
        supportsStructuredOutputs: false,
        type: 'embedding',
      }),
    ).toBe(true);
    expect(
      isEmbeddingModel({
        id: 'vendor/custom-model',
        supportedParameters: [],
        supportsStructuredOutputs: false,
        tags: ['text-embedding'],
      }),
    ).toBe(true);
    expect(
      isEmbeddingModel({
        id: 'openai/text-embedding-3-large',
        supportedParameters: [],
        supportsStructuredOutputs: false,
      }),
    ).toBe(true);
    expect(
      isEmbeddingModel({
        id: 'openai/gpt-4o-mini',
        supportedParameters: [],
        supportsStructuredOutputs: true,
        type: 'language',
      }),
    ).toBe(false);
  });
});
