import {
  Output,
  extractJsonMiddleware,
  generateText,
  stepCountIs,
  streamText,
  wrapLanguageModel,
  type ModelMessage,
} from 'ai';
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
import { createTavilyTools } from './tavilyTools';

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
  tavilyKey?: string;
  toolChoiceMode?: 'off' | 'auto' | 'required';
  maxToolRounds?: number;
  openRouterRouting?: {
    mode: 'auto' | 'latency' | 'throughput' | 'pinned';
    providers?: string[];
    allowFallbacks?: boolean;
  };
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
  tavilyKey?: string;
  toolChoiceMode?: 'off' | 'auto' | 'required';
  maxToolRounds?: number;
  openRouterRouting?: StreamChatRequest['openRouterRouting'];
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

export function resolveTemperature(
  req: Pick<StreamChatRequest, 'model' | 'temperature'>,
) {
  return isReasoningModel(req.model) ? undefined : req.temperature;
}

export type StreamChatResult = {
  visibleText: string;
  metadata: ReplyMetadata | null;
  provider: GatewayId;
  model: string;
};

export function buildProviderOptions(
  req: Pick<StreamChatRequest, 'provider' | 'model' | 'reasoningEffort' | 'byokOpenAiKey' | 'openRouterRouting'>,
  structured: boolean,
  hasTools = false,
): Record<string, unknown> | undefined {
  const options: Record<string, unknown> = {};

  if (req.provider === 'vercel-gateway') {
    const gateway: Record<string, unknown> = structured && req.model === 'deepseek/deepseek-v4-flash'
      ? { order: ['azure', 'fireworks'] }
      : { sort: 'ttft' };
    if (req.byokOpenAiKey?.trim()) {
      gateway.byok = { openai: [{ apiKey: req.byokOpenAiKey.trim() }] };
    }
    options.gateway = gateway;
  }

  // Reasoning off/low by default so a reasoning model actually emits visible
  // text instead of spending the turn thinking. (Gateway routes openai-namespaced
  // options to the OpenAI provider.)
  if (req.provider === 'vercel-gateway' && isReasoningModel(req.model)) {
    options.openai = { reasoningEffort: req.reasoningEffort ?? 'minimal' };
  }

  // The crown-jewel lesson: without require_parameters, OpenRouter can silently
  // route to a provider that ignores json_schema and return malformed output.
  if (req.provider === 'openrouter-responses') {
    const provider: Record<string, unknown> = {};
    if (structured || hasTools) {
      provider.require_parameters = true;
    }
    if (req.openRouterRouting?.mode === 'latency') {
      provider.sort = 'latency';
    } else if (req.openRouterRouting?.mode === 'throughput') {
      provider.sort = 'throughput';
    } else if (req.openRouterRouting?.mode === 'pinned' && req.openRouterRouting.providers?.length) {
      provider.only = req.openRouterRouting.providers;
      provider.allow_fallbacks = req.openRouterRouting.allowFallbacks ?? false;
    }
    if (Object.keys(provider).length > 0) {
      options.openrouter = { provider };
    }
  }

  return Object.keys(options).length > 0 ? options : undefined;
}

function createModel(req: Pick<StreamChatRequest, 'provider' | 'model' | 'apiKey'>, structured = false) {
  // OpenRouter: just its own key. (Its BYOK is a website-dashboard feature, not
  // a confirmed API parameter, so we don't inject it here.)
  if (req.provider === 'openrouter-responses') {
    return createOpenRouter({ apiKey: req.apiKey })(req.model);
  }
  // Vercel gateway: own key; optional OpenAI BYOK is applied via providerOptions
  // (gateway.byok). If BYOK fails, the gateway falls back to Vercel credits.
  const model = createGateway({ apiKey: req.apiKey })(req.model);
  return structured
    ? wrapLanguageModel({
        model,
        middleware: extractJsonMiddleware(),
      })
    : model;
}

function createAssistantStructuredOutput() {
  return Output.object({
    description:
      'A WebWaifu assistant reply. The message field is spoken to the user; emotion and VAD drive avatar reactions.',
    name: 'assistant_reply',
    schema: assistantReplySchema,
  });
}

export function toModelMessages(messages: LlmMessage[]): ModelMessage[] {
  return messages.map((m) => {
    if (m.role !== 'user' || !m.images?.length) {
      return { role: m.role, content: m.content } as ModelMessage;
    }
    return {
      role: 'user',
      content: [
        { type: 'text', text: m.content },
        ...m.images.map((image) => ({
          type: 'image' as const,
          image: image.imageUrl,
          mediaType: image.mediaType,
        })),
      ],
    } satisfies ModelMessage;
  });
}

export async function completeChat(req: CompleteChatRequest): Promise<CompleteChatResult> {
  const model = createModel(req, req.jsonMode === true);
  const tools = req.toolChoiceMode === 'off' ? undefined : createTavilyTools(req.tavilyKey);
  const providerOptions = buildProviderOptions(req, req.jsonMode === true, !!tools);
  const started = Date.now();

  log.info('completion start', {
    provider: req.provider,
    model: req.model,
    lane: req.jsonMode ? 'json' : 'text',
    messages: req.messages.length,
    tools: Boolean(tools),
  });

  const result = await generateText({
    abortSignal: req.signal,
    allowSystemInMessages: true,
    model,
    messages: toModelMessages(req.messages),
    temperature: resolveTemperature(req),
    maxOutputTokens: req.maxTokens,
    output: req.jsonMode ? jsonTextOutput : undefined,
    tools,
    toolChoice: tools && req.toolChoiceMode === 'required' ? 'required' : undefined,
    stopWhen: tools ? stepCountIs(req.maxToolRounds ?? 10) : undefined,
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
  const model = createModel(req, structured);
  const tools = req.toolChoiceMode === 'off' ? undefined : createTavilyTools(req.tavilyKey);
  const providerOptions = buildProviderOptions(req, structured, !!tools);
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
    tools: Boolean(tools),
    reasoning: req.provider === 'vercel-gateway' && isReasoningModel(req.model)
      ? (req.reasoningEffort ?? 'minimal')
      : 'n/a',
  });

  const result = streamText({
    abortSignal: req.signal,
    allowSystemInMessages: true,
    model,
    messages: toModelMessages(req.messages),
    temperature: resolveTemperature(req),
    maxOutputTokens: req.maxTokens,
    output: structured ? createAssistantStructuredOutput() : undefined,
    tools,
    toolChoice: tools && req.toolChoiceMode === 'required' ? 'required' : undefined,
    stopWhen: tools ? stepCountIs(req.maxToolRounds ?? 10) : undefined,
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
