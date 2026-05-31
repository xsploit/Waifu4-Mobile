import { Output, generateText, streamText, type ModelMessage } from 'ai';
import { createGateway } from '@ai-sdk/gateway';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import {
  assistantReplySchema,
  type GatewayId,
  type LlmMessage,
  type ReasoningEffort,
  type ReplyFormat,
  type ReplyMetadata,
} from '../../src/brain/BrainTypes';
import {
  createLaneBParser,
  extractStructuredReply,
  monotonicDelta,
} from '../../src/brain/replyParser';
import { createLogger } from '../../src/shared/logger';

const log = createLogger('llm');

export type StreamChatRequest = {
  provider: GatewayId;
  model: string;
  messages: LlmMessage[];
  replyFormat: ReplyFormat;
  temperature?: number;
  maxTokens?: number;
  reasoningEffort?: ReasoningEffort;
  apiKey: string;
  byokOpenAiKey?: string;
  signal?: AbortSignal;
};

export type CompleteChatRequest = {
  provider: GatewayId;
  model: string;
  messages: LlmMessage[];
  temperature?: number;
  maxTokens?: number;
  reasoningEffort?: ReasoningEffort;
  apiKey: string;
  byokOpenAiKey?: string;
  signal?: AbortSignal;
  jsonMode?: boolean;
};

export type CompleteChatResult = {
  text: string;
  provider: GatewayId;
  model: string;
};

const jsonTextOutput = {
  name: 'json-text',
  responseFormat: Promise.resolve({ type: 'json' as const }),
  async parseCompleteOutput({ text }: { text: string }) {
    return text;
  },
  async parsePartialOutput({ text }: { text: string }) {
    return { partial: text };
  },
  createElementStreamTransform() {
    return undefined;
  },
};

/** OpenAI reasoning models (gpt-5 family, o-series) accept reasoningEffort. */
function isReasoningModel(model: string): boolean {
  const leaf = model.toLowerCase();
  return leaf.includes('gpt-5') || /(^|\/)o[134](-|$|\b)/.test(leaf);
}

export type StreamChatResult = {
  visibleText: string;
  metadata: ReplyMetadata | null;
  provider: GatewayId;
  model: string;
};

function buildProviderOptions(
  req: Pick<StreamChatRequest, 'provider' | 'model' | 'reasoningEffort' | 'byokOpenAiKey'>,
  structured: boolean,
): Record<string, unknown> | undefined {
  const options: Record<string, unknown> = {};

  // Reasoning off/low by default so a reasoning model actually emits visible
  // text instead of spending the turn thinking. (Gateway routes openai-namespaced
  // options to the OpenAI provider.)
  if (req.provider === 'vercel-gateway' && isReasoningModel(req.model)) {
    options.openai = { reasoningEffort: req.reasoningEffort ?? 'minimal' };
  }

  if (req.provider === 'vercel-gateway' && req.byokOpenAiKey?.trim()) {
    options.gateway = { byok: { openai: [{ apiKey: req.byokOpenAiKey.trim() }] } };
  }

  // The crown-jewel lesson: without require_parameters, OpenRouter can silently
  // route to a provider that ignores json_schema and return malformed output.
  if (req.provider === 'openrouter-responses' && structured) {
    options.openrouter = { provider: { require_parameters: true } };
  }

  return Object.keys(options).length > 0 ? options : undefined;
}

function createModel(req: Pick<StreamChatRequest, 'provider' | 'model' | 'apiKey'>) {
  // OpenRouter: just its own key. (Its BYOK is a website-dashboard feature, not
  // a confirmed API parameter, so we don't inject it here.)
  if (req.provider === 'openrouter-responses') {
    return createOpenRouter({ apiKey: req.apiKey })(req.model);
  }
  // Vercel gateway: own key; optional OpenAI BYOK is applied via providerOptions
  // (gateway.byok). If BYOK fails, the gateway falls back to Vercel credits.
  return createGateway({ apiKey: req.apiKey })(req.model);
}

function toModelMessages(messages: LlmMessage[]): ModelMessage[] {
  return messages.map((m) => ({ role: m.role, content: m.content }) as ModelMessage);
}

