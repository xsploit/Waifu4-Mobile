import { describe, expect, it } from 'vitest';
import { getVercelModelEndpointsUrl, parseVercelProviderEndpoints } from './models';

describe('Vercel model endpoint discovery', () => {
  it('keeps active providers, metadata, and one best entry per provider', () => {
    const endpoints = parseVercelProviderEndpoints({
      data: {
        endpoints: [
          { provider_name: 'deepinfra', status: 2 },
          {
            context_length: 128000,
            max_completion_tokens: 8192,
            provider_name: 'deepinfra',
            status: 0,
            supported_parameters: ['tools', 'response_format'],
            supports_implicit_caching: true,
          },
          { provider_name: 'baseten', status: 0, supported_parameters: ['tools'] },
        ],
      },
    });

    expect(endpoints).toEqual([
      expect.objectContaining({ providerName: 'baseten', status: 0 }),
      expect.objectContaining({
        contextLength: 128000,
        maxCompletionTokens: 8192,
        providerName: 'deepinfra',
        status: 0,
        supportedParameters: ['tools', 'response_format'],
        supportsImplicitCaching: true,
      }),
    ]);
  });

  it('encodes each selected model path segment', () => {
    expect(getVercelModelEndpointsUrl('deepseek/deepseek-v4-pro')).toBe(
      'https://ai-gateway.vercel.sh/v1/models/deepseek/deepseek-v4-pro/endpoints',
    );
    expect(() => getVercelModelEndpointsUrl('missing-creator')).toThrow(/creator and model/);
  });
});
