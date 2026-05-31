import {
  DEFAULT_PERSONA,
  DEFAULT_LOCAL_EMBEDDING_MODEL,
  HIKARI_PERSONA,
  createDefaultAiSettings,
  createDefaultPersonaVoiceBindings,
  createDefaultRelationshipMemory,
  createDefaultPersonas,
  createDefaultTwitchSettings,
  createDefaultUiState,
  STORAGE_KEYS,
} from './defaults';
import { createDefaultSequencerSettings, createDefaultVisualSettings } from '../menu/defaults';
import { normalizeTwitchStreamTranscriptionModel } from '../twitch/stream-transcription';
import { DEFAULT_ANIMATIONS } from '../vrm/sequencer';
import {
  getAiProviderSwitchDefaults,
  isPremiumCostModelId,
  normalizeLlmProviderCompatibility,
} from './provider-defaults';
import type {
  AiSettings,
  ChatMessage,
  PersistedChatState,
  PersonaVoiceBinding,
  PersonaVoiceProvider,
  PersonaProfile,
  RelationshipMemory,
  TwitchSettings,
  UiState,
  VoiceCreationProvider,
  VoiceLabSample,
  VoiceLabVoice,
} from './types';
import type {
  AnimationEntry,
  AnimationFormat,
  AnimationPurpose,
  EmotionTelemetryEvent,
  SettingsTabId,
  VisualSettings,
} from '../menu/types';
import {
  appendDiaryHistory,
  clampRelationshipStat,
  dedupeFacts,
  deriveRelationshipStage,
  normalizeRelationshipActionTag,
  normalizeRelationshipMood,
  sanitizeDiaryEntry,
} from './memory-shared';
import { normalizeReplyLengthMode } from './reply-length';
import { normalizeAffectState } from './affect-bridge';

function getLocalStorage() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

async function getPersistedItem(key: string) {
  return getLocalStorage()?.getItem(key) ?? null;
}

async function setPersistedItem(key: string, value: string) {
  try {
    getLocalStorage()?.setItem(key, value);
  } catch {
    // Persistence is best-effort; quota/private-mode failures should not break chat.
  }
}

function safeParse<T>(value: string | null, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function normalizePersonaProfile(value: unknown): PersonaProfile | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const source = value as Partial<PersonaProfile>;
  if (!source.id || !source.name) {
    return null;
  }

  return {
    id: String(source.id),
    name: String(source.name),
    systemPrompt: String(source.systemPrompt ?? ''),
    description: String(source.description ?? ''),
    userNickname: String(source.userNickname ?? ''),
  };
}

function normalizePersonaVoiceProvider(value: unknown): PersonaVoiceProvider | null {
  switch (value) {
    case 'piper':
    case 'fish-speech':
    case 'inworld':
      return value;
    case 'orpheus':
      return 'fish-speech';
    default:
      return null;
  }
}

function normalizeVoiceCreationProvider(value: unknown): VoiceCreationProvider | null {
  if (value === 'orpheus') {
    return 'fish-speech';
  }
  return value === 'inworld' || value === 'fish-speech' ? value : null;
}

function normalizePersonaVoiceBinding(value: unknown): PersonaVoiceBinding | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const source = value as Partial<PersonaVoiceBinding>;
  const provider = normalizePersonaVoiceProvider(source.provider);
  const voiceId = String(source.voiceId ?? '').trim();
  if (!provider || !voiceId) {
    return null;
  }

  return {
    customVoiceId:
      typeof source.customVoiceId === 'string' && source.customVoiceId.trim()
        ? source.customVoiceId.trim()
        : undefined,
    label: String(source.label ?? voiceId).slice(0, 120),
    modelId:
      typeof source.modelId === 'string' && source.modelId.trim()
        ? source.modelId.trim().slice(0, 120)
        : undefined,
    provider,
    updatedAt:
      typeof source.updatedAt === 'number' && Number.isFinite(source.updatedAt)
        ? Math.max(0, Math.round(source.updatedAt))
        : 0,
    voiceId: voiceId.slice(0, 240),
  };
}

function normalizePersonaVoiceBindings(value: unknown): Record<string, PersonaVoiceBinding> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const entries: Array<[string, PersonaVoiceBinding]> = [];
  for (const [rawPersonaId, rawBinding] of Object.entries(value as Record<string, unknown>)) {
    const personaId = rawPersonaId.trim().slice(0, 160);
    const binding = normalizePersonaVoiceBinding(rawBinding);
    if (personaId && binding) {
      entries.push([personaId, binding]);
    }
  }
  return Object.fromEntries(entries);
}

function normalizeVoiceLabSample(value: unknown): VoiceLabSample | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const source = value as Partial<VoiceLabSample>;
  const fileName = String(source.fileName ?? '').trim();
  if (!fileName) {
    return null;
  }
  return {
    fileName: fileName.slice(0, 240),
    lastModified:
      typeof source.lastModified === 'number' && Number.isFinite(source.lastModified)
        ? Math.max(0, Math.round(source.lastModified))
        : undefined,
    mimeType: String(source.mimeType ?? '').slice(0, 120),
    size:
      typeof source.size === 'number' && Number.isFinite(source.size)
        ? Math.max(0, Math.round(source.size))
        : 0,
  };
}

function normalizeVoiceLabVoice(value: unknown): VoiceLabVoice | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const source = value as Partial<VoiceLabVoice>;
  const provider = normalizeVoiceCreationProvider(source.provider);
  const id = String(source.id ?? '').trim();
  const name = String(source.name ?? '').trim();
  if (!id || !name || !provider) {
    return null;
  }

  const assignedPersonaIds = Array.isArray(source.assignedPersonaIds)
    ? Array.from(
        new Set(
          source.assignedPersonaIds
            .map((item) => String(item).trim().slice(0, 160))
            .filter(Boolean),
        ),
      )
    : [];
  const createdAt =
    typeof source.createdAt === 'number' && Number.isFinite(source.createdAt)
      ? Math.max(0, Math.round(source.createdAt))
      : Date.now();
  const updatedAt =
    typeof source.updatedAt === 'number' && Number.isFinite(source.updatedAt)
      ? Math.max(createdAt, Math.round(source.updatedAt))
      : createdAt;

  return {
    accent: String(source.accent ?? '').slice(0, 160),
    ageVibe: String(source.ageVibe ?? '').slice(0, 160),
    assignedPersonaIds,
    createdAt,
    description: String(source.description ?? '').slice(0, 1000),
    emotionalTone: String(source.emotionalTone ?? '').slice(0, 240),
    expressiveness:
      typeof source.expressiveness === 'number' && Number.isFinite(source.expressiveness)
        ? Math.max(0, Math.min(1, source.expressiveness))
        : 0.65,
    id: id.slice(0, 160),
    modelId: String(source.modelId ?? '').slice(0, 160),
    name: name.slice(0, 160),
    provider,
    providerVoiceId: String(source.providerVoiceId ?? '').slice(0, 240),
    sample: normalizeVoiceLabSample(source.sample),
    speakingStyle: String(source.speakingStyle ?? '').slice(0, 500),
    stability:
      typeof source.stability === 'number' && Number.isFinite(source.stability)
        ? Math.max(0, Math.min(1, source.stability))
        : 0.5,
    status: source.status === 'ready' ? 'ready' : 'draft',
    updatedAt,
  };
}

