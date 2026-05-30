import { createSseParser } from '../shared/sse';
import type {
  GatewayId,
  LlmMessage,
  ReasoningEffort,
  ReplyFormat,
  ReplyMetadata,
} from '../brain/BrainTypes';
import type { ProviderModelInfo } from '../brain/modelCapability';

/** Fetch model capability metadata from the backend for automatic lane selection. */
export async function fetchModels(
  provider: GatewayId,
  creds: LlmCredentials,
): Promise<ProviderModelInfo[]> {
  const res = await fetch(`/ai/models?provider=${encodeURIComponent(provider)}`, {
    headers: {
      'x-yourwifey-llm-provider': provider,
      ...(creds.llmKey ? { 'x-yourwifey-llm-provider-key': creds.llmKey } : {}),
    },
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) {
        message = body.error;
      }
    } catch {
      /* keep status message */
    }
    throw new Error(message);
  }
  const body = (await res.json()) as { models?: ProviderModelInfo[] };
  return body.models ?? [];
}

export type LlmChatRequest = {
  provider: GatewayId;
  model: string;
  messages: LlmMessage[];
  replyFormat?: ReplyFormat;
  reasoningEffort?: ReasoningEffort;
  temperature?: number;
  maxTokens?: number;
};

export type LlmCredentials = {
  llmKey: string;
  byokOpenAiKey?: string;
};

export type LlmStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; text: string; meta: ReplyMetadata | null }
  | { type: 'error'; error: string };

function safeJson(raw: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Stream a chat reply from the local backend. Yields visible-text deltas, then a
 * single `done` (with parsed metadata) or `error`. The client never calls a
 * provider directly — it POSTs to /ai/chat (D1).
 */
export async function* streamChat(
  request: LlmChatRequest,
  creds: LlmCredentials,
  signal?: AbortSignal,
): AsyncGenerator<LlmStreamEvent> {
  const res = await fetch('/ai/chat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-yourwifey-llm-provider': request.provider,
      'x-yourwifey-llm-provider-key': creds.llmKey,
      ...(creds.byokOpenAiKey ? { 'x-yourwifey-openai-byok-key': creds.byokOpenAiKey } : {}),
    },
    body: JSON.stringify({
      provider: request.provider,
      model: request.model,
      messages: request.messages,
      replyFormat: request.replyFormat ?? 'text',
      reasoningEffort: request.reasoningEffort,
      temperature: request.temperature,
      maxTokens: request.maxTokens,
    }),
    signal,
  });

  if (!res.ok || !res.body) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) {
        message = body.error;
      }
    } catch {
      /* keep status message */
    }
    yield { type: 'error', error: message };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      for (const ev of parser.push(decoder.decode(value, { stream: true }))) {
        const data = safeJson(ev.data) ?? {};
        if (ev.event === 'delta') {
          yield { type: 'delta', text: String(data.text ?? '') };
        } else if (ev.event === 'done') {
          yield {
            type: 'done',
            text: String(data.text ?? ''),
            meta: (data.meta as ReplyMetadata | null) ?? null,
          };
        } else if (ev.event === 'error') {
          yield { type: 'error', error: String(data.error ?? 'stream error') };
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
