import type { Request, Response } from 'express';
import { z } from 'zod';
import { formatSseEvent } from '../../src/shared/sse';
import {
  createLiveSpeechTextBridge,
  normalizeLiveTtsBridge,
  waitForLiveTtsBridge,
} from './liveTtsBridge';
import { completeChat, streamChat } from './llmGateway';
import type { StreamChatResult } from './llmGateway';
import { readProviderKeys } from './providerKeys';
import { streamFishTtsTextStream } from '../tts/FishTtsStream';
import { TtsOutputFanout } from '../tts/outputFanout';

const providerSchema = z.enum(['vercel-gateway', 'openrouter-responses']);
const replyFormatSchema = z.enum(['structured', 'text']);
const toolChoiceModeSchema = z.enum(['off', 'auto', 'required']);
const openRouterRoutingSchema = z
  .object({
    mode: z.enum(['auto', 'latency', 'throughput', 'pinned']),
    providers: z.array(z.string().min(1)).optional(),
    allowFallbacks: z.boolean().optional(),
  })
  .optional();
const vercelRoutingSchema = z
  .object({
    mode: z.enum(['auto', 'latency', 'throughput', 'cost', 'pinned']),
    providers: z.array(z.string().min(1)).optional(),
    allowFallbacks: z.boolean().optional(),
  })
  .optional();
const messageImageSchema = z.object({
  imageUrl: z.string().min(1),
  mediaType: z.string().min(1).optional(),
  detail: z.enum(['auto', 'high', 'low']).optional(),
});

const chatRequestInputSchema = z.object({
  provider: providerSchema.optional(),
  llmProvider: providerSchema.optional(),
  model: z.string().min(1),
  messages: z
    .array(
      z.object({
        role: z.enum(['system', 'user', 'assistant']),
        content: z.string(),
        images: z.array(messageImageSchema).optional(),
      }),
    )
    .min(1),
  replyFormat: replyFormatSchema.optional(),
  responseFormat: z.unknown().optional(),
  reasoningEffort: z.enum(['minimal', 'low', 'medium', 'high']).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  toolChoiceMode: toolChoiceModeSchema.optional(),
  maxToolRounds: z.number().int().min(1).max(30).optional(),
  openRouterRouting: openRouterRoutingSchema,
  vercelRouting: vercelRoutingSchema,
  stream: z.boolean().default(true),
  ttsBridge: z.unknown().optional(),
});

export function normalizeChatRequest(input: z.infer<typeof chatRequestInputSchema>) {
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
    toolChoiceMode: input.toolChoiceMode,
    maxToolRounds: input.maxToolRounds,
    openRouterRouting: input.openRouterRouting,
    vercelRouting: input.vercelRouting,
    stream: input.stream,
  };
}

export function buildChatDoneEventPayload(
  result: Pick<StreamChatResult, 'metadata' | 'model' | 'provider' | 'visibleText'>,
) {
  return {
    ok: true,
    text: result.visibleText,
    meta: {
      provider: result.provider,
      model: result.model,
    },
    replyMetadata: result.metadata,
  };
}