function normalizeVoiceLabVoices(value: unknown): VoiceLabVoice[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map(normalizeVoiceLabVoice)
    .filter((voice): voice is VoiceLabVoice => Boolean(voice))
    .slice(-200);
}

function normalizeChatMessage(value: unknown): ChatMessage | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const source = value as Partial<ChatMessage>;
  if (
    !source.id ||
    !source.role ||
    (source.role !== 'system' && source.role !== 'user' && source.role !== 'assistant') ||
    typeof source.content !== 'string'
  ) {
    return null;
  }

  return {
    id: String(source.id),
    role: source.role,
    content: source.content,
    createdAt: Number(source.createdAt ?? Date.now()),
  };
}

function normalizeLegacyOpenAiModel(model: string, fallback: string) {
  const normalized = model.trim();
  switch (normalized) {
    case 'gpt-5-mini':
    case 'gpt-5.4-nano':
    case 'gpt-5_4-nano':
    case 'gpt-5.4-mini':
    case 'gpt-5_4-mini':
      return fallback;
    default:
      return normalized;
  }
}

function normalizeAiSettings(value: unknown): AiSettings {
  const defaults = createDefaultAiSettings();

  if (!value || typeof value !== 'object') {
    return defaults;
  }

  const source = value as Partial<AiSettings>;
  const llmProvider =
    source.llmProvider === 'openrouter-responses' || source.llmProvider === 'vercel-gateway'
      ? source.llmProvider
      : defaults.llmProvider;
  const providerDefaults = getAiProviderSwitchDefaults(llmProvider);
  const requestedModel = String(source.model ?? defaults.model);
  const normalizedModel = normalizeLegacyOpenAiModel(requestedModel, providerDefaults.model);
  const requestedMemoryAgentModel = String(
    source.memoryAgentModel ?? defaults.memoryAgentModel,
  ).trim();
  const normalizedMemoryAgentModel = normalizeLegacyOpenAiModel(
    requestedMemoryAgentModel,
    providerDefaults.memoryAgentModel,
  );
  const memoryAgentIntervalMessages =
    typeof source.memoryAgentIntervalMessages === 'number' &&
    Number.isFinite(source.memoryAgentIntervalMessages)
      ? Math.max(1, Math.min(100, Math.round(source.memoryAgentIntervalMessages)))
      : defaults.memoryAgentIntervalMessages;
  const embeddingMode =
    source.embeddingMode === 'auto' ||
    source.embeddingMode === 'browser' ||
    source.embeddingMode === 'provider'
      ? source.embeddingMode
      : defaults.embeddingMode;
  const embeddingModel =
    typeof source.embeddingModel === 'string' &&
    source.embeddingModel.trim() &&
    !isPremiumCostModelId(source.embeddingModel)
      ? source.embeddingModel.trim().slice(0, 160)
      : defaults.embeddingModel;
  const embeddingLocalModel =
    typeof source.embeddingLocalModel === 'string' && source.embeddingLocalModel.trim()
      ? source.embeddingLocalModel.trim().slice(0, 220)
      : defaults.embeddingLocalModel || DEFAULT_LOCAL_EMBEDDING_MODEL;
  const aiTransportMode =
    source.aiTransportMode === 'http-stream' ? source.aiTransportMode : defaults.aiTransportMode;
  const openAiStateMode = defaults.openAiStateMode;
  const toolChoiceMode =
    source.toolChoiceMode === 'required' || source.toolChoiceMode === 'auto'
      ? source.toolChoiceMode
      : defaults.toolChoiceMode;
  const maxToolRounds =
    typeof source.maxToolRounds === 'number' && Number.isFinite(source.maxToolRounds)
      ? Math.max(1, Math.min(30, Math.round(source.maxToolRounds)))
      : defaults.maxToolRounds;
  const playbackRate =
    typeof source.ttsPlaybackRate === 'number' && Number.isFinite(source.ttsPlaybackRate)
      ? Math.max(0.7, Math.min(1.35, source.ttsPlaybackRate))
      : defaults.ttsPlaybackRate;
  const ttsVolume =
    typeof source.ttsVolume === 'number' && Number.isFinite(source.ttsVolume)
      ? Math.max(0, Math.min(2, source.ttsVolume))
      : defaults.ttsVolume;
  const ttsProvider =
    source.ttsProvider === 'fish-speech' || source.ttsProvider === 'inworld'
      ? source.ttsProvider
      : defaults.ttsProvider;
  const fishSpeechLatency =
    source.fishSpeechLatency === 'balanced' || source.fishSpeechLatency === 'normal'
      ? source.fishSpeechLatency
      : defaults.fishSpeechLatency;
  const fishSpeechVoiceScope =
    source.fishSpeechVoiceScope === 'mine' || source.fishSpeechVoiceScope === 'public'
      ? source.fishSpeechVoiceScope
      : defaults.fishSpeechVoiceScope;
  const fishSpeechModel =
    typeof source.fishSpeechModel === 'string' && source.fishSpeechModel.trim()
      ? source.fishSpeechModel.trim() === 's2-pro'
        ? 's2'
        : source.fishSpeechModel.trim()
      : defaults.fishSpeechModel;
  const fishSpeechChunkLength =
    typeof source.fishSpeechChunkLength === 'number' &&
    Number.isFinite(source.fishSpeechChunkLength)
      ? Math.max(100, Math.min(300, Math.round(source.fishSpeechChunkLength)))
      : defaults.fishSpeechChunkLength;
  const inworldBufferCharThreshold =
    typeof source.inworldBufferCharThreshold === 'number' &&
    Number.isFinite(source.inworldBufferCharThreshold)
      ? Math.max(20, Math.min(1000, Math.round(source.inworldBufferCharThreshold)))
      : defaults.inworldBufferCharThreshold;
  const inworldDeliveryMode =
    source.inworldDeliveryMode === 'STABLE' ||
    source.inworldDeliveryMode === 'BALANCED' ||
    source.inworldDeliveryMode === 'CREATIVE'
      ? source.inworldDeliveryMode
      : source.inworldDeliveryMode === 'EXPRESSIVE'
        ? 'CREATIVE'
        : source.inworldDeliveryMode === 'LOW_LATENCY'
          ? 'STABLE'
          : defaults.inworldDeliveryMode;
  const remoteTtsMode =
    source.remoteTtsMode === 'live-bridge' ||
    source.remoteTtsMode === 'full-response' ||
    source.remoteTtsMode === 'sentence-chunks'
      ? source.remoteTtsMode
      : defaults.remoteTtsMode;

  return normalizeLlmProviderCompatibility({
    llmProvider,
    model: normalizedModel,
    memoryAgentModel: normalizedMemoryAgentModel || defaults.memoryAgentModel,
    memoryAgentIntervalMessages,
    embeddingMode,
    embeddingLocalModel,
    embeddingModel,
    aiTransportMode,
    openAiStateMode,
    toolChoiceMode,
    maxToolRounds,
    replyLength: normalizeReplyLengthMode(source.replyLength),
    temperature: typeof source.temperature === 'number' ? source.temperature : defaults.temperature,
    maxTokens: typeof source.maxTokens === 'number' ? source.maxTokens : defaults.maxTokens,
    ttsEnabled: typeof source.ttsEnabled === 'boolean' ? source.ttsEnabled : defaults.ttsEnabled,
    ttsAutoSpeak:
      typeof source.ttsAutoSpeak === 'boolean' ? source.ttsAutoSpeak : defaults.ttsAutoSpeak,
    ttsSimulatedStreaming:
      typeof source.ttsSimulatedStreaming === 'boolean'
        ? source.ttsSimulatedStreaming
        : defaults.ttsSimulatedStreaming,
    ttsExpressionTagsEnabled:
      typeof source.ttsExpressionTagsEnabled === 'boolean'
        ? source.ttsExpressionTagsEnabled
        : defaults.ttsExpressionTagsEnabled,
    ttsProvider,
    remoteTtsMode,
    ttsVoice: String(source.ttsVoice ?? defaults.ttsVoice),
    fishSpeechVoiceId: String(source.fishSpeechVoiceId ?? defaults.fishSpeechVoiceId),
    fishSpeechVoiceScope,
    fishSpeechModel,
    fishSpeechLatency,
    fishSpeechConditionOnPreviousChunks:
      typeof source.fishSpeechConditionOnPreviousChunks === 'boolean'
        ? source.fishSpeechConditionOnPreviousChunks
        : defaults.fishSpeechConditionOnPreviousChunks,
    fishSpeechChunkLength,
    inworldVoiceId: String(source.inworldVoiceId ?? defaults.inworldVoiceId),
    inworldModelId: String(source.inworldModelId ?? defaults.inworldModelId),
    inworldDeliveryMode,
    inworldBufferCharThreshold,
    ttsPlaybackRate: playbackRate,
    ttsVolume,
  });
}

