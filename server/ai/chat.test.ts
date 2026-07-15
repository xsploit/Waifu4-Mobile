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
        activeStateKey: undefined,
        provider: 'vercel-gateway',
        model: 'openai/gpt-5-mini',
        promptCacheMode: 'gateway-auto',
        requestedTransport: 'http-stream',
        stateKey: undefined,
        stateMode: 'stateless',
        toolNames: undefined,
        toolsAvailable: undefined,
        toolsSource: undefined,
        transport: 'http-stream',
      },
      replyMetadata: {
        emotion: 'happy',
        valence: 0.7,
        arousal: 0.4,
        dominance: 0.1,
      },
    });
  });

  it('reports provider cache and token usage when the gateway supplies it', () => {
    expect(
      buildChatDoneEventPayload({
        provider: 'openrouter-responses',
        model: 'anthropic/claude-sonnet-4.5',
        visibleText: 'Cached reply.',
        metadata: null,
        usage: {
          cacheReadTokens: 1_200,
          cacheWriteTokens: 240,
          inputTokens: 1_500,
          outputTokens: 80,
          reasoningTokens: 12,
          totalTokens: 1_580,
        },
      }).meta,
    ).toMatchObject({
      cachedTokens: 1_200,
      cacheWriteTokens: 240,
      inputTokens: 1_500,
      outputTokens: 80,
      reasoningTokens: 12,
      totalTokens: 1_580,
      promptCacheMode: 'provider-implicit',
    });
  });

  it('reports the completed chat transport, scope, and real tool availability', () => {
    expect(
      buildChatDoneEventPayload(
        {
          provider: 'vercel-gateway',
          model: 'deepseek/deepseek-v4-pro',
          visibleText: 'Streaming status.',
          metadata: null,
        },
        {
          stateKey: 'local:persona:hikari-chan',
          toolNames: ['tavily_search'],
          toolsAvailable: true,
          toolsSource: 'tavily',
        },
      ).meta,
    ).toMatchObject({
      activeStateKey: 'local:persona:hikari-chan',
      stateMode: 'stateless',
      toolsAvailable: true,
      toolNames: ['tavily_search'],
      transport: 'http-stream',
    });
  });
});
