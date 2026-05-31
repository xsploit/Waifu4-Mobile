import yourWifeyPromptTemplate from './templates/yourwifey-responses.poml?raw';
import { getDesktopBackendUrl } from '../desktop/runtime';

type PromptRole = 'system' | 'user' | 'assistant';
type PomlDynamicStateValue = string | number | boolean | null | undefined;

export type PomlPromptMessage = {
  role: PromptRole;
  content: string;
};

export type ResponsesPromptInputMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type YourWifeyPomlPromptInput = {
  animationCatalogContext?: string;
  currentTurnContext?: string;
  diaryContext?: string;
  dynamicState?: Record<string, PomlDynamicStateValue>;
  grilloContext?: string;
  history: PomlPromptMessage[];
  personaContext?: string;
  relationshipMemoryContext?: string;
  replyMetadataInstruction: string;
  semanticMemoryContext?: string;
  turnMetadataContext?: string;
  ttsContext?: string;
};

export type YourWifeyResponsesPromptPayload = {
  input: ResponsesPromptInputMessage[];
  instructions: string;
};

export type YourWifeyPomlVariables = Record<string, string>;

type PomlRenderResponse = {
  error?: string;
  messages?: unknown;
  ok?: boolean;
};

export const YOURWIFEY_POML_TEMPLATE = yourWifeyPromptTemplate;

const EMPTY_PERSONA_CONTEXT =
  'No active persona profile is configured. Reply as a concise, friendly stream assistant.';

export async function buildYourWifeyPomlMessages(
  input: YourWifeyPomlPromptInput,
): Promise<PomlPromptMessage[]> {
  const variables: YourWifeyPomlVariables = {
    ...normalizeDynamicState(input.dynamicState),
    animation_catalog_context: cleanBlock(input.animationCatalogContext),
    current_turn_context: cleanBlock(input.currentTurnContext),
    diary_context: cleanBlock(input.diaryContext),
    grillo_context: cleanBlock(input.grilloContext),
    persona_context: withFallback(input.personaContext, EMPTY_PERSONA_CONTEXT),
    relationship_memory_context: cleanBlock(input.relationshipMemoryContext),
    reply_metadata_instruction: input.replyMetadataInstruction.trim(),
    semantic_memory_context: cleanBlock(input.semanticMemoryContext),
    turn_metadata_context: cleanBlock(input.turnMetadataContext),
    tts_context: cleanBlock(input.ttsContext),
  };
  const renderedMessages = await renderPomlMessagesOnServer(variables);
  const instructions = normalizeInstructionText(
    renderedMessages
      .filter((message) => message.role === 'system')
      .map((message) => message.content)
      .join('\n\n'),
  );

  const renderedInputMessages = renderedMessages.filter(isResponsesInputMessage);

  return [{ role: 'system', content: instructions }, ...input.history, ...renderedInputMessages];
}

export function buildYourWifeyResponsesPromptPayload(
  messages: PomlPromptMessage[],
): YourWifeyResponsesPromptPayload {
  return {
    instructions: messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content)
      .join('\n\n')
      .trim(),
    input: messages.filter(isResponsesInputMessage),
  };
}

function withFallback(value: string | undefined, fallback: string) {
  const trimmed = value?.trim() ?? '';
  return trimmed || fallback;
}

function cleanBlock(value: string | undefined) {
  return value?.trim() ?? '';
}

function normalizeDynamicState(
  state: Record<string, PomlDynamicStateValue> | undefined,
): YourWifeyPomlVariables {
  if (!state) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(state)
      .filter(([key]) => /^[a-zA-Z0-9_]+$/.test(key))
      .flatMap(([key, value]) =>
        value === undefined || value === null ? [] : [[key, toPomlVariableValue(value)]],
      ),
  );
}

function toPomlVariableValue(value: PomlDynamicStateValue) {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : '';
  }
  return String(value).trim().slice(0, 16000);
}

async function renderPomlMessagesOnServer(
  variables: YourWifeyPomlVariables,
): Promise<PomlPromptMessage[]> {
  const response = await fetch(getPomlRenderUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ variables }),
  });

  if (!response.ok) {
    throw new Error(`POML render endpoint failed with HTTP ${response.status}.`);
  }

  const data = (await response.json()) as PomlRenderResponse;
  if (!data.ok) {
    throw new Error(data.error ?? 'POML render endpoint failed.');
  }

  const messages = normalizePromptMessages(data.messages);
  if (!messages.some((message) => message.role === 'system' && message.content.trim())) {
    throw new Error('POML render endpoint returned no system instructions.');
  }

  return messages;
}

function getPomlRenderUrl() {
  const desktopUrl = getDesktopBackendUrl('/ai/poml/render');
  if (desktopUrl) {
    return desktopUrl;
  }

  const explicitUrl = (import.meta.env['VITE_POML_RENDER_URL'] || '').trim();
  if (explicitUrl) {
    return explicitUrl;
  }

  const aiProxyUrl = (import.meta.env['VITE_AI_PROXY_URL'] || '').trim();
  if (aiProxyUrl) {
    const url = new URL(aiProxyUrl);
    url.pathname = url.pathname.replace(/\/chat\/?$/, '/poml/render');
    if (!/\/poml\/render\/?$/.test(url.pathname)) {
      url.pathname = `${url.pathname.replace(/\/+$/, '')}/poml/render`;
    }
    return url.toString();
  }

  if (typeof window === 'undefined') {
    const port = (import.meta.env['VITE_BOT_PORT'] || '8797').trim() || '8797';
    return `http://127.0.0.1:${port}/ai/poml/render`;
  }

  const url = new URL('/api/ai/poml/render', window.location.href);
  return url.toString();
}

function normalizePromptMessages(value: unknown): PomlPromptMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item): PomlPromptMessage | null => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const source = item as Partial<PomlPromptMessage>;
      if (source.role !== 'system' && source.role !== 'user' && source.role !== 'assistant') {
        return null;
      }
      if (typeof source.content !== 'string' || !source.content.trim()) {
        return null;
      }
      return {
        role: source.role,
        content: normalizeInstructionText(source.content),
      };
    })
    .filter((item): item is PomlPromptMessage => Boolean(item));
}

function normalizeInstructionText(text: string) {
  return text
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isResponsesInputMessage(
  message: PomlPromptMessage,
): message is ResponsesPromptInputMessage {
  return message.role === 'user' || message.role === 'assistant';
}