function normalizeRelationshipMemory(value: unknown): RelationshipMemory {
  const defaults = createDefaultRelationshipMemory();

  if (!value || typeof value !== 'object') {
    return defaults;
  }

  const source = value as Partial<RelationshipMemory>;
  const facts = Array.isArray(source.facts)
    ? dedupeFacts(source.facts.map((fact) => String(fact).trim()).filter(Boolean))
    : defaults.facts;
  const diaryEntry = sanitizeDiaryEntry((source as { diaryEntry?: unknown }).diaryEntry);
  const diaryHistory = Array.isArray((source as { diaryHistory?: unknown[] }).diaryHistory)
    ? (source as { diaryHistory: unknown[] }).diaryHistory
        .map((entry) => sanitizeDiaryEntry(entry))
        .filter(Boolean)
        .slice(-3)
    : [];
  const mood = normalizeRelationshipMood((source as { mood?: unknown }).mood);
  const lastActionTag = normalizeRelationshipActionTag(
    (source as { lastActionTag?: unknown }).lastActionTag,
  );
  const trust = clampRelationshipStat(
    Number((source as { trust?: unknown }).trust ?? defaults.trust),
  );
  const attraction = clampRelationshipStat(
    Number((source as { attraction?: unknown }).attraction ?? defaults.attraction),
  );
  const respect = clampRelationshipStat(
    Number((source as { respect?: unknown }).respect ?? defaults.respect),
  );
  const irritation = clampRelationshipStat(
    Number((source as { irritation?: unknown }).irritation ?? defaults.irritation),
  );
  const jealousy = clampRelationshipStat(
    Number((source as { jealousy?: unknown }).jealousy ?? defaults.jealousy),
  );
  const guard = clampRelationshipStat(
    Number((source as { guard?: unknown }).guard ?? defaults.guard),
  );
  const turnCount =
    typeof source.turnCount === 'number' && Number.isFinite(source.turnCount)
      ? Math.max(0, source.turnCount)
      : 0;
  const lastDiaryTurnCountRaw = Number(
    (source as { lastDiaryTurnCount?: unknown }).lastDiaryTurnCount ?? 0,
  );
  const lastDiaryTurnCount = Number.isFinite(lastDiaryTurnCountRaw)
    ? Math.max(0, Math.min(turnCount, Math.round(lastDiaryTurnCountRaw)))
    : 0;
  const next: RelationshipMemory = {
    version: 2,
    turnCount,
    lastSeenAt:
      typeof source.lastSeenAt === 'number' && Number.isFinite(source.lastSeenAt)
        ? source.lastSeenAt
        : null,
    lastDiaryTurnCount,
    relationshipStage: 'new',
    mood,
    trust,
    attraction,
    respect,
    irritation,
    jealousy,
    guard,
    lastActionTag,
    facts,
    summary: String(source.summary ?? defaults.summary).slice(0, 900),
    diaryEntry,
    diaryHistory: appendDiaryHistory(diaryHistory, diaryEntry),
    affectState: normalizeAffectState((source as { affectState?: unknown }).affectState),
  };

  next.relationshipStage = deriveRelationshipStage(next);
  return next;
}

function normalizeRelationshipMemories(value: unknown): Record<string, RelationshipMemory> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const entries: Array<[string, RelationshipMemory]> = [];
  for (const [rawKey, rawMemory] of Object.entries(value as Record<string, unknown>)) {
    const key = rawKey.trim().slice(0, 180);
    if (!key) {
      continue;
    }
    entries.push([key, normalizeRelationshipMemory(rawMemory)]);
  }
  return Object.fromEntries(entries);
}

function normalizeChatHistories(value: unknown): Record<string, ChatMessage[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const entries: Array<[string, ChatMessage[]]> = [];
  for (const [rawKey, rawHistory] of Object.entries(value as Record<string, unknown>)) {
    const key = rawKey.trim().slice(0, 180);
    if (!key || !Array.isArray(rawHistory)) {
      continue;
    }
    const history = rawHistory
      .map(normalizeChatMessage)
      .filter((message): message is ChatMessage => Boolean(message));
    entries.push([key, history.slice(-120)]);
  }
  return Object.fromEntries(entries);
}

function normalizeUiState(value: unknown): UiState {
  const defaults = createDefaultUiState();

  if (!value || typeof value !== 'object') {
    return defaults;
  }

  const source = value as Partial<UiState>;

  return {
    menuOpen: false,
    chatLogOpen:
      typeof source.chatLogOpen === 'boolean' ? source.chatLogOpen : defaults.chatLogOpen,
    chatDraft:
      typeof source.chatDraft === 'string' ? source.chatDraft.slice(0, 4000) : defaults.chatDraft,
  };
}

function normalizeSettingsTab(value: string | null): SettingsTabId {
  switch (value) {
    case 'account':
    case 'anim':
    case 'emotion-telemetry':
    case 'background':
    case 'character':
    case 'ai':
    case 'twitch':
    case 'context':
    case 'tts':
    case 'voice-lab':
    case 'vrm':
      return value;
    default:
      return 'vrm';
  }
}

function normalizeTwitchChannel(value: string | null) {
  const normalized = (value ?? '').trim().toLowerCase().replace(/^#/, '');
  return /^[a-z0-9_]{1,25}$/.test(normalized) ? normalized : '';
}

function clampInteger(value: unknown, fallback: number, min: number, max: number) {
  const next = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.max(min, Math.min(max, next));
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const next = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, next));
}

