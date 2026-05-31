import type { Request, Response } from 'express';
import { z } from 'zod';
import { formatSseEvent } from '../../src/shared/sse';
import { completeChat, streamChat } from './llmGateway';
import { readProviderKeys } from './providerKeys';

const providerSchema = z.enum(['vercel-gateway', 'openrouter-responses']);
const replyFormatSchema = z.enum(['structured', 'text']);

const chatRequestInputSchema = z.object({
  provider: providerSchema.optional(),
  llmProvider: providerSchema.optional(),
  model: z.string().min(1),
  messages: z
    .array(
      z.object({
        role: z.enum(['system', 'user', 'assistant']),
        content: z.string(),
      }),
    )
    .min(1),
  replyFormat: replyFormatSchema.optional(),
  responseFormat: z.unknown().optional(),
  reasoningEffort: z.enum(['minimal', 'low', 'medium', 'high']).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  stream: z.boolean().default(true),
});

function normalizeChatRequest(input: z.infer<typeof chatRequestInputSchema>) {
  const provider = input.provider ?? input.llmProvider;
  if (!provider) {
    throw new Error('Missing LLM provider');
  }

  return {
    provider,
    model: input.model,
    messages: input.messages,
    replyFormat: input.replyFormat ?? (input.responseFormat ? 'structured' : 'text'),
    reasoningEffort: input.reasoningEffort,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
    stream: input.stream,
  };
}

/** POST /ai/chat — SSE stream. Events: `delta` (visible text), `done`, `error`. */
export async function handleChat(req: Request, res: Response): Promise<void> {
  const parsed = chatRequestInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.message });
    return;
  }

  let request: ReturnType<typeof normalizeChatRequest>;
  try {
    request = normalizeChatRequest(parsed.data);
  } catch (err) {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    return;
  }

  const keys = readProviderKeys(req);
  if (!keys.llmKey) {
    res.status(401).json({ ok: false, error: 'Missing LLM provider key' });
    return;
  }

  if (!request.stream) {
    try {
      const result = await completeChat({
        ...request,
        apiKey: keys.llmKey,
        byokOpenAiKey: keys.byokOpenAiKey,
        jsonMode: request.replyFormat === 'structured',
      });
      res.json({ ok: true, text: result.text, meta: { provider: result.provider, model: result.model } });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });

  const send = (event: string, data: Record<string, unknown>) =>
    res.write(formatSseEvent(event, { type: event, ...data }));
  const controller = new AbortController();
  // Cancel on real client disconnect. Must be res 'close', NOT req 'close' —
  // req 'close' fires as soon as the request body is read (immediately for a
  // small POST), which would abort the stream before the model replies.
  res.on('close', () => controller.abort());

  try {
    const result = await streamChat(
      {
        ...request,
        apiKey: keys.llmKey,
        byokOpenAiKey: keys.byokOpenAiKey,
        signal: controller.signal,
      },
      (text) => send('delta', { delta: text, text }),
    );
    send('done', { ok: true, text: result.visibleText, meta: result.metadata });
  } catch (err) {
    send('error', { ok: false, error: err instanceof Error ? err.message : String(err) });
  } finally {
    res.end();
  }
}
