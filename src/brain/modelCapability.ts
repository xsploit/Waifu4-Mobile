import type { GatewayId, ReplyFormat } from './BrainTypes';

/**
 * Minimum model metadata the lane decision needs. A model list can never be
 * just `string[]` — it must carry capability (the old bug was detecting
 * supportsStructuredOutputs and then ignoring it).
 */
export type ProviderModelInfo = {
  contextWindow?: number;
  description?: string;
  id: string;
  inputModalities?: string[];
  maxTokens?: number;
  name?: string;
  outputModalities?: string[];
  supportedParameters: string[];
  supportsImplicitCaching?: boolean;
  supportsStructuredOutputs: boolean;
  tags?: string[];
  type?: string;
};

export type ProviderEndpointInfo = {
  contextLength?: number;
  latencyP50Ms?: number;
  latencyP95Ms?: number;
  maxCompletionTokens?: number;
  providerName: string;
  status?: number;
  supportedParameters: string[];
  supportsImplicitCaching: boolean;
  tags?: string[];
  throughputP50?: number;
  uptimeLastDay?: number;
  uptimeLastHour?: number;
};

const STRUCTURED_PARAM = 'structured_outputs';
const STRUCTURED_ENDPOINT_PARAMS = new Set([
  STRUCTURED_PARAM,
  'json_schema',
  'response_format',
]);
const EMBEDDING_TAGS = new Set(['embed', 'embedding', 'embeddings', 'text-embedding']);
const IMAGE_INPUT_TAGS = new Set(['image', 'image-input', 'vision']);
const IMPLICIT_CACHE_TAGS = new Set(['cache', 'caching', 'implicit-caching', 'prompt-caching']);

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function normalizeTags(values: string[]) {
  return [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))];
}

function asNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function endpointSupportsStructuredOutputs(endpoint: ProviderEndpointInfo): boolean {
  return endpoint.supportedParameters.some((parameter) =>
    STRUCTURED_ENDPOINT_PARAMS.has(parameter.trim().toLowerCase()),
  );
}

export function selectVercelEndpointReplyFormat({
  allowFallbacks,
  endpoints,
  pinnedProviders,
}: {
  allowFallbacks: boolean;
  endpoints: readonly ProviderEndpointInfo[];
  pinnedProviders: readonly string[];
}): ReplyFormat {
  const activeEndpoints = endpoints.filter(
    (endpoint) => endpoint.status === undefined || endpoint.status === 0,
  );
  if (activeEndpoints.length === 0) {
    return 'text';
  }

  const normalizedPinned = [...new Set(pinnedProviders.map((provider) => provider.trim()).filter(Boolean))];
  const pinnedEndpoints = normalizedPinned
    .map((provider) => activeEndpoints.find((endpoint) => endpoint.providerName === provider))
    .filter((endpoint): endpoint is ProviderEndpointInfo => Boolean(endpoint));
  if (normalizedPinned.length > 0 && pinnedEndpoints.length !== normalizedPinned.length) {
    return 'text';
  }

  const eligibleEndpoints = normalizedPinned.length > 0 && !allowFallbacks
    ? pinnedEndpoints
    : activeEndpoints;
  return eligibleEndpoints.length > 0 && eligibleEndpoints.every(endpointSupportsStructuredOutputs)
    ? 'structured'
    : 'text';
}

function collectEndpointSupportedParameters(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((endpoint) =>
    endpoint && typeof endpoint === 'object'
      ? asStringArray((endpoint as { supported_parameters?: unknown }).supported_parameters)
      : [],
  );
}