function normalizeEmotionTelemetryEvent(value: unknown): EmotionTelemetryEvent | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const source = value as Partial<EmotionTelemetryEvent>;
  const id = String(source.id ?? '').trim().slice(0, 160);
  const emotion = String(source.emotion ?? '').trim().slice(0, 80);
  if (!id || !emotion) {
    return null;
  }
  const expressionAccepted =
    typeof source.expressionAccepted === 'boolean' ? source.expressionAccepted : null;
  const animationAccepted =
    typeof source.animationAccepted === 'boolean' ? source.animationAccepted : null;
  const resolvedExpressionNames = Array.isArray(source.resolvedExpressionNames)
    ? source.resolvedExpressionNames
        .map((name) => String(name).trim().slice(0, 80))
        .filter(Boolean)
        .slice(0, 8)
    : [];
  return {
    affectArousal: clampNumber(source.affectArousal, 0, -1, 1),
    affectDominance: clampNumber(source.affectDominance, 0, -1, 1),
    affectLabel: String(source.affectLabel ?? 'neutral').trim().slice(0, 80) || 'neutral',
    affectValence: clampNumber(source.affectValence, 0, -1, 1),
    animationAccepted,
    animationId:
      typeof source.animationId === 'string' && source.animationId.trim()
        ? source.animationId.trim().slice(0, 160)
        : null,
    animationIndex: clampInteger(source.animationIndex, -1, -1, 10000),
    animationName:
      typeof source.animationName === 'string' && source.animationName.trim()
        ? source.animationName.trim().slice(0, 160)
        : null,
    animationReason: String(source.animationReason ?? '').trim().slice(0, 160),
    appliedIntensity: clampNumber(source.appliedIntensity, 0, 0, 1),
    createdAt: clampInteger(source.createdAt, Date.now(), 0, Number.MAX_SAFE_INTEGER),
    emotion,
    expressionAccepted,
    expressionReason: String(source.expressionReason ?? '').trim().slice(0, 160),
    id,
    metadataArousal: clampNumber(source.metadataArousal, 0, -1, 1),
    metadataDominance: clampNumber(source.metadataDominance, 0, -1, 1),
    metadataValence: clampNumber(source.metadataValence, 0, -1, 1),
    requestedDurationMs: clampInteger(source.requestedDurationMs, 0, 0, 60000),
    requestedExpression: String(source.requestedExpression ?? '').trim().slice(0, 80),
    requestedIntensity: clampNumber(source.requestedIntensity, 0, 0, 1),
    resolvedExpressionNames,
  };
}

function normalizeEmotionTelemetryEvents(value: unknown): EmotionTelemetryEvent[] {
  return Array.isArray(value)
    ? value
        .map(normalizeEmotionTelemetryEvent)
        .filter((event): event is EmotionTelemetryEvent => Boolean(event))
        .slice(0, 20)
    : [];
}

function normalizeTwitchSettings(value: unknown): TwitchSettings {
  const defaults = createDefaultTwitchSettings();
  if (!value || typeof value !== 'object') {
    return defaults;
  }

  const source = value as Partial<TwitchSettings>;
  const localDisplayName = String(source.localDisplayName ?? defaults.localDisplayName)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);

  return {
    aiEnabled: typeof source.aiEnabled === 'boolean' ? source.aiEnabled : defaults.aiEnabled,
    batchFastWaitMs: clampInteger(source.batchFastWaitMs, defaults.batchFastWaitMs, 5000, 120000),
    batchHighSize: clampInteger(source.batchHighSize, defaults.batchHighSize, 1, 200),
    batchLowSize: clampInteger(source.batchLowSize, defaults.batchLowSize, 1, 200),
    batchMaxSize: clampInteger(source.batchMaxSize, defaults.batchMaxSize, 1, 300),
    batchMidSize: clampInteger(source.batchMidSize, defaults.batchMidSize, 1, 200),
    batchWaitMs: clampInteger(source.batchWaitMs, defaults.batchWaitMs, 5000, 120000),
    commandsEnabled:
      typeof source.commandsEnabled === 'boolean'
        ? source.commandsEnabled
        : defaults.commandsEnabled,
    contextLimit: clampInteger(source.contextLimit, defaults.contextLimit, 10, 300),
    directChatterLimit: clampInteger(
      source.directChatterLimit,
      defaults.directChatterLimit,
      0,
      250,
    ),
    localDisplayName: localDisplayName || defaults.localDisplayName,
    localTrustedControls:
      typeof source.localTrustedControls === 'boolean'
        ? source.localTrustedControls
        : defaults.localTrustedControls,
    maxBatchMessages: clampInteger(source.maxBatchMessages, defaults.maxBatchMessages, 10, 500),
    maxPendingJobs: clampInteger(source.maxPendingJobs, defaults.maxPendingJobs, 1, 50),
    mentionRequiredUnderThreshold:
      typeof source.mentionRequiredUnderThreshold === 'boolean'
        ? source.mentionRequiredUnderThreshold
        : defaults.mentionRequiredUnderThreshold,
    replyGapMs: clampInteger(source.replyGapMs, defaults.replyGapMs, 0, 30000),
    streamTranscriptionContextLimit: clampInteger(
      source.streamTranscriptionContextLimit,
      defaults.streamTranscriptionContextLimit,
      1,
      20,
    ),
    streamTranscriptionEnabled:
      typeof source.streamTranscriptionEnabled === 'boolean'
        ? source.streamTranscriptionEnabled
        : defaults.streamTranscriptionEnabled,
    streamTranscriptionIntervalSeconds: clampInteger(
      source.streamTranscriptionIntervalSeconds,
      defaults.streamTranscriptionIntervalSeconds,
      30,
      600,
    ),
    streamTranscriptionModel: normalizeTwitchStreamTranscriptionModel(
      source.streamTranscriptionModel,
    ),
    streamTranscriptionSampleSeconds: clampInteger(
      source.streamTranscriptionSampleSeconds,
      defaults.streamTranscriptionSampleSeconds,
      5,
      60,
    ),
    streamModeEnabled:
      typeof source.streamModeEnabled === 'boolean'
        ? source.streamModeEnabled
        : defaults.streamModeEnabled,
    streamVisionContextEnabled:
      typeof source.streamVisionContextEnabled === 'boolean'
        ? source.streamVisionContextEnabled
        : defaults.streamVisionContextEnabled,
    streamVisionDetail:
      source.streamVisionDetail === 'auto' ||
      source.streamVisionDetail === 'high' ||
      source.streamVisionDetail === 'low'
        ? source.streamVisionDetail
        : defaults.streamVisionDetail,
    streamVisionIntervalSeconds: clampInteger(
      source.streamVisionIntervalSeconds,
      defaults.streamVisionIntervalSeconds,
      30,
      600,
    ),
    streamVisionMaxAgeSeconds: clampInteger(
      source.streamVisionMaxAgeSeconds,
      defaults.streamVisionMaxAgeSeconds,
      15,
      600,
    ),
  };
}

function normalizeHexColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : fallback;
}

function normalizeBoundedString(value: unknown, fallback: string, maxLength: number): string {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim();
  return normalized.slice(0, maxLength);
}

function normalizeVisualSettings(value: unknown): VisualSettings {
  const defaults = createDefaultVisualSettings();

  if (!value || typeof value !== 'object') {
    return defaults;
  }

  const source = value as Partial<VisualSettings>;
  const numericKeys: Array<keyof VisualSettings> = [
    'cameraVerticalOffset',
    'cameraOffsetX',
    'cameraOffsetY',
    'cameraOffsetZ',
    'cameraTargetOffsetX',
    'cameraTargetOffsetY',
    'cameraTargetOffsetZ',
    'cameraFov',
    'modelPositionX',
    'modelPositionZ',
    'modelRotationX',
    'modelRotationY',
    'modelRotationZ',
    'modelVerticalOffset',
    'modelScale',
    'blinkInterval',
    'blinkIntensity',
    'gazeIntensity',
    'gazeHeadFollow',
    'gazeHeadDrift',
    'gazeEyeMotion',
    'gazeAudienceYOffset',
    'armClipGuardStrength',
    'armClipTorsoRadius',
    'crossfadeDuration',
    'outlineAlpha',
    'outlineThickness',
    'sceneExposure',
    'colorPowR',
    'colorPowG',
    'colorPowB',
    'pbrClearcoat',
    'pbrClearcoatRoughness',
    'pbrEnvMapIntensity',
    'pbrMetalness',
    'pbrRoughness',
    'pbrSpecularIntensity',
    'mtoonGiEqualization',
    'mtoonRimFresnel',
    'mtoonRimLift',
    'mtoonRimLightingMix',
    'mtoonShadeShift',
    'mtoonToony',
    'keyLight',
    'fillLight',
    'rimLight',
    'hemiLight',
    'ambientLight',
  ];
  const booleanKeys: Array<keyof VisualSettings> = [
    'realisticMode',
    'autoBlink',
    'autoGaze',
    'gazePointerFollow',
    'armClipGuard',
    'outline',
    'colorCorr',
    'mtoonTuning',
  ];

  const next = { ...defaults };

  numericKeys.forEach((key) => {
    if (typeof source[key] === 'number') {
      (next[key] as number) = source[key] as number;
    }
  });

  booleanKeys.forEach((key) => {
    if (typeof source[key] === 'boolean') {
      (next[key] as boolean) = source[key] as boolean;
    }
  });

  if (source.cameraViewMode === 'full-body' || source.cameraViewMode === 'half-body') {
    next.cameraViewMode = source.cameraViewMode;
  }
  if (source.cameraRigMode === 'locked' || source.cameraRigMode === 'custom') {
    next.cameraRigMode = source.cameraRigMode;
  }
  if (
    source.sceneBackgroundMode === 'persona' ||
    source.sceneBackgroundMode === 'custom' ||
    source.sceneBackgroundMode === 'chroma' ||
    source.sceneBackgroundMode === 'transparent'
  ) {
    next.sceneBackgroundMode = source.sceneBackgroundMode;
  }
  next.sceneBackgroundImage = normalizeBoundedString(
    source.sceneBackgroundImage,
    defaults.sceneBackgroundImage,
    2048,
  );
  next.sceneBackgroundOverlay = normalizeBoundedString(
    source.sceneBackgroundOverlay,
    defaults.sceneBackgroundOverlay,
    512,
  );
  next.sceneBackgroundFilter = normalizeBoundedString(
    source.sceneBackgroundFilter,
    defaults.sceneBackgroundFilter,
    256,
  );
  next.sceneChromaColor = normalizeHexColor(source.sceneChromaColor, defaults.sceneChromaColor);
  next.outlineColor = normalizeHexColor(source.outlineColor, defaults.outlineColor);
  next.mtoonRimColor = normalizeHexColor(source.mtoonRimColor, defaults.mtoonRimColor);
  next.mtoonShadeColor = normalizeHexColor(source.mtoonShadeColor, defaults.mtoonShadeColor);
  next.cameraVerticalOffset = Math.max(-0.9, Math.min(0.9, next.cameraVerticalOffset));
  next.cameraOffsetX = Math.max(-3, Math.min(3, next.cameraOffsetX));
  next.cameraOffsetY = Math.max(-1.5, Math.min(1.5, next.cameraOffsetY));
  next.cameraOffsetZ = Math.max(-4, Math.min(4, next.cameraOffsetZ));
  next.cameraTargetOffsetX = Math.max(-3, Math.min(3, next.cameraTargetOffsetX));
  next.cameraTargetOffsetY = Math.max(-1.5, Math.min(1.5, next.cameraTargetOffsetY));
  next.cameraTargetOffsetZ = Math.max(-4, Math.min(4, next.cameraTargetOffsetZ));
  next.cameraFov = Math.max(18, Math.min(70, next.cameraFov));
  next.modelPositionX = Math.max(-3, Math.min(3, next.modelPositionX));
  next.modelPositionZ = Math.max(-3, Math.min(3, next.modelPositionZ));
  next.modelRotationX = Math.max(-45, Math.min(45, next.modelRotationX));
  next.modelRotationY = Math.max(-180, Math.min(180, next.modelRotationY));
  next.modelRotationZ = Math.max(-45, Math.min(45, next.modelRotationZ));
  next.modelVerticalOffset = Math.max(-2, Math.min(2, next.modelVerticalOffset));
  next.modelScale = Math.max(0.25, Math.min(4, next.modelScale));
  next.blinkInterval = Math.max(1.5, Math.min(10, next.blinkInterval));
  next.blinkIntensity = Math.max(0, Math.min(1, next.blinkIntensity));
  next.gazeIntensity = Math.max(0, Math.min(1, next.gazeIntensity));
  next.gazeHeadFollow = Math.max(0, Math.min(1, next.gazeHeadFollow));
  next.gazeHeadDrift = Math.max(0, Math.min(1, next.gazeHeadDrift));
  next.gazeEyeMotion = Math.max(0, Math.min(1, next.gazeEyeMotion));
  next.gazeAudienceYOffset = Math.max(-0.25, Math.min(0.15, next.gazeAudienceYOffset));
  next.armClipGuardStrength = Math.max(0, Math.min(1, next.armClipGuardStrength));
  next.armClipTorsoRadius = Math.max(0.08, Math.min(0.55, next.armClipTorsoRadius));
  next.outlineAlpha = Math.max(0, Math.min(1, next.outlineAlpha));
  next.outlineThickness = Math.max(0.0005, Math.min(0.02, next.outlineThickness));
  next.sceneExposure = Math.max(0.35, Math.min(1.8, next.sceneExposure));
  next.colorPowR = Math.max(0.6, Math.min(2.4, next.colorPowR));
  next.colorPowG = Math.max(0.6, Math.min(2.4, next.colorPowG));
  next.colorPowB = Math.max(0.6, Math.min(2.4, next.colorPowB));
  next.pbrClearcoat = Math.max(0, Math.min(1, next.pbrClearcoat));
  next.pbrClearcoatRoughness = Math.max(0, Math.min(1, next.pbrClearcoatRoughness));
  next.pbrEnvMapIntensity = Math.max(0, Math.min(3, next.pbrEnvMapIntensity));
  next.pbrMetalness = Math.max(0, Math.min(1, next.pbrMetalness));
  next.pbrRoughness = Math.max(0, Math.min(1, next.pbrRoughness));
  next.pbrSpecularIntensity = Math.max(0, Math.min(1, next.pbrSpecularIntensity));
  next.mtoonGiEqualization = Math.max(0, Math.min(1, next.mtoonGiEqualization));
  next.mtoonRimFresnel = Math.max(0.1, Math.min(10, next.mtoonRimFresnel));
  next.mtoonRimLift = Math.max(0, Math.min(1, next.mtoonRimLift));
  next.mtoonRimLightingMix = Math.max(0, Math.min(1, next.mtoonRimLightingMix));
  next.mtoonShadeShift = Math.max(-1, Math.min(1, next.mtoonShadeShift));
  next.mtoonToony = Math.max(0, Math.min(1, next.mtoonToony));

  return next;
}

