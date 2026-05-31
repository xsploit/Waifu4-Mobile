import type { Request, Response } from 'express';
import { embed } from 'ai';
import { createGateway } from '@ai-sdk/gateway';
import { z } from 'zod';
import { readProviderKeys } from './providerKeys';

const DEFAULT_EMBEDDING_MODEL = 'openai/text-embedding-3-small';
const OPENROUTER_BASE_URL = (process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1').replace(
  /\/+$/,
  '',
);

const embeddingRequestSchema = z.object({
  input: z.string().min(1),
  llmProvider: z.enum(['vercel-gateway', 'openrouter-responses']).optional(),
  model: z.string().optional(),
  provider: z.enum(['vercel-gateway', 'openrouter-responses']).optional(),
});

export function normalizeEmbeddingText(input: string) {
  return input.trim().slice(0, 4000);
}

export function normalizeEmbeddingModel(model: unknown) {
  if (typeof model !== 'string' || !model.trim()) {
    return DEFAULT_EMBEDDING_MODEL;
  }
  const normalized = model.trim().slice(0, 160);
  const leaf = (normalized.split('/').pop() ?? normalized).toLowerCase();
  const isOpenAiChatModel =
    /^gpt[-.]/.test(leaf) ||
    /^o[134][-.]?$/.test(leaf) ||
    /^o[134][-.]/.test(leaf);
  return isOpenAiChatModel ? DEFAULT_EMBEDDING_MODEL : normalized;
}

function normalizeEmbeddingVector(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item))
    : [];
}

async function embedWithGateway({
  apiKey,
  input,
  model,
}: {
  apiKey: string;
  input: string;
  model: string;
}) {
  const gateway = createGateway({ apiKey });
  const result = await embed({
    maxRetries: 0,
    model: gateway.embedding(model),
    value: input,
  });
  return result.embedding;
}

async function embedWithOpenRouter({
  apiKey,
  input,
  model,
}: {
  apiKey: string;
  input: string;
  model: string;
}) {
  const response = await fetch(`${OPENROUTER_BASE_URL}/embeddings`, {
    body: JSON.stringify({ input, model }),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    method: 'POST',
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter embeddings HTTP ${response.status}`);
  }

  const body = (await response.json()) as { data?: Array<{ embedding?: unknown }> };
  const embedding = normalizeEmbeddingVector(body.data?.[0]?.embedding);
  if (embedding.length === 0) {
    throw new Error('OpenRouter embeddings response did not include a vector.');
  }
  return embedding;
}

export async function handleEmbeddings(req: Request, res: Response): Promise<void> {
  const parsed = embeddingRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.message });
    return;
  }

  const input = normalizeEmbeddingText(parsed.data.input);
  if (!input) {
    res.status(400).json({ ok: false, error: 'Missing embedding input' });
    return;
  }

  const provider = parsed.data.provider ?? parsed.data.llmProvider ?? 'vercel-gateway';
  const model = normalizeEmbeddingModel(parsed.data.model);
  const keys = readProviderKeys(req);
  if (!keys.llmKey) {
    res.status(401).json({ ok: false, error: 'Missing LLM provider key' });
    return;
  }

  try {
    const embedding =
      provider === 'openrouter-responses'
        ? await embedWithOpenRouter({ apiKey: keys.llmKey, input, model })
        : await embedWithGateway({ apiKey: keys.llmKey, input, model });

    res.json({ ok: true, embedding, meta: { model, provider, vectorDims: embedding.length } });
  } catch (error) {
    res.status(502).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Embedding request failed.',
    });
  }
}
