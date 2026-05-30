import type { Request, Response } from 'express';
import { parseOpenRouterModels } from '../../src/brain/modelCapability';
import { readProviderKeys } from './providerKeys';
import { createLogger } from '../../src/shared/logger';

const log = createLogger('models');

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';

/** GET /ai/models?provider=... — returns capability metadata for lane selection. */
export async function handleModels(req: Request, res: Response): Promise<void> {
  const provider = req.query.provider;

  if (provider === 'vercel-gateway') {
    // TODO: real gateway capability metadata. Until then, lane selection
    // defaults vercel-gateway to structured (see selectReplyFormat).
    res.json({ ok: true, provider, models: [], note: 'gateway defaults to structured (no metadata yet)' });
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
    const models = parseOpenRouterModels(await upstream.json());
    log.info('models fetched', {
      provider,
      count: models.length,
      structured: models.filter((m) => m.supportsStructuredOutputs).length,
    });
    res.json({ ok: true, provider, models });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    log.error('models fetch failed', { provider, error });
    res.status(502).json({ ok: false, error });
  }
}