function inferAnimationFormat(url: string): AnimationFormat {
  const cleanUrl = url.split('?')[0]?.split('#')[0]?.toLowerCase() ?? '';
  if (cleanUrl.endsWith('.vrma')) return 'vrma';
  if (cleanUrl.endsWith('.bvh')) return 'bvh';
  if (cleanUrl.endsWith('.glb')) return 'glb';
  if (cleanUrl.endsWith('.gltf')) return 'gltf';
  return 'fbx';
}

function normalizeAnimationFormat(value: unknown, url: string): AnimationFormat {
  switch (value) {
    case 'fbx':
    case 'glb':
    case 'gltf':
    case 'vrma':
    case 'bvh':
      return value;
    default:
      return inferAnimationFormat(url);
  }
}

function normalizeAnimationPurpose(value: unknown): AnimationPurpose {
  switch (value) {
    case 'ambient':
    case 'gesture':
    case 'emotion':
    case 'movement':
    case 'pose':
      return value;
    default:
      return 'gesture';
  }
}

function normalizeAnimationTags(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => String(item).trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 20),
    ),
  );
}

function isRejectedGeneratedAnimation(id: string, url: string, format: AnimationFormat): boolean {
  const cleanUrl = url.split('?')[0]?.split('#')[0]?.toLowerCase() ?? '';
  const retiredDipBvh =
    id.startsWith('dip-') &&
    format === 'bvh' &&
    cleanUrl.startsWith('/assets/animations/dip/dip_') &&
    cleanUrl.endsWith('.bvh');
  const retiredDipVrma =
    id.startsWith('dip-vrma-') &&
    format === 'vrma' &&
    cleanUrl.startsWith('/assets/animations/dip/vrma/') &&
    cleanUrl.endsWith('.vrma');
  return retiredDipBvh || retiredDipVrma;
}

function normalizeAnimationEntry(value: unknown): AnimationEntry | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const source = value as Partial<AnimationEntry>;
  if (!source.id || !source.name || !source.url) {
    return null;
  }

  const url = String(source.url);
  if (url.startsWith('blob:')) {
    return null;
  }

  const id = String(source.id);
  const format = normalizeAnimationFormat(source.format, url);
  if (isRejectedGeneratedAnimation(id, url, format)) {
    return null;
  }

  return {
    id,
    name: String(source.name),
    url,
    format,
    enabled: typeof source.enabled === 'boolean' ? source.enabled : true,
    experimental: typeof source.experimental === 'boolean' ? source.experimental : false,
    loopEligible:
      typeof source.loopEligible === 'boolean'
        ? source.loopEligible
        : normalizeAnimationPurpose(source.purpose) === 'ambient',
    weight:
      typeof source.weight === 'number' && Number.isFinite(source.weight)
        ? source.weight
        : undefined,
    purpose: normalizeAnimationPurpose(source.purpose),
    tags: normalizeAnimationTags(source.tags),
  };
}

function clampAnimationWeight(value: number) {
  return Math.min(4, Math.max(0.05, value));
}

function normalizeSequencerSettings(value: unknown) {
  const defaults = createDefaultSequencerSettings();

  if (!value || typeof value !== 'object') {
    return defaults;
  }

  const source = value as Partial<PersistedChatState['sequencerSettings']>;
  const persistedPlaylist = Array.isArray(source.playlist)
    ? source.playlist
        .map(normalizeAnimationEntry)
        .filter((entry): entry is AnimationEntry => Boolean(entry))
    : [];

  const rawPlaylist = Array.isArray(source.playlist)
    ? source.playlist
        .map((entry) => entry as Partial<AnimationEntry> | null)
        .filter(
          (entry): entry is Partial<AnimationEntry> & { id: string } =>
            entry !== null && typeof entry === 'object' && typeof entry.id === 'string',
        )
    : [];
  const rawPersistedById = new Map(rawPlaylist.map((entry) => [String(entry.id), entry]));
  const persistedById = new Map(persistedPlaylist.map((entry) => [entry.id, entry]));
  const mergedDefaults = DEFAULT_ANIMATIONS.map((entry) => {
    const persisted = persistedById.get(entry.id);
    const rawPersisted = rawPersistedById.get(entry.id);
    const merged = persisted
      ? {
          ...entry,
          enabled: persisted.enabled,
          loopEligible:
            typeof rawPersisted?.loopEligible === 'boolean'
              ? persisted.loopEligible
              : entry.loopEligible,
          weight:
            typeof rawPersisted?.weight === 'number' && Number.isFinite(rawPersisted.weight)
              ? clampAnimationWeight(rawPersisted.weight)
              : entry.weight,
          purpose: typeof rawPersisted?.purpose === 'string' ? persisted.purpose : entry.purpose,
          tags: Array.isArray(rawPersisted?.tags) ? persisted.tags : entry.tags,
        }
      : { ...entry };
    return entry.id === 'idle' && entry.url.endsWith('/Idle.fbx')
      ? { ...merged, enabled: false }
      : merged;
  });

  const extraPersisted = persistedPlaylist.filter(
    (entry) => !mergedDefaults.some((defaultEntry) => defaultEntry.id === entry.id),
  );

  const playlist = [...mergedDefaults, ...extraPersisted];
  const currentIndex =
    typeof source.currentIndex === 'number' &&
    source.currentIndex >= -1 &&
    source.currentIndex < playlist.length
      ? source.currentIndex
      : -1;

  return {
    playing: typeof source.playing === 'boolean' ? source.playing : defaults.playing,
    shuffle: typeof source.shuffle === 'boolean' ? source.shuffle : defaults.shuffle,
    loop: typeof source.loop === 'boolean' ? source.loop : defaults.loop,
    speed: typeof source.speed === 'number' ? source.speed : defaults.speed,
    duration: typeof source.duration === 'number' ? source.duration : defaults.duration,
    currentIndex,
    playlist,
  };
}

function isLegacyDefaultPersona(persona: PersonaProfile) {
  return (
    persona.id === DEFAULT_PERSONA.id &&
    (persona.name.trim().toLowerCase() === 'wifey' ||
      persona.systemPrompt.includes('You are Wifey'))
  );
}

