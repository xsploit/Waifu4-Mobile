import type {
  EmotionTelemetryEvent,
  SequencerSettings,
  SettingsTabId,
  VisualSettings,
} from '../menu/types';

export type ChatRole = 'system' | 'user' | 'assistant';

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
};

export type RuntimeErrorEntry = {
  createdAt: number;
  id: string;
  message: string;
  scope: string;
};

export type PersonaProfile = {
  id: string;
  name: string;
  systemPrompt: string;
  description: string;
  userNickname: string;
};

export type PersonaDraft = Omit<PersonaProfile, 'id'>;

export type TtsProvider = 'piper' | 'fish-speech' | 'inworld';
export type VoiceCreationProvider = 'fish-speech' | 'inworld';
export type PersonaVoiceProvider = TtsProvider | VoiceCreationProvider;
export type RemoteTtsMode = 'live-bridge' | 'full-response' | 'early-chunks' | 'sentence-chunks';
export type TtsOutputMode = 'local-only' | 'discord-only' | 'local+discord' | 'external';
export type FishSpeechVoiceScope = 'all' | 'mine' | 'public';
export type FishSpeechLatency = 'balanced' | 'normal';
export type FishSpeechTransport = 'websocket' | 'timestamp-sse';
export type FishSpeechFormat = 'pcm' | 'mp3' | 'wav' | 'opus';
export type FishSpeechLiveChunkingStrategy = 'fast-phrase' | 'safe-phrase' | 'eager';
export type InworldTransport = 'http' | 'websocket';
export type InworldTimestampType = 'NONE' | 'WORD' | 'CHARACTER';
export type InworldTimestampTransportStrategy = 'SYNC' | 'ASYNC';
export type InworldDeliveryMode = 'STABLE' | 'BALANCED' | 'CREATIVE' | 'EXPRESSIVE';
export type LlmProvider = 'openrouter-responses' | 'vercel-gateway';
export type OpenRouterRoutingMode = 'auto' | 'latency' | 'throughput' | 'pinned';
export type VercelRoutingMode = 'auto' | 'latency' | 'throughput' | 'cost' | 'pinned';
export type AiTransportMode = 'http-stream';
export type OpenAiStateMode = 'stateless';
export type ReplyLengthMode = 'short' | 'balanced' | 'yap';
export type ToolChoiceMode = 'off' | 'auto' | 'required';
export type EmbeddingMode = 'auto' | 'browser' | 'provider';
export type LipSyncMode = 'hybrid' | 'direct';

export type AiSettings = {
  llmProvider: LlmProvider;
  openRouterRoutingMode: OpenRouterRoutingMode;
  openRouterProviderSlugs: string;
  openRouterAllowFallbacks: boolean;
  vercelRoutingMode: VercelRoutingMode;
  vercelProviderSlugs: string;
  vercelAllowFallbacks: boolean;
  model: string;
  memoryAgentModel: string;
  memoryAgentIntervalMessages: number;
  embeddingMode: EmbeddingMode;
  embeddingLocalModel: string;
  embeddingModel: string;
  aiTransportMode: AiTransportMode;
  openAiStateMode: OpenAiStateMode;
  toolChoiceMode: ToolChoiceMode;
  maxToolRounds: number;
  runtimeSituation: string;
  replyLength: ReplyLengthMode;
  temperature: number;
  maxTokens: number;
  ttsEnabled: boolean;
  ttsAutoSpeak: boolean;
  ttsOutputMode: TtsOutputMode;
  ttsExternalOutputDeviceId: string;
  ttsSimulatedStreaming: boolean;
  ttsExpressionTagsEnabled: boolean;
  ttsProvider: TtsProvider;
  remoteTtsMode: RemoteTtsMode;
  ttsVoice: string;
  fishSpeechVoiceId: string;
  fishSpeechVoiceScope: FishSpeechVoiceScope;
  fishSpeechModel: string;
  fishSpeechLatency: FishSpeechLatency;
  fishSpeechTransport: FishSpeechTransport;
  fishSpeechFormat: FishSpeechFormat;
  fishSpeechSampleRate: number;
  fishSpeechConditionOnPreviousChunks: boolean;
  fishSpeechChunkLength: number;
  fishSpeechLiveChunkingStrategy: FishSpeechLiveChunkingStrategy;
  inworldVoiceId: string;
  inworldModelId: string;
  inworldTransport: InworldTransport;
  inworldSampleRate: number;
  inworldTimestampType: InworldTimestampType;
  inworldTimestampTransportStrategy: InworldTimestampTransportStrategy;
  inworldDeliveryMode: InworldDeliveryMode;
  inworldBufferCharThreshold: number;
  inworldMaxBufferDelayMs: number;
  inworldAutoMode: boolean;
  ttsPlaybackRate: number;
  ttsVolume: number;
  lipSyncMode: LipSyncMode;
  lipSyncSmoothing: number;
  lipSyncGain: number;
  lipSyncVolumeInfluence: number;
};

export type PersonaVoiceBinding = {
  customVoiceId?: string;
  label: string;
  modelId?: string;
  provider: PersonaVoiceProvider;
  updatedAt: number;
  voiceId: string;
};

export type VoiceLabSample = {
  fileName: string;
  lastModified?: number;
  mimeType: string;
  size: number;
};

export type VoiceLabVoice = {
  accent: string;
  ageVibe: string;
  assignedPersonaIds: string[];
  createdAt: number;
  description: string;
  emotionalTone: string;
  expressiveness: number;
  id: string;
  modelId: string;
  name: string;
  provider: VoiceCreationProvider;
  providerVoiceId: string;
  sample: VoiceLabSample | null;
  speakingStyle: string;
  stability: number;
  status: 'draft' | 'ready';
  updatedAt: number;
};

