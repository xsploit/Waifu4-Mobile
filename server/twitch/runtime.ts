import type { ChatProvider, ChatProviderRequest, ChatProviderStreamHandlers } from '../ai/ChatProvider.js';
import { completeChat, streamChat } from '../ai/llmGateway.js';
import { ChatScheduler, type StreamBotEvent } from '../scheduler/ChatScheduler.js';
import { CommandRouter } from '../commands/CommandRouter.js';
import { MockTwitchChatSource, type MockChatInjection } from '../mock/MockTwitchChatSource.js';
import { TwitchIrcSource } from './TwitchIrcSource.js';
import type { TwitchChatMessage, TwitchChatSource, TwitchChatSourceHandlers } from './TwitchChatSource.js';
import type { GatewayId, ReasoningEffort } from '../../src/brain/BrainTypes';
import type { OverlaySocket } from '../overlay/OverlaySocket.js';

export type TwitchRuntimeSourceMode = 'mock' | 'irc';

export type TwitchRuntimeOptions = {
  env?: Record<string, string | undefined>;
  overlaySocket?: Pick<OverlaySocket, 'broadcast' | 'clientCount'>;
  provider?: ChatProvider;
  onEvent?: (event: StreamBotEvent) => void;
};

export type TwitchRuntimeStatus = {
  enabled: boolean;
  started: boolean;
  sourceMode: TwitchRuntimeSourceMode;
  channel: string;
  activeChatters: number;
  pendingBatch: number;
  overlayClients: number;
  sendChatReplies: boolean;
};

const DEFAULT_COMMAND_PREFIXES = ['!ww4', '!webwaifu', '!yw', '!yourwifey', '!waifu'];
const DEFAULT_BOT_ALIASES = ['yourwifey', 'waifu', 'hikari', 'ai'];

function splitCsv(value: string | undefined, fallback: string[]) {
  const values = value
    ?.split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return values && values.length > 0 ? values : fallback;
}

function boolFromEnv(value: string | undefined, fallback = false) {
  if (!value) {
    return fallback;
  }
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(value.trim().toLowerCase());
}