/** POST /ai/chat — SSE stream. Events: `delta` (visible text), `done`, `error`. */
export async function handleChat(
  req: Request,
  res: Response,
  outputFanout?: TtsOutputFanout,
): Promise<void> {
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
        tavilyKey: keys.tavilyKey,
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

  const send = (event: string, data: Record<string, unknown>) => {
    if (res.writableEnded || res.destroyed) {
      return;
    }
    res.write(formatSseEvent(event, { type: event, ...data }));
  };
  const controller = new AbortController();
  // Cancel on real client disconnect. Must be res 'close', NOT req 'close' —
  // req 'close' fires as soon as the request body is read (immediately for a
  // small POST), which would abort the stream before the model replies.
  res.on('close', () => controller.abort());

  const bridgeRequest = normalizeLiveTtsBridge(parsed.data.ttsBridge);
  const bridge = bridgeRequest && keys.ttsKey ? createLiveSpeechTextBridge(bridgeRequest) : null;
  if (bridgeRequest && !keys.ttsKey) {
    send('tts-error', {
      ok: false,
      error: 'Fish Speech live bridge provider key is not configured.',
    });
  }
  let bridgeFinalizationTimedOut = false;
  let bridgeChunkIndex = 0;
  const bridgeSessionId = bridgeRequest?.ttsSessionId ?? crypto.randomUUID();
  const bridgeUtteranceId = bridgeRequest?.utteranceId ?? crypto.randomUUID();
  const bridgeDone = bridge
    ? streamFishTtsTextStream(
        {
          apiKey: keys.ttsKey!,
          text: '',
          voiceId: bridgeRequest?.voiceId,
          backend: bridgeRequest?.backend,
          format: 'pcm',
          sampleRate: bridgeRequest?.sampleRate ?? 44100,
          chunkLength: bridgeRequest?.chunkLength,
          latency: bridgeRequest?.latency,
          conditionOnPreviousChunks: bridgeRequest?.conditionOnPreviousChunks,
          signal: controller.signal,
        },
        bridge.stream,
        (chunk) => {
          send('audio', {
            audio: Buffer.from(chunk).toString('base64'),
            mimeType: 'audio/pcm',
            sampleRate: bridgeRequest?.sampleRate ?? 44100,
          });
          outputFanout?.tryEnqueue(bridgeRequest?.outputMode ?? 'local-only', {
            audio: chunk,
            chunkIndex: bridgeChunkIndex,
            format: 'pcm',
            sampleRate: bridgeRequest?.sampleRate ?? 44100,
            segmentIndex: bridgeRequest?.segmentIndex ?? 0,
            sessionId: bridgeSessionId,
            utteranceId: bridgeUtteranceId,
          });
          bridgeChunkIndex += 1;
        },
      ).then(
        () => {
          outputFanout?.tryEnqueue(bridgeRequest?.outputMode ?? 'local-only', {
            audio: new Uint8Array(),
            chunkIndex: bridgeChunkIndex,
            format: 'pcm',
            isFinal: true,
            sampleRate: bridgeRequest?.sampleRate ?? 44100,
            segmentIndex: bridgeRequest?.segmentIndex ?? 0,
            sessionId: bridgeSessionId,
            utteranceId: bridgeUtteranceId,
          });
        },
        (err) => {
          outputFanout?.tryEnqueue(bridgeRequest?.outputMode ?? 'local-only', {
            audio: new Uint8Array(),
            cancel: true,
            chunkIndex: bridgeChunkIndex,
            format: 'pcm',
            sampleRate: bridgeRequest?.sampleRate ?? 44100,
            segmentIndex: bridgeRequest?.segmentIndex ?? 0,
            sessionId: bridgeSessionId,
            utteranceId: bridgeUtteranceId,
          });
          const message = err instanceof Error ? err.message : String(err);
          if (bridgeFinalizationTimedOut && message === 'Live TTS bridge finalization timed out.') {
            return;
          }
          if (controller.signal.aborted) {
            return;
          }
          send('tts-error', { ok: false, error: message });
        },
      )
    : null;

  try {
    const result = await streamChat(
      {
        ...request,
        apiKey: keys.llmKey,
        byokOpenAiKey: keys.byokOpenAiKey,
        tavilyKey: keys.tavilyKey,
        signal: controller.signal,
      },
      (text) => {
        send('delta', { delta: text, text });
        bridge?.push(text);
      },
    );
    bridge?.close();
    if (bridgeDone) {
      const bridgeFinished = await waitForLiveTtsBridge(bridgeDone, () => {
        bridgeFinalizationTimedOut = true;
        bridge?.fail(new Error('Live TTS bridge finalization timed out.'));
      });
      if (!bridgeFinished) {
        send('tts-error', {
          ok: false,
          error: 'Live TTS bridge finalization timed out.',
        });
      }
    }
    send('done', buildChatDoneEventPayload(result));
  } catch (err) {
    bridge?.fail(err instanceof Error ? err : new Error(String(err)));
    if (bridgeDone) {
      await waitForLiveTtsBridge(bridgeDone, () => undefined);
    }
    send('error', { ok: false, error: err instanceof Error ? err.message : String(err) });
  } finally {
    res.end();
  }
}
