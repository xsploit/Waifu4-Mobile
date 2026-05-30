import type { GatewayId, ReplyFormat } from './BrainTypes';

/**
 * Minimum model metadata the lane decision needs. A model list can never be
 * just `string[]` — it must carry capability (the old bug was detecting
 * supportsStructuredOutputs and then ignoring it).
 */
export type ProviderModelInfo = {
  id: string;
  supportedParameters: string[];
  supportsStructuredOutputs: boolean;
};

const STRUCTURED_PARAM = 'structured_outputs';

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
      id?: unknown;
      supported_parameters?: unknown;
      top_provider?: { supported_parameters?: unknown };
    };
    if (typeof e.id !== 'string') {
      continue;
    }
    const params = new Set<string>([
      ...asStringArray(e.supported_parameters),
      ...asStringArray(e.top_provider?.supported_parameters),
    ]);
    models.push({
      id: e.id,
      supportedParameters: [...params],
      supportsStructuredOutputs: params.has(STRUCTURED_PARAM),
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
