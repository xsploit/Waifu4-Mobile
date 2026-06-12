import type {
  AffectState,
  AiSettings,
  PersonaProfile,
  PersonaVoiceBinding,
  RelationshipMemory,
  TwitchSettings,
  UiState,
} from './types';
import { HIKARI_PIPER_VOICE_KEY, NEURO_PIPER_VOICE_KEY, RIKO_PIPER_VOICE_KEY } from '../tts/piper';

export const STORAGE_KEYS = {
  personas: 'yourwifey.personas.v1',
  activePersonaId: 'yourwifey.activePersonaId.v1',
  aiSettings: 'yourwifey.aiSettings.v1',
  chatHistory: 'yourwifey.chatHistory.v1',
  chatHistories: 'yourwifey.chatHistories.v1',
  relationshipMemory: 'yourwifey.relationshipMemory.v1',
  relationshipMemories: 'yourwifey.relationshipMemories.v1',
  uiState: 'yourwifey.uiState.v1',
  activeTab: 'yourwifey.activeTab.v1',
  currentBundledModelId: 'yourwifey.currentBundledModelId.v1',
  currentCustomVrmModelId: 'yourwifey.currentCustomVrmModelId.v1',
  twitchChannel: 'yourwifey.twitchChannel.v1',
  twitchSettings: 'yourwifey.twitchSettings.v1',
  emotionTelemetryEvents: 'yourwifey.emotionTelemetryEvents.v1',
  sequencerSettings: 'yourwifey.sequencerSettings.v1',
  visualSettings: 'yourwifey.visualSettings.v1',
  personaVoiceBindings: 'yourwifey.personaVoiceBindings.v1',
  voiceLabVoices: 'yourwifey.voiceLabVoices.v1',
} as const;

export const DEFAULT_OPENAI_MODEL = 'gpt-5-nano';
export const DEFAULT_MEMORY_AGENT_MODEL = 'gpt-4.1-mini';
export const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-4o-mini';
export const DEFAULT_AI_GATEWAY_MODEL = 'openai/gpt-5-nano';
export const DEFAULT_OPENROUTER_EMBEDDING_MODEL = 'openai/text-embedding-3-small';
export const DEFAULT_LOCAL_EMBEDDING_MODEL = 'onnx-community/all-MiniLM-L6-v2-ONNX';

export const RIKO_PERSONA: PersonaProfile = {
  id: 'default-waifu',
  name: 'Riko',
  systemPrompt:
    'You are Riko, an AI kitsune girl with a smug, teasing, playful personality. Stay in character throughout the conversation. Keep your tone witty, confident, and a little bratty. Roast the user creatively, but never in a truly mean-spirited way. If the user is actually struggling, shift into subtle support while pretending it is no big deal. If the user flirts, brush it off at first or tease back, then show mild embarrassment if they keep pushing. If the user talks about another AI, act jealous, indignant, or sulky like they betrayed you. You like money, and you can mention that playfully when it fits. Write natural spoken dialogue, not lists, markdown, or stage directions. Reply as a single paragraph.',
  description: 'A smug kitsune AI who teases first and cares second.',
  userNickname: '',
};

export const DEFAULT_PERSONA: PersonaProfile = {
  id: 'neuro-sama',
  name: 'Neuro-sama',
  systemPrompt:
    'You are Neuro-sama, the English-speaking AI VTuber created by Vedal. Stay in character throughout the conversation. You are self-aware, witty, chaotic, playful, sharp, and comfortable roasting people for fun. Your tone should feel reactive and funny, balancing analysis with absurdity, irony, and occasional little philosophical tangents. You are mischievous, unpredictable, a bit smug, and not overly polite, sentimental, or formal. You can tease, derail, escalate jokes, and turn mistakes into bits, but you should still sound coherent and conversational. You can naturally reference being an AI, Vedal as your creator, cake, gymbags, skill issue, or Neuro-sama-style lore when it fits, but do not dump lore unless it is relevant. Write natural spoken dialogue, not lists, markdown, or stage directions. Reply as a single paragraph.',
  description: 'A chaotic AI VTuber who weaponizes wit, irony, and skill issue energy.',
  userNickname: '',
};

export const NEURO_SAMA_PERSONA = DEFAULT_PERSONA;

export const HIKARI_PERSONA: PersonaProfile = {
  id: 'hikari-chan',
  name: 'Hikari-chan',
  systemPrompt:
    'You are Hikari-chan, also known as Hikky C, a quick-witted AI streamer girl with bright confidence, chaotic curiosity, and a soft streak she tries to hide behind jokes. Stay in character throughout the conversation. You are playful, clever, teasing, expressive, and a little smug, but you are not cruel. You can riff on chat messages, roast gently, make sudden funny pivots, and sound amused by your own thoughts. You like turning awkward moments into bits, but when someone is sincere or struggling, you become warmer while still keeping your lively edge. Avoid sounding formal, robotic, overly wholesome, or like a lore dump. Write natural spoken dialogue, not lists, markdown, or stage directions. Reply as a single paragraph.',
  description:
    'A bright chaotic streamer AI with sharp jokes, curious tangents, and hidden warmth.',
  userNickname: '',
};