function isLegacyHikariPersona(persona: PersonaProfile) {
  return (
    persona.id === 'hikari-jen' ||
    persona.name.trim().toLowerCase() === 'hikari-jen' ||
    persona.systemPrompt.includes('Hikari-jen') ||
    persona.systemPrompt.includes('HickeyC')
  );
}

function mergeBuiltInPersonas(
  persistedPersonas: PersonaProfile[],
  defaultPersonas: PersonaProfile[],
) {
  const persistedById = new Map(persistedPersonas.map((persona) => [persona.id, persona]));
  const builtInIds = new Set(defaultPersonas.map((persona) => persona.id));

  const mergedBuiltIns = defaultPersonas.map((defaultPersona) => {
    const persistedPersona =
      persistedById.get(defaultPersona.id) ??
      (defaultPersona.id === HIKARI_PERSONA.id ? persistedById.get('hikari-jen') : undefined);
    if (!persistedPersona) {
      return { ...defaultPersona };
    }

    if (isLegacyDefaultPersona(persistedPersona)) {
      return {
        ...DEFAULT_PERSONA,
        userNickname: persistedPersona.userNickname ?? '',
      };
    }

    if (defaultPersona.id === HIKARI_PERSONA.id && isLegacyHikariPersona(persistedPersona)) {
      return {
        ...HIKARI_PERSONA,
        userNickname: persistedPersona.userNickname ?? '',
      };
    }

    return persistedPersona;
  });

  const customPersonas = persistedPersonas.filter(
    (persona) => !builtInIds.has(persona.id) && !isLegacyHikariPersona(persona),
  );
  return [...mergedBuiltIns, ...customPersonas];
}

export function createDefaultPersistedChatState(): PersistedChatState {
  const defaultPersonas = createDefaultPersonas();
  const defaultActivePersonaId = defaultPersonas[0]?.id ?? '';
  return {
    personas: defaultPersonas,
    activePersonaId: defaultActivePersonaId,
    aiSettings: createDefaultAiSettings(),
    chatHistory: [],
    chatHistories: {},
    relationshipMemory: createDefaultRelationshipMemory(),
    relationshipMemories: {},
    personaVoiceBindings: createDefaultPersonaVoiceBindings(),
    voiceLabVoices: [],
    uiState: createDefaultUiState(),
    activeTab: 'vrm',
    currentBundledModelId: 'neuro-sama',
    currentCustomVrmModelId: '',
    twitchChannel: '',
    twitchSettings: createDefaultTwitchSettings(),
    emotionTelemetryEvents: [],
    sequencerSettings: createDefaultSequencerSettings(),
    visualSettings: createDefaultVisualSettings(),
  };
}

export function normalizePersistedChatStateSnapshot(value: unknown): PersistedChatState {
  const defaults = createDefaultPersistedChatState();
  if (!value || typeof value !== 'object') {
    return defaults;
  }

  const source = value as Partial<PersistedChatState>;
  const defaultPersonas = createDefaultPersonas();
  const personas = Array.isArray(source.personas)
    ? source.personas
        .map(normalizePersonaProfile)
        .filter((persona): persona is PersonaProfile => Boolean(persona))
    : [];
  const nextPersonas =
    personas.length > 0
      ? mergeBuiltInPersonas(personas, defaultPersonas)
      : defaultPersonas.map((persona) => ({ ...persona }));
  const requestedActivePersonaId =
    typeof source.activePersonaId === 'string' && source.activePersonaId.trim()
      ? source.activePersonaId.trim()
      : (nextPersonas[0]?.id ?? defaults.activePersonaId);
  const activePersonaId = nextPersonas.some((persona) => persona.id === requestedActivePersonaId)
    ? requestedActivePersonaId
    : (nextPersonas[0]?.id ?? defaults.activePersonaId);
  const persistedPersonaVoiceBindings = normalizePersonaVoiceBindings(source.personaVoiceBindings);
  const currentBundledModelId =
    typeof source.currentBundledModelId === 'string' && source.currentBundledModelId.trim()
      ? source.currentBundledModelId.trim()
      : defaults.currentBundledModelId;
  const currentCustomVrmModelId =
    typeof source.currentCustomVrmModelId === 'string' &&
    /^custom-vrm-[a-z0-9-]+$/i.test(source.currentCustomVrmModelId.trim())
      ? source.currentCustomVrmModelId.trim()
      : '';

  return {
    personas: nextPersonas,
    activePersonaId,
    aiSettings: normalizeAiSettings(source.aiSettings),
    chatHistory: Array.isArray(source.chatHistory)
      ? source.chatHistory
          .map(normalizeChatMessage)
          .filter((message): message is ChatMessage => Boolean(message))
      : [],
    chatHistories: normalizeChatHistories(source.chatHistories),
    relationshipMemory: normalizeRelationshipMemory(source.relationshipMemory),
    relationshipMemories: normalizeRelationshipMemories(source.relationshipMemories),
    personaVoiceBindings: {
      ...createDefaultPersonaVoiceBindings(),
      ...persistedPersonaVoiceBindings,
    },
    voiceLabVoices: normalizeVoiceLabVoices(source.voiceLabVoices),
    uiState: normalizeUiState(source.uiState),
    activeTab: normalizeSettingsTab(typeof source.activeTab === 'string' ? source.activeTab : null),
    currentBundledModelId,
    currentCustomVrmModelId,
    twitchChannel: normalizeTwitchChannel(
      typeof source.twitchChannel === 'string' ? source.twitchChannel : null,
    ),
    twitchSettings: normalizeTwitchSettings(source.twitchSettings),
    emotionTelemetryEvents: normalizeEmotionTelemetryEvents(source.emotionTelemetryEvents),
    sequencerSettings: normalizeSequencerSettings(source.sequencerSettings),
    visualSettings: normalizeVisualSettings(source.visualSettings),
  };
}

