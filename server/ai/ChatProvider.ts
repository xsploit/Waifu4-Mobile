import type { TwitchChatMessage } from '../twitch/TwitchChatSource.js';

export type ChatProviderMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: ChatProviderInputImage[];
};

export type ChatProviderInputImage = {
  detail?: 'auto' | 'high' | 'low';
  imageUrl: string;
};

export type ChatProviderResponseFormat =
  | {
      type: 'json_object';
    }
  | {
      name: string;
      schema: Record<string, unknown>;
      strict?: boolean;
      type: 'json_schema';
    };

export type ChatProviderRequest = {
  mode: 'direct' | 'batch';
  activeChatters: number;
  messages: ChatProviderMessage[];
  sourceMessages: TwitchChatMessage[];
  disableState?: boolean;
  responseFormat?: ChatProviderResponseFormat;
  stateKey?: string;
  stateScope?: 'chat' | 'memory';
  transportMode?: 'http-stream';
  openAiStateMode?: 'stateless';
  toolChoiceMode?: 'auto' | 'required';
  maxToolRounds?: number;
  target?: TwitchChatMessage;
  maxTokens?: number;
  signal?: AbortSignal;
  temperature?: number;
};

export type ChatProviderResponse = {
  text: string;
  meta?: Record<string, unknown>;
};

export type ChatProviderStreamHandlers = {
  onTextDelta?: (delta: string) => void;
  onVisibleTextDelta?: (delta: string) => void;
};

export type ChatProviderStateOptions = {
  openAiStateMode?: ChatProviderRequest['openAiStateMode'];
  transportMode?: ChatProviderRequest['transportMode'];
};

export interface ChatProvider {
  complete(request: ChatProviderRequest): Promise<ChatProviderResponse>;
  completeStream?(
    request: ChatProviderRequest,
    handlers?: ChatProviderStreamHandlers,
  ): Promise<ChatProviderResponse>;
  getModel?(): string;
  setModel?(model: string): void;
  getState?(stateKey?: string, options?: ChatProviderStateOptions): Record<string, unknown>;
  resetState?(): void;
}