function normalizeChannel(value: string | undefined) {
  return value?.trim().toLowerCase().replace(/^#/, '') || 'subsect';
}

function normalizeProvider(value: string | undefined): GatewayId {
  return value === 'openrouter-responses' ? 'openrouter-responses' : 'vercel-gateway';
}

function normalizeReasoningEffort(value: string | undefined): ReasoningEffort | undefined {
  return value === 'minimal' || value === 'low' || value === 'medium' || value === 'high'
    ? value
    : undefined;
}

function createMockMessage(input: MockChatInjection, channel: string): TwitchChatMessage {
  const user = (input.user || input.displayName || `viewer${Math.floor(Math.random() * 10000)}`)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  const badges = input.badges ?? [];
  return {
    id: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    user,
    displayName: input.displayName?.trim() || user,
    text: input.text?.trim() || 'hello @yourwifey',
    timestamp: Date.now(),
    badges,
    isMod: input.isMod ?? badges.some((badge) => badge.startsWith('moderator/')),
    isBroadcaster:
      input.isBroadcaster ??
      (user === channel || badges.some((badge) => badge.startsWith('broadcaster/'))),
  };
}

export class EnvChatProvider implements ChatProvider {
  private provider: GatewayId;
  private model: string;

  constructor(private readonly env: Record<string, string | undefined> = process.env) {
    this.provider = normalizeProvider(env.TWITCH_LLM_PROVIDER ?? env.LLM_PROVIDER);
    this.model =
      env.TWITCH_LLM_MODEL ??
      env.LLM_MODEL ??
      (this.provider === 'openrouter-responses'
        ? 'deepseek/deepseek-v4-flash'
        : 'openai/gpt-5-nano');
  }

  getModel() {
    return this.model;
  }

  setModel(model: string) {
    const next = model.trim();
    if (next) {
      this.model = next;
    }
  }

  getState() {
    return {
      stateMode: 'stateless',
      cachedTokens: 0,
      provider: this.provider,
      model: this.model,
    };
  }

  async complete(request: ChatProviderRequest) {
    const result = await completeChat({
      provider: this.provider,
      model: this.model,
      messages: request.messages,
      apiKey: this.readLlmKey(),
      byokOpenAiKey: this.env.OPENAI_BYOK_KEY,
      jsonMode: false,
      maxTokens: request.maxTokens ?? 180,
      reasoningEffort: normalizeReasoningEffort(this.env.TWITCH_REASONING_EFFORT),
      signal: request.signal,
      temperature: request.temperature ?? 0.7,
    });
    return { text: result.text, meta: { provider: result.provider, model: result.model } };
  }

  async completeStream(request: ChatProviderRequest, handlers?: ChatProviderStreamHandlers) {
    const result = await streamChat(
      {
        provider: this.provider,
        model: this.model,
        messages: request.messages,
        replyFormat: 'text',
        apiKey: this.readLlmKey(),
        byokOpenAiKey: this.env.OPENAI_BYOK_KEY,
        maxTokens: request.maxTokens ?? 180,
        reasoningEffort: normalizeReasoningEffort(this.env.TWITCH_REASONING_EFFORT),
        signal: request.signal,
        temperature: request.temperature ?? 0.7,
      },
      (delta) => {
        handlers?.onTextDelta?.(delta);
        handlers?.onVisibleTextDelta?.(delta);
      },
    );
    return {
      text: result.visibleText,
      meta: { metadata: result.metadata, provider: result.provider, model: result.model },
    };
  }

  private readLlmKey() {
    const key = this.env.TWITCH_LLM_PROVIDER_KEY ?? this.env.LLM_PROVIDER_KEY;
    if (!key?.trim()) {
      throw new Error('Missing LLM provider key for Twitch runtime.');
    }
    return key;
  }
}

export class TwitchRuntime {
  private readonly enabled: boolean;
  private readonly sourceMode: TwitchRuntimeSourceMode;
  private readonly chatSource: TwitchChatSource;
  private readonly scheduler: ChatScheduler;
  private readonly commandRouter: CommandRouter;
  private started = false;

  constructor(private readonly options: TwitchRuntimeOptions = {}) {
    const env = options.env ?? process.env;
    this.enabled = boolFromEnv(env.TWITCH_BACKEND_RUNTIME_ENABLED, boolFromEnv(env.TWITCH_MOCK));
    this.sourceMode = boolFromEnv(env.TWITCH_MOCK) ? 'mock' : 'irc';
    const provider = options.provider ?? new EnvChatProvider(env);
    const handlers: TwitchChatSourceHandlers = {
      onMessage: (message) => {
        void this.handleMessage(message);
      },
      onStatus: (status) => {
        this.emit({
          type: 'system:status',
          payload: { level: status.level, message: status.message },
        });
      },
    };
    const channel = normalizeChannel(env.TWITCH_CHANNEL);
    this.chatSource =
      this.sourceMode === 'mock'
        ? new MockTwitchChatSource(channel, handlers)
        : new TwitchIrcSource(
            {
              botUsername: env.TWITCH_BOT_USERNAME ?? '',
              channel,
              oauthToken: env.TWITCH_OAUTH_TOKEN ?? '',
            },
            handlers,
          );
    this.scheduler = new ChatScheduler({
      provider,
      ambientChatEnabled: boolFromEnv(env.TWITCH_AMBIENT_CHAT_ENABLED),
      batchTimerMs: Number(env.TWITCH_BATCH_TIMER_MS) || undefined,
      botAliases: splitCsv(env.TWITCH_BOT_ALIASES, DEFAULT_BOT_ALIASES),
      globalReplyCooldownMs: Number(env.TWITCH_GLOBAL_REPLY_COOLDOWN_MS) || undefined,
      maxBatchQueueMessages: Number(env.TWITCH_MAX_BATCH_QUEUE_MESSAGES) || undefined,
      onEvent: (event) => this.emit(event),
      perUserCooldownMs: Number(env.TWITCH_PER_USER_COOLDOWN_MS) || undefined,
    });
    this.commandRouter = new CommandRouter({
      admins: splitCsv(env.TWITCH_COMMAND_ADMINS, ['subsect']),
      allowMods: boolFromEnv(env.TWITCH_COMMAND_ALLOW_MODS, true),
      emit: (event) => this.emit(event),
      getChatSource: () => this.chatSource,
      getStatus: () => ({
        activeChatters: this.scheduler.getActiveChatterCount(),
        overlayClients: this.options.overlaySocket?.clientCount ?? 0,
        twitchMode: this.sourceMode,
      }),
      prefixes: splitCsv(env.TWITCH_COMMAND_PREFIXES, DEFAULT_COMMAND_PREFIXES),
      provider,
      sendChatReplies: boolFromEnv(env.TWITCH_SEND_CHAT_REPLIES, false),
    });
  }

  shouldAutoStart() {
    return this.enabled;
  }

  start() {
    if (this.started) {
      return;
    }
    this.chatSource.start();
    this.started = true;
  }

  stop() {
    if (!this.started) {
      return;
    }
    this.chatSource.stop();
    this.started = false;
  }

  status(): TwitchRuntimeStatus {
    return {
      enabled: this.enabled,
      started: this.started,
      sourceMode: this.sourceMode,
      channel: this.chatSource.channel,
      activeChatters: this.scheduler.getActiveChatterCount(),
      pendingBatch: this.scheduler.getPendingBatchCount(),
      overlayClients: this.options.overlaySocket?.clientCount ?? 0,
      sendChatReplies: this.commandRouter.getSendChatReplies(),
    };
  }

  async injectMockMessage(input: MockChatInjection) {
    if (this.sourceMode !== 'mock') {
      throw new Error('Mock chat injection requires TWITCH_MOCK=true.');
    }
    if (!this.started) {
      this.start();
    }
    const message = createMockMessage(input, this.chatSource.channel);
    await this.handleMessage(message);
    return message;
  }

  private async handleMessage(message: TwitchChatMessage) {
    if (this.commandRouter.handleMessage(message)) {
      return;
    }
    await this.scheduler.handleMessage(message);
  }

  private emit(event: StreamBotEvent) {
    this.options.overlaySocket?.broadcast(event);
    this.options.onEvent?.(event);
  }
}

export function createTwitchRuntime(options: TwitchRuntimeOptions = {}) {
  return new TwitchRuntime(options);
}
