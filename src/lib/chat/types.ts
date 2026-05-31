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
export type RemoteTtsMode = 'live-bridge' | 'full-response' | 'sentence-chunks';
export type FishSpeechVoiceScope = 'all' | 'mine' | 'public';
export type FishSpeechLatency = 'balanced' | 'normal';
export type FishSpeechTransport = 'websocket' | 'timestamp-sse';
export type InworldTransport = 'http' | 'websocket';
export type InworldDeliveryMode = 'STABLE' | 'BALANCED' | 'CREATIVE';
export type LlmProvider = 'openrouter-responses' | 'vercel-gateway';
export type AiTransportMode = 'http-stream';
export type OpenAiStateMode = 'stateless';
export type ReplyLengthMode = 'short' | 'balanced' | 'yap';
export type ToolChoiceMode = 'auto' | 'required';
export type EmbeddingMode = 'auto' | 'browser' | 'provider';

export type AiSettings = {
  llmProvider: LlmProvider;
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
  replyLength: ReplyLengthMode;
  temperature: number;
  maxTokens: number;
  ttsEnabled: boolean;
  ttsAutoSpeak: boolean;
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
  fishSpeechConditionOnPreviousChunks: boolean;
  fishSpeechChunkLength: number;
  inworldVoiceId: string;
  inworldModelId: string;
  inworldTransport: InworldTransport;
  inworldDeliveryMode: InworldDeliveryMode;
  inworldBufferCharThreshold: number;
  ttsPlaybackRate: number;
  ttsVolume: number;
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
    conversationId?: string | null;
    previousResponseId?: string | null;
    promptCacheKey?: string;
    promptCacheRetention?: string;
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
  emotionTelemetryEvents: EmotionTelemetryEvent[];
  sequencerSettings: SequencerSettings;
  visualSettings: VisualSettings;
};
