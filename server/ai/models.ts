import type { Request, Response } from 'express';
import {
  parseOpenRouterModels,
  parseVercelGatewayModels,
  type ProviderModelInfo,
} from '../../src/brain/modelCapability';
import { readProviderKeys } from './providerKeys';
import { createLogger } from '../../src/shared/logger';

const log = createLogger('models');

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
const VERCEL_GATEWAY_MODELS_URL = 'https://ai-gateway.vercel.sh/v1/models';

function sendModels(res: Response, provider: string, modelMetadata: ProviderModelInfo[], note?: string) {
  res.json({
    ok: true,
    provider,
    models: modelMetadata.map((model) => model.id),
    modelMetadata,
    ...(note ? { note } : {}),
  });
}

/** GET /ai/models?provider=... — returns capability metadata for lane selection. */
export async function handleModels(req: Request, res: Response): Promise<void> {
  const provider = req.query.provider;

  if (provider === 'vercel-gateway') {
    try {
      const upstream = await fetch(VERCEL_GATEWAY_MODELS_URL, {
        signal: AbortSignal.timeout(15000),
      });
      if (!upstream.ok) {
        res.status(502).json({ ok: false, error: `Vercel Gateway /models HTTP ${upstream.status}` });
        return;
      }
      const modelMetadata = parseVercelGatewayModels(await upstream.json());
      log.info('models fetched', {
        provider,
        count: modelMetadata.length,
        structured: modelMetadata.filter((m) => m.supportsStructuredOutputs).length,
      });
      sendModels(
        res,
        provider,
        modelMetadata,
        'gateway structured-output support is policy-derived until per-model metadata is exposed',
      );
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      log.error('models fetch failed', { provider, error });
      res.status(502).json({ ok: false, error });
    }
    return;
  }

  if (provider !== 'openrouter-responses') {
    res.status(400).json({ ok: false, error: 'Unknown or missing provider' });
    return;
  }

  const keys = readProviderKeys(req);
  try {
    const upstream = await fetch(OPENROUTER_MODELS_URL, {
      headers: keys.llmKey ? { Authorization: `Bearer ${keys.llmKey}` } : {},
      signal: AbortSignal.timeout(15000),
    });
    if (!upstream.ok) {
      res.status(502).json({ ok: false, error: `OpenRouter /models HTTP ${upstream.status}` });
      return;
    }
    const modelMetadata = parseOpenRouterModels(await upstream.json());
    log.info('models fetched', {
      provider,
      count: modelMetadata.length,
      structured: modelMetadata.filter((m) => m.supportsStructuredOutputs).length,
    });
    sendModels(res, provider, modelMetadata);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    log.error('models fetch failed', { provider, error });
    res.status(502).json({ ok: false, error });
  }
}
