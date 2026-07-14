import type { Request, Response } from 'express';
import {
  parseOpenRouterModels,
  parseVercelGatewayModels,
  type ProviderEndpointInfo,
  type ProviderModelInfo,
} from '../../src/brain/modelCapability';
import { readProviderKeys } from './providerKeys';
import { createLogger } from '../../src/shared/logger';

const log = createLogger('models');

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
const VERCEL_GATEWAY_MODELS_URL = 'https://ai-gateway.vercel.sh/v1/models';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

export function parseVercelProviderEndpoints(payload: unknown): ProviderEndpointInfo[] {
  const root = asRecord(payload);
  const data = asRecord(root?.data);
  const entries = Array.isArray(data?.endpoints)
    ? data.endpoints
    : Array.isArray(root?.endpoints)
      ? root.endpoints
      : [];
  const byProvider = new Map<string, ProviderEndpointInfo>();

  for (const value of entries) {
    const entry = asRecord(value);
    const providerName = typeof entry?.provider_name === 'string'
      ? entry.provider_name.trim()
      : typeof entry?.provider === 'string'
        ? entry.provider.trim()
        : '';
    if (!providerName) {
      continue;
    }
    const latency = asRecord(entry?.latency_last_1h);
    const throughput = asRecord(entry?.throughput_last_1h);
    const next: ProviderEndpointInfo = {
      contextLength: asFiniteNumber(entry?.context_length),
      latencyP50Ms: asFiniteNumber(latency?.p50),
      latencyP95Ms: asFiniteNumber(latency?.p95),
      maxCompletionTokens: asFiniteNumber(entry?.max_completion_tokens),
      providerName,
      status: asFiniteNumber(entry?.status),
      supportedParameters: asStringArray(entry?.supported_parameters),
      supportsImplicitCaching: entry?.supports_implicit_caching === true,
      tags: asStringArray(entry?.tags),
      throughputP50: asFiniteNumber(throughput?.p50),
      uptimeLastDay: asFiniteNumber(entry?.uptime_last_1d),
      uptimeLastHour: asFiniteNumber(entry?.uptime_last_1h),
    };
    const current = byProvider.get(providerName);
    if (!current || (current.status !== 0 && next.status === 0)) {
      byProvider.set(providerName, next);
    }
  }

  return Array.from(byProvider.values()).sort((a, b) => {
    const activeDifference = Number(a.status !== 0) - Number(b.status !== 0);
    return activeDifference || a.providerName.localeCompare(b.providerName);
  });
}

export function getVercelModelEndpointsUrl(model: string): string {
  const segments = model.trim().split('/').filter(Boolean);
  if (segments.length < 2) {
    throw new Error('Vercel model ID must include creator and model');
  }
  return `${VERCEL_GATEWAY_MODELS_URL}/${segments.map(encodeURIComponent).join('/')}/endpoints`;
}

function sendModels(res: Response, provider: string, modelMetadata: ProviderModelInfo[], note?: string) {
  res.json({
    ok: true,
    provider,
    models: modelMetadata.map((model) => model.id),
    modelMetadata,
    ...(note ? { note } : {}),
  });
}

async function fetchModelMetadata(
  provider: string,
  errorLabel: string,
  url: string,
  parser: (value: unknown) => ProviderModelInfo[],
  init?: RequestInit,
) {
  const upstream = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(15000),
  });
  if (!upstream.ok) {
    throw new Error(`${errorLabel} /models HTTP ${upstream.status}`);
  }
  const modelMetadata = parser(await upstream.json());
  log.info('models fetched', {
    provider,
    count: modelMetadata.length,
    structured: modelMetadata.filter((m) => m.supportsStructuredOutputs).length,
  });
  return modelMetadata;
}

function sendModelsError(res: Response, provider: string, err: unknown) {
  const error = err instanceof Error ? err.message : String(err);
  log.error('models fetch failed', { provider, error });
  res.status(502).json({ ok: false, error });
}

/** GET /ai/models?provider=... — returns capability metadata for lane selection. */
export async function handleModels(req: Request, res: Response): Promise<void> {
  const provider = req.query.provider;

  if (provider === 'vercel-gateway') {
    try {
      const modelMetadata = await fetchModelMetadata(
        provider,
        'Vercel Gateway',
        VERCEL_GATEWAY_MODELS_URL,
        parseVercelGatewayModels,
      );
      sendModels(
        res,
        provider,
        modelMetadata,
        'provider endpoints are discovered separately for the selected model',
      );
    } catch (err) {
      sendModelsError(res, provider, err);
    }
    return;
  }

  if (provider !== 'openrouter-responses') {
    res.status(400).json({ ok: false, error: 'Unknown or missing provider' });
    return;
  }

  const keys = readProviderKeys(req);
  try {
    const modelMetadata = await fetchModelMetadata(
      provider,
      'OpenRouter',
      OPENROUTER_MODELS_URL,
      parseOpenRouterModels,
      {
        headers: keys.llmKey ? { Authorization: `Bearer ${keys.llmKey}` } : {},
      },
    );
    sendModels(res, provider, modelMetadata);
  } catch (err) {
    sendModelsError(res, provider, err);
  }
}

/** GET /ai/model-endpoints?provider=vercel-gateway&model=creator/model */
export async function handleModelEndpoints(req: Request, res: Response): Promise<void> {
  const provider = req.query.provider;
  const model = typeof req.query.model === 'string' ? req.query.model.trim() : '';
  if (provider !== 'vercel-gateway') {
    res.status(400).json({ ok: false, error: 'Model endpoint discovery requires Vercel Gateway' });
    return;
  }
  if (!model) {
    res.status(400).json({ ok: false, error: 'Missing model' });
    return;
  }

  try {
    const upstream = await fetch(getVercelModelEndpointsUrl(model), {
      signal: AbortSignal.timeout(15000),
    });
    if (!upstream.ok) {
      throw new Error(`Vercel Gateway model endpoints HTTP ${upstream.status}`);
    }
    const endpoints = parseVercelProviderEndpoints(await upstream.json());
    res.json({
      ok: true,
      provider,
      model,
      endpoints,
      providerSlugs: endpoints
        .filter((endpoint) => endpoint.status === undefined || endpoint.status === 0)
        .map((endpoint) => endpoint.providerName),
    });
  } catch (err) {
    sendModelsError(res, provider, err);
  }
}
