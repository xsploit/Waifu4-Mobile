import type { Request, Response } from 'express';
import { z } from 'zod';
import { formatSseEvent } from '../../src/shared/sse';
import { streamChat } from './llmGateway';
import { readProviderKeys } from './providerKeys';

const chatRequestSchema = z.object({
  provider: z.enum(['vercel-gateway', 'openrouter-responses']),
  model: z.string().min(1),
  messages: z
    .array(
      z.object({
        role: z.enum(['system', 'user', 'assistant']),
        content: z.string(),
      }),
    )
    .min(1),
  replyFormat: z.enum(['structured', 'text']).default('text'),
  reasoningEffort: z.enum(['minimal', 'low', 'medium', 'high']).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
});

/** POST /ai/chat — SSE stream. Events: `delta` (visible text), `done`, `error`. */
export async function handleChat(req: Request, res: Response): Promise<void> {
  const parsed = chatRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.message });
    return;
  }

  const keys = readProviderKeys(req);
  if (!keys.llmKey) {
    res.status(401).json({ ok: false, error: 'Missing LLM provider key' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });

  const send = (event: string, data: unknown) => res.write(formatSseEvent(event, data));
  const controller = new AbortController();
  // Cancel on real client disconnect. Must be res 'close', NOT req 'close' —
  // req 'close' fires as soon as the request body is read (immediately for a
  // small POST), which would abort the stream before the model replies.
  res.on('close', () => controller.abort());

  try {
    const result = await streamChat(
      {
        ...parsed.data,
        apiKey: keys.llmKey,
        byokOpenAiKey: keys.byokOpenAiKey,
        signal: controller.signal,
      },
      (text) => send('delta', { text }),
    );
    send('done', { ok: true, text: result.visibleText, meta: result.metadata });
  } catch (err) {
    send('error', { ok: false, error: err instanceof Error ? err.message : String(err) });
  } finally {
    res.end();
  }
}
