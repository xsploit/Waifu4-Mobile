import type { GatewayId, ReplyFormat } from './BrainTypes';

/**
 * Minimum model metadata the lane decision needs. A model list can never be
 * just `string[]` — it must carry capability (the old bug was detecting
 * supportsStructuredOutputs and then ignoring it).
 */
export type ProviderModelInfo = {
  contextWindow?: number;
  id: string;
  maxTokens?: number;
  name?: string;
  supportedParameters: string[];
  supportsStructuredOutputs: boolean;
  tags?: string[];
  type?: string;
};

const STRUCTURED_PARAM = 'structured_outputs';
const IMAGE_INPUT_TAGS = new Set(['image', 'image-input', 'vision']);

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/**
 * Parse OpenRouter's GET /models payload into capability info. Reads both
 * model.supported_parameters and model.top_provider.supported_parameters,
 * since the routed provider's params are what actually apply.
 */
export function parseOpenRouterModels(payload: unknown): ProviderModelInfo[] {
  const data =
    payload && typeof payload === 'object' && Array.isArray((payload as { data?: unknown }).data)
      ? ((payload as { data: unknown[] }).data)
      : [];

  const models: ProviderModelInfo[] = [];
  for (const entry of data) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const e = entry as {
      architecture?: {
        input_modalities?: unknown;
        output_modalities?: unknown;
      };
      context_length?: unknown;
      id?: unknown;
      name?: unknown;
      supported_parameters?: unknown;
      top_provider?: { max_completion_tokens?: unknown; supported_parameters?: unknown };
    };
    if (typeof e.id !== 'string') {
      continue;
    }
    const params = new Set<string>([
      ...asStringArray(e.supported_parameters),
      ...asStringArray(e.top_provider?.supported_parameters),
    ]);
    const inputModalities = asStringArray(e.architecture?.input_modalities);
    models.push({
      ...(typeof e.context_length === 'number' ? { contextWindow: e.context_length } : {}),
      id: e.id,
      ...(typeof e.top_provider?.max_completion_tokens === 'number'
        ? { maxTokens: e.top_provider.max_completion_tokens }
        : {}),
      ...(typeof e.name === 'string' ? { name: e.name } : {}),
      supportedParameters: [...params],
      supportsStructuredOutputs: params.has(STRUCTURED_PARAM),
      tags: inputModalities,
    });
  }
  return models;
}

/** Parse Vercel AI Gateway's OpenAI-compatible /v1/models payload. */
export function parseVercelGatewayModels(payload: unknown): ProviderModelInfo[] {
  const data =
    payload && typeof payload === 'object' && Array.isArray((payload as { data?: unknown }).data)
      ? ((payload as { data: unknown[] }).data)
      : [];

  const models: ProviderModelInfo[] = [];
  for (const entry of data) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const e = entry as {
      context_window?: unknown;
      id?: unknown;
      max_tokens?: unknown;
      name?: unknown;
      supported_parameters?: unknown;
      tags?: unknown;
      type?: unknown;
    };
    if (typeof e.id !== 'string') {
      continue;
    }
    const type = typeof e.type === 'string' ? e.type : undefined;
    const supportedParameters = asStringArray(e.supported_parameters);
    models.push({
      ...(typeof e.context_window === 'number' ? { contextWindow: e.context_window } : {}),
      id: e.id,
      ...(typeof e.max_tokens === 'number' ? { maxTokens: e.max_tokens } : {}),
      ...(typeof e.name === 'string' ? { name: e.name } : {}),
      supportedParameters,
      // Gateway documents structured outputs at the API layer, but its basic
      // model list does not expose a per-model flag. Preserve the current
      // Gateway policy for language models until endpoint metadata is richer.
      supportsStructuredOutputs: type === 'language',
      tags: asStringArray(e.tags),
      ...(type ? { type } : {}),
    });
  }
  return models;
}

/**
 * The single, centralized lane decision (do not inline this at call sites).
 * - OpenRouter: structured iff the model/provider advertises structured_outputs,
 *   else Lane B (text + <yw-meta>) which never hard-fails.
 * - Vercel gateway: structured by default until real capability metadata exists.
 */
export function selectReplyFormat(
  provider: GatewayId,
  info?: ProviderModelInfo | null,
): ReplyFormat {
  if (provider === 'openrouter-responses') {
    return info?.supportsStructuredOutputs ? 'structured' : 'text';
  }
  // vercel-gateway — TODO: replace with real gateway capability metadata.
  return 'structured';
}

export function isChatModel(info?: ProviderModelInfo | null) {
  return !info?.type || info.type === 'language';
}

export function supportsImageInput(info?: ProviderModelInfo | null) {
  return (info?.tags ?? []).some((tag) => IMAGE_INPUT_TAGS.has(tag));
}