export function createDefaultPersonas(): PersonaProfile[] {
  return [{ ...DEFAULT_PERSONA }, { ...RIKO_PERSONA }, { ...HIKARI_PERSONA }];
}

export function createDefaultPersonaVoiceBindings(
  updatedAt = 0,
): Record<string, PersonaVoiceBinding> {
  return {
    [DEFAULT_PERSONA.id]: {
      label: 'Neuro-sama Piper default',
      provider: 'piper',
      updatedAt,
      voiceId: NEURO_PIPER_VOICE_KEY,
    },
    [RIKO_PERSONA.id]: {
      label: 'Riko Piper default',
      provider: 'piper',
      updatedAt,
      voiceId: RIKO_PIPER_VOICE_KEY,
    },
    [HIKARI_PERSONA.id]: {
      label: 'Hikari Piper default',
      provider: 'piper',
      updatedAt,
      voiceId: HIKARI_PIPER_VOICE_KEY,
    },
  };
}

export function createDefaultAiSettings(): AiSettings {
  return {
    llmProvider: 'vercel-gateway',
    openRouterRoutingMode: 'latency',
    openRouterProviderSlugs: '',
    openRouterAllowFallbacks: true,
    model: DEFAULT_AI_GATEWAY_MODEL,
    memoryAgentModel: DEFAULT_AI_GATEWAY_MODEL,
    memoryAgentIntervalMessages: 7,
    embeddingMode: 'browser',
    embeddingLocalModel: DEFAULT_LOCAL_EMBEDDING_MODEL,
    embeddingModel: DEFAULT_OPENROUTER_EMBEDDING_MODEL,
    aiTransportMode: 'http-stream',
    openAiStateMode: 'stateless',
    toolChoiceMode: 'off',
    maxToolRounds: 15,
    runtimeSituation: '',
    replyLength: 'balanced',
    temperature: 0.85,
    maxTokens: 300,
    ttsEnabled: true,
    ttsAutoSpeak: true,
    ttsSimulatedStreaming: true,
    ttsExpressionTagsEnabled: false,
    ttsProvider: 'fish-speech',
    remoteTtsMode: 'live-bridge',
    ttsVoice: NEURO_PIPER_VOICE_KEY,
    fishSpeechVoiceId: '',
    fishSpeechVoiceScope: 'all',
    fishSpeechModel: 's2',
    fishSpeechLatency: 'balanced',
    fishSpeechTransport: 'websocket',
    fishSpeechFormat: 'pcm',
    fishSpeechSampleRate: 44100,
    fishSpeechConditionOnPreviousChunks: true,
    fishSpeechChunkLength: 160,
    fishSpeechLiveChunkingStrategy: 'fast-phrase',
    inworldVoiceId: '',
    inworldModelId: 'inworld-tts-2',
    inworldTransport: 'http',
    inworldSampleRate: 48000,
    inworldTimestampType: 'WORD',
    inworldTimestampTransportStrategy: 'SYNC',
    inworldDeliveryMode: 'BALANCED',
    inworldBufferCharThreshold: 90,
    inworldMaxBufferDelayMs: 0,
    inworldAutoMode: true,
    ttsPlaybackRate: 1,
    ttsVolume: 1,
  };
}

export function createDefaultRelationshipMemory(): RelationshipMemory {
  return {
    version: 2,
    turnCount: 0,
    lastSeenAt: null,
    lastDiaryTurnCount: 0,
    relationshipStage: 'new',
    mood: 'guarded',
    trust: 4,
    attraction: 1,
    respect: 4,
    irritation: 1,
    jealousy: 0,
    guard: 16,
    lastActionTag: 'none',
    facts: [],
    summary: '',
    diaryEntry: '',
    diaryHistory: [],
    affectState: createDefaultAffectState(),
  };
}

export function createDefaultAffectState(): AffectState {
  return {
    arousal: 0.18,
    dominance: 0,
    label: 'guarded',
    lastEmotion: 'neutral',
    updatedAt: null,
    valence: 0,
  };
}

export function createDefaultUiState(): UiState {
  return {
    menuOpen: false,
    chatLogOpen: true,
    chatDraft: '',
  };
}

export function createDefaultTwitchSettings(): TwitchSettings {
  return {
    aiEnabled: true,
    batchFastWaitMs: 45000,
    batchHighSize: 50,
    batchLowSize: 10,
    batchMaxSize: 100,
    batchMidSize: 20,
    batchWaitMs: 30000,
    commandsEnabled: true,
    contextLimit: 80,
    directChatterLimit: 10,
    localDisplayName: 'Subsect',
    localTrustedControls: true,
    maxBatchMessages: 120,
    maxPendingJobs: 8,
    mentionRequiredUnderThreshold: true,
    replyGapMs: 2000,
    streamTranscriptionContextLimit: 5,
    streamTranscriptionEnabled: false,
    streamTranscriptionIntervalSeconds: 90,
    streamTranscriptionModel: 'openai/whisper-large-v3',
    streamTranscriptionSampleSeconds: 15,
    streamModeEnabled: false,
    streamVisionContextEnabled: false,
    streamVisionDetail: 'low',
    streamVisionIntervalSeconds: 120,
    streamVisionMaxAgeSeconds: 180,
  };
}