export async function completeChat(req: CompleteChatRequest): Promise<CompleteChatResult> {
  const model = createModel(req);
  const providerOptions = buildProviderOptions(req, req.jsonMode === true);
  const started = Date.now();

  log.info('completion start', {
    provider: req.provider,
    model: req.model,
    lane: req.jsonMode ? 'json' : 'text',
    messages: req.messages.length,
  });

  const result = await generateText({
    abortSignal: req.signal,
    allowSystemInMessages: true,
    model,
    messages: toModelMessages(req.messages),
    temperature: req.temperature,
    maxOutputTokens: req.maxTokens,
    output: req.jsonMode ? jsonTextOutput : undefined,
    providerOptions: providerOptions as never,
  });
  const text =
    req.jsonMode && typeof (result as { output?: unknown }).output === 'string'
      ? (result as { output: string }).output
      : result.text;
  log.info('completion done', {
    provider: req.provider,
    model: req.model,
    lane: req.jsonMode ? 'json' : 'text',
    chars: text.length,
    ms: Date.now() - started,
  });
  return { text, provider: req.provider, model: req.model };
}

/**
 * Stream one assistant reply. `onDelta` receives visible (spoken) text only —
 * never raw structured JSON or `<yw-meta>` content. Resolves with the final
 * visible text + parsed metadata, or throws on failure.
 */
export async function streamChat(
  req: StreamChatRequest,
  onDelta: (text: string) => void,
): Promise<StreamChatResult> {
  const structured = req.replyFormat === 'structured';
  const model = createModel(req);
  const providerOptions = buildProviderOptions(req, structured);
  let streamError: string | null = null;
  let deltaCount = 0;
  const started = Date.now();

  const emit = (text: string) => {
    if (text) {
      deltaCount += 1;
      onDelta(text);
    }
  };

  log.info('chat start', {
    provider: req.provider,
    model: req.model,
    lane: structured ? 'A/structured' : 'B/text',
    messages: req.messages.length,
    reasoning: req.provider === 'vercel-gateway' && isReasoningModel(req.model)
      ? (req.reasoningEffort ?? 'minimal')
      : 'n/a',
  });

  const result = streamText({
    abortSignal: req.signal,
    allowSystemInMessages: true,
    model,
    messages: toModelMessages(req.messages),
    temperature: req.temperature,
    maxOutputTokens: req.maxTokens,
    output: structured ? Output.object({ schema: assistantReplySchema }) : undefined,
    providerOptions: providerOptions as never,
    onError: ({ error }) => {
      streamError = error instanceof Error ? error.message : String(error);
      log.error('stream onError', { provider: req.provider, model: req.model, error: streamError });
    },
  });

  if (structured) {
    let lastMessage = '';
    for await (const partial of result.partialOutputStream) {
      const next =
        partial && typeof partial === 'object' && typeof (partial as { message?: unknown }).message === 'string'
          ? (partial as { message: string }).message
          : '';
      const delta = monotonicDelta(lastMessage, next);
      if (delta) {
        lastMessage = next;
        emit(delta);
      }
    }
    let output: unknown;
    try {
      output = await result.output;
    } catch (err) {
      throw new Error(streamError ?? (err instanceof Error ? err.message : String(err)));
    }
    const { visibleText, metadata } = extractStructuredReply(output);
    const tail = monotonicDelta(lastMessage, visibleText);
    if (tail) {
      emit(tail);
    }
    if (!visibleText) {
      throw new Error(
        streamError ?? 'Model returned an empty structured reply (try lower reasoning effort or another model).',
      );
    }
    log.info('chat done', {
      lane: 'A/structured',
      deltas: deltaCount,
      chars: visibleText.length,
      ms: Date.now() - started,
      emotion: metadata?.emotion ?? 'none',
    });
    return { visibleText, metadata, provider: req.provider, model: req.model };
  }

  // Lane B: plain text + <yw-meta>, stripped incrementally.
  const parser = createLaneBParser();
  try {
    for await (const chunk of result.textStream) {
      emit(parser.push(chunk));
    }
  } catch (err) {
    throw new Error(streamError ?? (err instanceof Error ? err.message : String(err)));
  }
  const fin = parser.finish();
  emit(fin.flushedDelta);
  if (!fin.visibleText) {
    throw new Error(
      streamError ?? 'Model returned no visible text (try lower reasoning effort or another model).',
    );
  }
  log.info('chat done', {
    lane: 'B/text',
    deltas: deltaCount,
    chars: fin.visibleText.length,
    ms: Date.now() - started,
    emotion: fin.metadata?.emotion ?? 'none',
  });
  return {
    visibleText: fin.visibleText,
    metadata: fin.metadata,
    provider: req.provider,
    model: req.model,
  };
}