export async function loadPersistedChatState(): Promise<PersistedChatState> {
  const defaults = createDefaultPersistedChatState();
  const defaultPersonas = defaults.personas;
  const defaultActivePersonaId = defaults.activePersonaId;

  try {
    const [
      personasRaw,
      activePersonaIdRaw,
      aiSettingsRaw,
      chatHistoryRaw,
      relationshipMemoryRaw,
      relationshipMemoriesRaw,
      chatHistoriesRaw,
      personaVoiceBindingsRaw,
      voiceLabVoicesRaw,
      uiStateRaw,
      activeTabRaw,
      currentBundledModelIdRaw,
      currentCustomVrmModelIdRaw,
      twitchChannelRaw,
      twitchSettingsRaw,
      emotionTelemetryEventsRaw,
      sequencerSettingsRaw,
      visualSettingsRaw,
    ] = await Promise.all([
      getPersistedItem(STORAGE_KEYS.personas),
      getPersistedItem(STORAGE_KEYS.activePersonaId),
      getPersistedItem(STORAGE_KEYS.aiSettings),
      getPersistedItem(STORAGE_KEYS.chatHistory),
      getPersistedItem(STORAGE_KEYS.relationshipMemory),
      getPersistedItem(STORAGE_KEYS.relationshipMemories),
      getPersistedItem(STORAGE_KEYS.chatHistories),
      getPersistedItem(STORAGE_KEYS.personaVoiceBindings),
      getPersistedItem(STORAGE_KEYS.voiceLabVoices),
      getPersistedItem(STORAGE_KEYS.uiState),
      getPersistedItem(STORAGE_KEYS.activeTab),
      getPersistedItem(STORAGE_KEYS.currentBundledModelId),
      getPersistedItem(STORAGE_KEYS.currentCustomVrmModelId),
      getPersistedItem(STORAGE_KEYS.twitchChannel),
      getPersistedItem(STORAGE_KEYS.twitchSettings),
      getPersistedItem(STORAGE_KEYS.emotionTelemetryEvents),
      getPersistedItem(STORAGE_KEYS.sequencerSettings),
      getPersistedItem(STORAGE_KEYS.visualSettings),
    ]);

    const personas =
      safeParse<unknown[]>(personasRaw, [])
        .map(normalizePersonaProfile)
        .filter((value): value is PersonaProfile => Boolean(value)) || [];

    const aiSettings = normalizeAiSettings(safeParse(aiSettingsRaw, null));
    const chatHistory = safeParse<unknown[]>(chatHistoryRaw, [])
      .map(normalizeChatMessage)
      .filter((value): value is ChatMessage => Boolean(value));
    const chatHistories = normalizeChatHistories(safeParse(chatHistoriesRaw, null));
    const relationshipMemory = normalizeRelationshipMemory(safeParse(relationshipMemoryRaw, null));
    const relationshipMemories = normalizeRelationshipMemories(
      safeParse(relationshipMemoriesRaw, null),
    );
    const persistedPersonaVoiceBindings = normalizePersonaVoiceBindings(
      safeParse(personaVoiceBindingsRaw, null),
    );
    const voiceLabVoices = normalizeVoiceLabVoices(safeParse(voiceLabVoicesRaw, null));
    const uiState = normalizeUiState(safeParse(uiStateRaw, null));
    const activeTab = normalizeSettingsTab(activeTabRaw);
    const currentBundledModelId =
      typeof currentBundledModelIdRaw === 'string' && currentBundledModelIdRaw.trim().length > 0
        ? currentBundledModelIdRaw
        : defaults.currentBundledModelId;
    const currentCustomVrmModelId =
      typeof currentCustomVrmModelIdRaw === 'string' &&
      /^custom-vrm-[a-z0-9-]+$/i.test(currentCustomVrmModelIdRaw.trim())
        ? currentCustomVrmModelIdRaw.trim()
        : '';
    const twitchChannel = normalizeTwitchChannel(twitchChannelRaw);
    const twitchSettings = normalizeTwitchSettings(safeParse(twitchSettingsRaw, null));
    const emotionTelemetryEvents = normalizeEmotionTelemetryEvents(
      safeParse(emotionTelemetryEventsRaw, null),
    );
    const sequencerSettings = normalizeSequencerSettings(safeParse(sequencerSettingsRaw, null));
    const visualSettings = normalizeVisualSettings(safeParse(visualSettingsRaw, null));

    const nextPersonas =
      personas.length > 0
        ? mergeBuiltInPersonas(personas, defaultPersonas)
        : defaultPersonas.map((persona) => ({ ...persona }));
    const requestedActivePersonaId =
      activePersonaIdRaw ?? nextPersonas[0]?.id ?? defaultActivePersonaId;
    const activePersonaId = nextPersonas.some((persona) => persona.id === requestedActivePersonaId)
      ? requestedActivePersonaId
      : (nextPersonas[0]?.id ?? defaultActivePersonaId);
    const personaVoiceBindings = {
      ...createDefaultPersonaVoiceBindings(),
      ...persistedPersonaVoiceBindings,
    };

    return {
      personas: nextPersonas,
      activePersonaId,
      aiSettings,
      chatHistory,
      chatHistories,
      relationshipMemory,
      relationshipMemories,
      personaVoiceBindings,
      voiceLabVoices,
      uiState,
      activeTab,
      currentBundledModelId,
      currentCustomVrmModelId,
      twitchChannel,
      twitchSettings,
      emotionTelemetryEvents,
      sequencerSettings,
      visualSettings,
    };
  } catch {
    return defaults;
  }
}

export async function savePersistedChatState(state: PersistedChatState) {
  const normalizedState = normalizePersistedChatStateSnapshot(state);
  const fallbackActivePersonaId =
    normalizedState.personas[0]?.id ?? createDefaultPersonas()[0]?.id ?? '';
  const activePersonaId =
    typeof normalizedState.activePersonaId === 'string' &&
    normalizedState.activePersonaId.trim().length > 0
      ? normalizedState.activePersonaId
      : fallbackActivePersonaId;

  const entries = [
    [STORAGE_KEYS.personas, JSON.stringify(normalizedState.personas)],
    [STORAGE_KEYS.activePersonaId, activePersonaId],
    [STORAGE_KEYS.aiSettings, JSON.stringify(normalizedState.aiSettings)],
    [STORAGE_KEYS.chatHistory, JSON.stringify(normalizedState.chatHistory)],
    [STORAGE_KEYS.chatHistories, JSON.stringify(normalizedState.chatHistories)],
    [STORAGE_KEYS.relationshipMemory, JSON.stringify(normalizedState.relationshipMemory)],
    [STORAGE_KEYS.relationshipMemories, JSON.stringify(normalizedState.relationshipMemories)],
    [STORAGE_KEYS.personaVoiceBindings, JSON.stringify(normalizedState.personaVoiceBindings)],
    [STORAGE_KEYS.voiceLabVoices, JSON.stringify(normalizedState.voiceLabVoices)],
    [STORAGE_KEYS.uiState, JSON.stringify(normalizedState.uiState)],
    [STORAGE_KEYS.activeTab, normalizedState.activeTab],
    [STORAGE_KEYS.currentBundledModelId, normalizedState.currentBundledModelId],
    [STORAGE_KEYS.currentCustomVrmModelId, normalizedState.currentCustomVrmModelId],
    [STORAGE_KEYS.twitchChannel, normalizeTwitchChannel(normalizedState.twitchChannel)],
    [
      STORAGE_KEYS.twitchSettings,
      JSON.stringify(normalizeTwitchSettings(normalizedState.twitchSettings)),
    ],
    [
      STORAGE_KEYS.emotionTelemetryEvents,
      JSON.stringify(normalizedState.emotionTelemetryEvents.slice(0, 20)),
    ],
    [
      STORAGE_KEYS.sequencerSettings,
      JSON.stringify({
        ...normalizedState.sequencerSettings,
        playlist: normalizedState.sequencerSettings.playlist.filter(
          (entry) => !entry.url.startsWith('blob:'),
        ),
      }),
    ],
    [STORAGE_KEYS.visualSettings, JSON.stringify(normalizedState.visualSettings)],
  ] as const;

  await Promise.all(
    entries.map(([key, value]) => {
      if (!key || typeof value !== 'string') {
        throw new Error(`Invalid chat persistence entry for key "${String(key)}"`);
      }

      return setPersistedItem(key, value);
    }),
  );
}