function hasImplicitCachingEndpoint(value: unknown) {
  return (
    Array.isArray(value) &&
    value.some(
      (endpoint) =>
        endpoint &&
        typeof endpoint === 'object' &&
        (endpoint as { supports_implicit_caching?: unknown }).supports_implicit_caching === true,
    )
  );
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
      type?: unknown;
    };
    if (typeof e.id !== 'string') {
      continue;
    }
    const params = new Set<string>([
      ...asStringArray(e.supported_parameters),
      ...asStringArray(e.top_provider?.supported_parameters),
    ]);
    const inputModalities = asStringArray(e.architecture?.input_modalities);
    const outputModalities = asStringArray(e.architecture?.output_modalities);
    models.push({
      ...(asNumber(e.context_length) !== undefined ? { contextWindow: asNumber(e.context_length) } : {}),
      id: e.id,
      ...(asNumber(e.top_provider?.max_completion_tokens) !== undefined
        ? { maxTokens: asNumber(e.top_provider?.max_completion_tokens) }
        : {}),
      ...(typeof e.name === 'string' ? { name: e.name } : {}),
      ...(inputModalities.length > 0 ? { inputModalities: normalizeTags(inputModalities) } : {}),
      ...(outputModalities.length > 0 ? { outputModalities: normalizeTags(outputModalities) } : {}),
      supportedParameters: [...params],
      supportsStructuredOutputs: params.has(STRUCTURED_PARAM),
      tags: normalizeTags(inputModalities),
      ...(typeof e.type === 'string' ? { type: e.type } : {}),
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
      architecture?: {
        input_modalities?: unknown;
        output_modalities?: unknown;
      };
      context_window?: unknown;
      description?: unknown;
      endpoints?: unknown;
      id?: unknown;
      max_tokens?: unknown;
      modelType?: unknown;
      model_type?: unknown;
      name?: unknown;
      supported_parameters?: unknown;
      tags?: unknown;
      type?: unknown;
    };
    if (typeof e.id !== 'string') {
      continue;
    }
    const type =
      typeof e.type === 'string'
        ? e.type
        : typeof e.modelType === 'string'
          ? e.modelType
          : typeof e.model_type === 'string'
            ? e.model_type
            : undefined;
    const supportedParameters = [
      ...new Set([
        ...asStringArray(e.supported_parameters),
        ...collectEndpointSupportedParameters(e.endpoints),
      ]),
    ];
    const inputModalities = normalizeTags(asStringArray(e.architecture?.input_modalities));
    const outputModalities = normalizeTags(asStringArray(e.architecture?.output_modalities));
    const tags = normalizeTags([...asStringArray(e.tags), ...inputModalities]);
    models.push({
      ...(asNumber(e.context_window) !== undefined ? { contextWindow: asNumber(e.context_window) } : {}),
      ...(typeof e.description === 'string' ? { description: e.description } : {}),
      id: e.id,
      ...(inputModalities.length > 0 ? { inputModalities } : {}),
      ...(asNumber(e.max_tokens) !== undefined ? { maxTokens: asNumber(e.max_tokens) } : {}),
      ...(typeof e.name === 'string' ? { name: e.name } : {}),
      ...(outputModalities.length > 0 ? { outputModalities } : {}),
      supportedParameters,
      supportsImplicitCaching:
        tags.some((tag) => IMPLICIT_CACHE_TAGS.has(tag)) || hasImplicitCachingEndpoint(e.endpoints),
      supportsStructuredOutputs:
        type === 'language' && supportedParameters.some((parameter) =>
          STRUCTURED_ENDPOINT_PARAMS.has(parameter.trim().toLowerCase()),
        ),
      tags,
      ...(type ? { type } : {}),
    });
  }
  return models;
}

/**
 * The single, centralized lane decision (do not inline this at call sites).
 * - OpenRouter: structured iff the model/provider advertises structured_outputs,
 *   else Lane B (text + <yw-meta>) which never hard-fails.
 * - Vercel gateway: structured only when capability metadata proves support.
 */
export function selectReplyFormat(
  provider: GatewayId,
  info?: ProviderModelInfo | null,
): ReplyFormat {
  if (provider === 'openrouter-responses') {
    return info?.supportsStructuredOutputs ? 'structured' : 'text';
  }
  if (info && info.supportedParameters.length > 0) {
    return info.supportsStructuredOutputs ? 'structured' : 'text';
  }
  return info?.supportsStructuredOutputs ? 'structured' : 'text';
}

export function isChatModel(info?: ProviderModelInfo | null) {
  if (!info) {
    return false;
  }
  if (isEmbeddingModel(info)) {
    return false;
  }
  return !info.type || info.type === 'language';
}

export function isEmbeddingModel(info?: ProviderModelInfo | null) {
  if (!info) {
    return false;
  }
  const type = info.type?.toLowerCase();
  if (type === 'embedding' || type === 'embeddings') {
    return true;
  }
  const tags = normalizeTags(info.tags ?? []);
  if (tags.some((tag) => EMBEDDING_TAGS.has(tag.toLowerCase()))) {
    return true;
  }
  const id = info.id.toLowerCase();
  return id.includes('embedding') || /(^|[/_.-])embed([/_.-]|$)/.test(id);
}

export function supportsImageInput(info?: ProviderModelInfo | null) {
  const tags = normalizeTags([...(info?.tags ?? []), ...(info?.inputModalities ?? [])]);
  return tags.some((tag) => IMAGE_INPUT_TAGS.has(tag));
}