export type RelationshipStage = 'new' | 'familiar' | 'close';

export type RelationshipMood =
  | 'cold'
  | 'guarded'
  | 'curious'
  | 'teasing'
  | 'flustered'
  | 'annoyed'
  | 'soft'
  | 'affectionate';

export type RelationshipActionTag =
  | 'none'
  | 'compliment'
  | 'flirt'
  | 'tease'
  | 'apologize'
  | 'ask_personal'
  | 'challenge'
  | 'reassure'
  | 'push_boundaries'
  | 'stay_silent'
  | 'ask_follow'
  | 'ask_open_up';

export type AffectState = {
  arousal: number;
  dominance: number;
  label: string;
  lastEmotion: string;
  updatedAt: number | null;
  valence: number;
};

export type RelationshipMemory = {
  version: 2;
  turnCount: number;
  lastSeenAt: number | null;
  lastDiaryTurnCount: number;
  relationshipStage: RelationshipStage;
  mood: RelationshipMood;
  trust: number;
  attraction: number;
  respect: number;
  irritation: number;
  jealousy: number;
  guard: number;
  lastActionTag: RelationshipActionTag;
  facts: string[];
  summary: string;
  diaryEntry: string;
  diaryHistory: string[];
  affectState: AffectState;
};

export type AiProxyHealth = {
  aiProvider?: string;
  model?: string;
  serverProviderProxyEnabled?: boolean;
  providerState?: {
    activeState?: {
      cachedTokens?: number;
      conversationId?: string | null;
      previousResponseId?: string | null;
      stateKey?: string;
    };
    activeStateKey?: string;
    cachedTokens?: number;
    cacheWriteTokens?: number;
    conversationId?: string | null;
    previousResponseId?: string | null;
    model?: string;
    provider?: string;
    promptCacheKey?: string;
    promptCacheMode?: string;
    promptCacheRetention?: string;
    inputTokens?: number;
    outputTokens?: number;
    reasoningTokens?: number;
    totalTokens?: number;
    requestedTransport?: string;
    scopedStates?: Array<{
      cachedTokens?: number;
      conversationId?: string | null;
      previousResponseId?: string | null;
      stateKey?: string;
    }>;
    stateKey?: string;
    stateMode?: string;
    stateKeys?: string[];
    store?: boolean;
    toolNames?: string[];
    toolsAvailable?: boolean;
    toolsSource?: string;
    transport?: string;
    websocketConfigured?: boolean;
    websocketConnected?: boolean;
    websocketLifecycle?: string;
    websocketStatus?: string;
  } | null;
  ttsProviders?: {
    fishSpeech?: {
      conditionOnPreviousChunks?: boolean;
      configured?: boolean;
      latency?: string;
      model?: string;
    };
    inworld?: {
      configured?: boolean;
      deliveryMode?: string;
      model?: string;
    };
  };
};

export type UiState = {
  menuOpen: boolean;
  chatLogOpen: boolean;
  chatDraft: string;
};

export type TwitchSettings = {
  aiEnabled: boolean;
  batchFastWaitMs: number;
  batchHighSize: number;
  batchLowSize: number;
  batchMaxSize: number;
  batchMidSize: number;
  batchWaitMs: number;
  commandsEnabled: boolean;
  contextLimit: number;
  directChatterLimit: number;
  localDisplayName: string;
  localTrustedControls: boolean;
  maxBatchMessages: number;
  maxPendingJobs: number;
  mentionRequiredUnderThreshold: boolean;
  replyGapMs: number;
  streamTranscriptionContextLimit: number;
  streamTranscriptionEnabled: boolean;
  streamTranscriptionIntervalSeconds: number;
  streamTranscriptionModel: string;
  streamTranscriptionSampleSeconds: number;
  streamModeEnabled: boolean;
  streamVisionContextEnabled: boolean;
  streamVisionDetail: 'auto' | 'high' | 'low';
  streamVisionIntervalSeconds: number;
  streamVisionMaxAgeSeconds: number;
};

export type DiscordAsrProvider = 'fish' | 'openrouter' | 'vercel';
export type DiscordInterruptionPolicy = 'ignore' | 'stop-speaking' | 'barge-in';
export type DiscordConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export type DiscordSettings = {
  enabled: boolean;
  connectOnStart: boolean;
  botToken: string;
  guildId: string;
  voiceChannelId: string;
  trustedControllerUserIds: string[];
  asrProvider: DiscordAsrProvider;
  transcriptionModel: string;
  languageHint: string;
  vadThreshold: number;
  vadEndSilenceMs: number;
  vadMinSpeechMs: number;
  vadMaxSpeechMs: number;
  listenEnabled: boolean;
  speakEnabled: boolean;
  sendReplyText: boolean;
  interruptionPolicy: DiscordInterruptionPolicy;
};

export type PersistedChatState = {
  personas: PersonaProfile[];
  activePersonaId: string;
  aiSettings: AiSettings;
  chatHistory: ChatMessage[];
  chatHistories: Record<string, ChatMessage[]>;
  relationshipMemory: RelationshipMemory;
  relationshipMemories: Record<string, RelationshipMemory>;
  personaVoiceBindings: Record<string, PersonaVoiceBinding>;
  voiceLabVoices: VoiceLabVoice[];
  uiState: UiState;
  activeTab: SettingsTabId;
  currentBundledModelId: string;
  currentCustomVrmModelId: string;
  twitchChannel: string;
  twitchSettings: TwitchSettings;
  discordSettings?: DiscordSettings;
  emotionTelemetryEvents: EmotionTelemetryEvent[];
  sequencerSettings: SequencerSettings;
  visualSettings: VisualSettings;
};
