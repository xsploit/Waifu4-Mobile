import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent } from 'react';
import { ChatBar } from './components/chat/ChatBar';
import { ChatLog } from './components/chat/ChatLog';
import { VrmStage } from './components/VrmStage';
import { MenuFab } from './components/menu/MenuFab';
import { SettingsPanel } from './components/menu/SettingsPanel';
import {
  DEFAULT_AI_GATEWAY_MODEL,
  DEFAULT_LOCAL_EMBEDDING_MODEL,
  DEFAULT_OPENROUTER_EMBEDDING_MODEL,
  DEFAULT_OPENROUTER_MODEL,
  DEFAULT_PERSONA,
  createDefaultAiSettings,
  createDefaultPersonaVoiceBindings,
  createDefaultRelationshipMemory,
  createDefaultPersonas,
  createDefaultTwitchSettings,
  createDefaultUiState,
} from './lib/chat/defaults';
import {
  filterSafeProviderModels,
  getAiProviderSwitchDefaults,
  getProviderFallbackModels,
  isPremiumCostModelId,
} from './lib/chat/provider-defaults';
import { extractSpeakableChunks, getChunkRevealDelay } from './lib/chat/chunking';
import { findOverlappingSuffix } from './lib/chat/streaming-overlap';
import {
  buildMemoryAgentMessages,
  MEMORY_AGENT_JSON_FORMAT,
  addMemoryAgentPendingChatTurns,
  clearMemoryAgentPendingChatTurns,
  consumeMemoryAgentPendingChatTurns,
  getMemoryAgentCadenceDecision,
  getMemoryAgentModelCandidates,
  normalizeMemoryAgentIntervalMessages,
  shouldRunMemoryAgent,
} from './lib/chat/memory-agent';
import type {
  MemoryEmbeddingDebugSnapshot,
  MemoryPromptDebugSnapshot,
  MemoryWorkerDebugSnapshot,
} from './lib/chat/memory-debug';
import { updateRelationshipMemory } from './lib/chat/memory';
import {
  buildGrilloMemoryPromptAdditionsFailClosedAsync,
  clearGrilloMemoryStateAsync,
  createDefaultGrilloMemoryState,
  getGrilloParticipantKey,
  hydrateGrilloMemoryState,
  recordGrilloMemoryTurnFailClosedAsync,
  type GrilloMemoryState,
} from './lib/chat/grillo-memory';
import {
  deleteLadybugRelationshipMemory,
  loadLadybugGrilloContextPacket,
  loadLadybugGrilloRuntimeStatus,
  loadLadybugMemoryGraph,
  loadLadybugMemoryStatus,
  loadLadybugRelationshipMemories,
  runLadybugGrilloTick,
  saveLadybugGrilloTurnPair,
  saveLadybugRelationshipMemories,
  type LadybugGrilloRuntimeStatus,
  type LadybugGrilloTurnPairInput,
  type LadybugMemoryGraphSummary,
  type LadybugMemoryStatus,
} from './lib/chat/ladybug-memory-client';
import {
  extractGrilloWorkerRelationshipJson,
  runGrilloMemoryWorkerLoop,
} from './lib/chat/grillo-memory-loop';
import { buildChatCompletionMessages, trimChatHistory } from './lib/chat/prompt';
import { getTurnReplyLengthInstruction } from './lib/chat/reply-length';
import {
  ASSISTANT_REPLY_JSON_FORMAT,
  buildAnimationCatalogInstruction,
  createAssistantReplyStreamFilter,
  resolveAnimationIndexForReplyMetadata,
  resolveFacialExpressionDurationMsForReplyMetadata,
  resolveFacialExpressionForReplyMetadata,
  resolveFacialExpressionIntensityForReplyMetadata,
  stripAssistantReplyMetadata,
  type AssistantReplyMetadata,
  type AssistantReplyParseResult,
} from './lib/chat/reply-metadata';
import { getAffectExpressionBoost, getMetadataVad, updateAffectState } from './lib/chat/affect-bridge';
import {
  isEmbeddingModel,
  isChatModel,
  selectReplyFormat,
  supportsImageInput,
  type ProviderModelInfo,
} from './brain/modelCapability';
import {
  buildChatTurnMemoryMessage,
  chatTurnToChatMessage,
  createLocalChatTurn,
  createTwitchChatTurn,
  formatChatTurns,
  type ChatTurn,
} from './lib/chat/chat-turn';
import { resolveScopedConversationSnapshot } from './lib/chat/conversation-scope';
import {
  describeTwitchAiQueueBackpressure,
  enqueueTwitchAiJobWithBackpressure,
  type TwitchAiQueueJob,
} from './lib/chat/twitch-ai-queue';
import {
  shouldIngestChatJobToGrillo,
  shouldIngestChatTurnToGrillo,
} from './lib/chat/grillo-intake';
import {
  addSemanticMemoryTurn,
  buildSemanticMemoryContext,
  clearSemanticMemory,
  findSemanticMemoryMatches,
} from './lib/chat/semantic-memory';
import { requestLocalTextEmbedding, warmLocalTextEmbeddingModel } from './lib/chat/local-embeddings';
import {
  clearScopedRelationshipMemoryState,
  commitScopedRelationshipMemoryState,
  shouldExposeScopedRelationshipMemory,
} from './lib/chat/scoped-relationship-memory';
import { loadPersistedChatState, savePersistedChatState } from './lib/chat/storage';
import type {
  AiSettings,
  AiProxyHealth,
  ChatMessage,
  PersistedChatState,
  PersonaDraft,
  PersonaProfile,
  PersonaVoiceBinding,
  RelationshipMemory,
  TwitchSettings,
  VoiceLabVoice,
} from './lib/chat/types';
import { createDefaultSequencerSettings, createDefaultVisualSettings } from './lib/menu/defaults';
import type {
  AnimationFormat,
  BundledVrmOption,
  EmotionTelemetryEvent,
  EmotionTelemetryPatch,
  FacialExpressionRequest,
  ManualPlayRequest,
  SavedVrmModelSummary,
  SceneBackgroundMode,
  SettingsTabId,
  VrmTelemetrySnapshot,
} from './lib/menu/types';
import { fetchGameAssetBlob } from './lib/cdn/assets';
import {
  deleteSavedVrmModel,
  getSavedVrmModelBlob,
  listSavedVrmModels,
  saveVrmModelBlob,
  saveVrmModelFile,
} from './lib/vrm/custom-vrm-library';
import {
  CUSTOM_RIKO_PIPER_VOICES,
  HIKARI_PIPER_VOICE_KEY,
  RIKO_PIPER_VOICE_KEY,
  cachePiperVoice,
  getStoredPiperVoiceKeys,
  listPiperVoices,
  loadPiperVoiceSession,
  NEURO_PIPER_VOICE_KEY,
} from './lib/tts/piper';
import type { PiperVoiceProfile, WordBoundary } from './lib/tts/piper';
import { getTtsProviderLabel } from './lib/tts/labels';
import { getTtsManager, type RemotePcmPushStream } from './lib/tts/manager';
import { createRemoteTtsStream, createRemoteTtsVoice, fetchRemoteTtsVoices } from './lib/tts/remote';
import type {
  CreateRemoteTtsVoiceRequest,
  CreatedRemoteTtsVoice,
  RemoteTtsAudioChunk,
  RemoteTtsProvider,
  RemoteTtsRequest,
  RemoteTtsVoice,
} from './lib/tts/remote';
import {
  mergeTtsBenchmarkTiming,
  summarizeTtsBenchmarkTiming,
  ZERO_TTS_BENCHMARK_TIMING,
  type TtsBenchmarkResult,
} from './lib/tts/benchmark';
import { AudioPlayback } from './tts/AudioPlayback';
import {
  getOverlaySocketProtocols,
  getOverlaySocketUrl,
  parseOverlayServerEvent,
  shouldConnectOverlaySocket,
  type OverlayServerEvent,
} from './lib/stream/overlay-events';
import { DirectTwitchIrcClient, type DirectTwitchChatMessage } from './lib/twitch/direct-irc';
import {
  getDirectStreamCommandHelp,
  parseDirectStreamCommand,
} from './lib/twitch/stream-command';
import {
  formatTwitchStreamTranscriptContext,
  getTwitchStreamTranscriptionProvider,
  isLikelyVisionModel,
  normalizeTwitchStreamVisionDetail,
  normalizeTwitchStreamTranscriptionModel,
  type TwitchStreamFrame,
  type TwitchStreamFrameResponse,
  type TwitchStreamTranscript,
  type TwitchStreamTranscriptionResponse,
} from './lib/twitch/stream-transcription';
import type { ProviderKind } from './lib/product/byok';
import { createBrowserProviderKeyVault } from './lib/product/provider-key-vault';
import { getDesktopBackendUrl, type DesktopWindowMode } from './lib/desktop/runtime';
import { formatLocalTransferBackupError } from './lib/product/local-transfer-backup';
import { createLocalTransferBackupBlobInWorker } from './lib/product/local-transfer-backup-export';
import { parseLocalTransferBackupInWorker } from './lib/product/local-transfer-backup-import';
import './style.css';

type SafeAreaInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

type TtsBenchmarkCandidate = {
  id: string;
  label: string;
  provider: RemoteTtsProvider;
  request: RemoteTtsRequest;
};

function getAnimationFormatFromFileName(fileName: string): AnimationFormat {
  const extension = fileName.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'vrma':
      return 'vrma';
    case 'bvh':
      return 'bvh';
    case 'glb':
      return 'glb';
    case 'gltf':
      return 'gltf';
    default:
      return 'fbx';
  }
}

type PersonaScenePreset = {
  id: string;
  personaSelectors: string[];
  bundledModelId: string;
  ttsVoice: string;
  backgroundImage: string;
  backgroundOverlay: string;
  backgroundFilter: string;
  accent: string;
  border: string;
  panel: string;
  textMuted: string;
};

const DEFAULT_SAFE_AREA: SafeAreaInsets = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
};

const BUNDLED_VRM_MODELS: BundledVrmOption[] = [
  {
    id: 'riko-final-fixed-v2',
    label: 'Riko Final Fixed',
    assetPath: 'models/riko-final-fixed-v2.vrm',
  },
  {
    id: 'rikov343',
    label: 'RIKOV343',
    assetPath: 'models/rikov343.vrm',
  },
  {
    id: 'rikov3',
    label: 'RIKOV3',
    assetPath: 'models/rikov3.vrm',
  },
  {
    id: 'peakriko',
    label: 'Peak Riko',
    assetPath: 'models/peakriko.vrm',
  },
  {
    id: 'hikkyc2',
    label: 'Hikari / Hikky C',
    assetPath: 'models/hikkyc2.vrm',
  },
  {
    id: 'neuro-sama',
    label: 'Neuro-sama',
    assetPath: 'models/neuro-sama.vrm',
  },
  {
    id: 'neuro-clown',
    label: 'Neuro Clown',
    assetPath: 'models/neuro-clown.vrm',
  },
];

const RIKO_BUNDLED_MODEL_ID = 'riko-final-fixed-v2';
const HIKARI_BUNDLED_MODEL_ID = 'hikkyc2';
const DEFAULT_BUNDLED_MODEL_ID = 'neuro-sama';
const PERSONA_SCENE_PRESETS: PersonaScenePreset[] = [
  {
    id: 'riko',
    personaSelectors: ['default-waifu', 'riko'],
    bundledModelId: RIKO_BUNDLED_MODEL_ID,
    ttsVoice: RIKO_PIPER_VOICE_KEY,
    backgroundImage: '/cdn-assets/backgrounds/red-stream-room.png',
    backgroundOverlay: 'linear-gradient(180deg, rgba(2, 2, 5, 0.03), rgba(9, 1, 3, 0.22))',
    backgroundFilter: 'saturate(1.08) brightness(0.9) contrast(1.04)',
    accent: '#ff4156',
    border: 'rgba(255, 69, 85, 0.34)',
    panel: 'rgba(8, 7, 10, 0.82)',
    textMuted: '#d7aaa4',
  },
  {
    id: 'neuro',
    personaSelectors: ['neuro-sama', 'neuro', 'neurosama'],
    bundledModelId: 'neuro-sama',
    ttsVoice: NEURO_PIPER_VOICE_KEY,
    backgroundImage: '/cdn-assets/backgrounds/neuro-bedroom.png',
    backgroundOverlay:
      'linear-gradient(180deg, rgba(255, 237, 245, 0.04), rgba(126, 43, 72, 0.16))',
    backgroundFilter: 'saturate(1.02) brightness(0.95) contrast(1.02)',
    accent: '#ff6fa6',
    border: 'rgba(255, 136, 177, 0.38)',
    panel: 'rgba(42, 20, 32, 0.76)',
    textMuted: '#f0b8ce',
  },
  {
    id: 'hikari',
    personaSelectors: [
      'hikari-chan',
      'hikarichan',
      'hikari',
      'hikky-c',
      'hikkyc',
      'hikky c',
      'hikkyc2',
      'hikari-jen',
      'hikarijen',
      'hickeyc',
    ],
    bundledModelId: HIKARI_BUNDLED_MODEL_ID,
    ttsVoice: HIKARI_PIPER_VOICE_KEY,
    backgroundImage: '/cdn-assets/backgrounds/hikari-bedroom.png',
    backgroundOverlay:
      'linear-gradient(180deg, rgba(255, 245, 231, 0.06), rgba(125, 59, 38, 0.18))',
    backgroundFilter: 'saturate(1.04) brightness(0.98) contrast(1.01)',
    accent: '#ffb45f',
    border: 'rgba(255, 186, 109, 0.4)',
    panel: 'rgba(38, 23, 20, 0.76)',
    textMuted: '#ffd1a6',
  },
];

function getPresetPersonaVoiceBinding(preset: PersonaScenePreset): PersonaVoiceBinding {
  return {
    label: `${preset.id} Piper preset`,
    provider: 'piper',
    updatedAt: 0,
    voiceId: preset.ttsVoice,
  };
}

const PERSIST_DEBOUNCE_MS = 900;
const MEMORY_AGENT_DELAY_MS = 2500;
const BACKEND_GRILLO_CADENCE_BEATS = ['extraction', 'relationship', 'reflection'] as const;

type BackendGrilloBeatType =
  | 'extraction'
  | 'reflection'
  | 'relationship'
  | 'consolidation'
  | 'compaction'
  | 'semantic_indexing';
const AI_CHAT_HARD_TIMEOUT_MS = 120000;
const AI_CHAT_STREAM_IDLE_TIMEOUT_MS = 90000;
const OVERLAY_RECONNECT_MS = 3000;
const DIRECT_TWITCH_CHANNEL = (import.meta.env['VITE_TWITCH_CHANNEL'] || 'subsect').trim();
const DIRECT_TWITCH_CHAT_ENABLED = import.meta.env['VITE_DIRECT_TWITCH_CHAT'] !== 'false';
const STREAM_BOT_WS_ENABLED = shouldConnectOverlaySocket();
const DIRECT_COMMAND_PREFIXES = ['!ww4', '!webwaifu', '!yw', '!yourwifey', '!waifu'];
const AI_PROXY_URL = (import.meta.env['VITE_AI_PROXY_URL'] || '').trim();
const AUTO_RESUME_BROWSER_AUDIO = import.meta.env['VITE_AUTO_RESUME_AUDIO'] === 'true';
const PIPER_TIMING_TICKS_PER_SECOND = 10000000;
const SUBTITLE_WORD_WINDOW = 14;
const SUBTITLE_CLEAR_DELAY_MS = 1200;
const ESTIMATED_SUBTITLE_WORD_SECONDS = 0.22;
const LIVE_BRIDGE_SUBTITLE_TICK_MS = 85;
const LIVE_BRIDGE_SUBTITLE_CHARS_PER_TICK = 3;
const LIVE_BRIDGE_SUBTITLE_PUNCTUATION_PAUSE_MS = 160;
const STREAM_DISPLAY_TICK_MS = 22;
const STREAM_DISPLAY_CHARS_PER_TICK = 4;
const STREAM_DISPLAY_PUNCTUATION_PAUSE_MS = 70;
const TWITCH_ACTIVE_CHATTER_WINDOW_MS = 120000;

type ChatAiJob = TwitchAiQueueJob;

type CommandChatMessage = DirectTwitchChatMessage & {
  isLocal?: boolean;
  isTrustedController?: boolean;
};

type AppCompletionMessage = {
  role: string;
  content: string;
  images?: AppCompletionImage[];
};

type AppCompletionImage = {
  detail?: 'auto' | 'high' | 'low';
  imageUrl: string;
};

type AppCompletionResponseFormat =
  | {
      type: 'json_object';
    }
  | {
      name: string;
      schema: Record<string, unknown>;
      strict?: boolean;
      type: 'json_schema';
    };

type AppCompletionResponse = {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  meta?: AiProxyHealth['providerState'];
  replyMetadata?: AssistantReplyMetadata | null;
};

type AiProxyStreamEvent = {
  type?: 'delta' | 'done' | 'error' | 'audio' | 'tts-error';
  audio?: string;
  delta?: string;
  error?: string;
  mimeType?: string;
  meta?: AiProxyHealth['providerState'] | AssistantReplyMetadata | null;
  ok?: boolean;
  replyMetadata?: AssistantReplyMetadata | null;
  sampleRate?: number;
  text?: string;
};

type AppEmbeddingResponse = {
  embedding?: number[];
  error?: string;
  ok?: boolean;
};

type AppModelsResponse = {
  error?: string;
  modelMetadata?: AppModelMetadata[];
  models?: Array<string | AppModelMetadata>;
  ok?: boolean;
  provider?: string;
};

type AppModelMetadata = ProviderModelInfo;

type StreamingSpeechPlayer = {
  cancel?: () => void;
  finish: (finalText?: string) => Promise<AssistantReplyParseResult>;
  pushAudioChunk?: (chunk: RemoteTtsAudioChunk) => void;
  pushDelta: (delta: string) => void;
};

function mergeModels(...sources: Array<readonly string[]>) {
  const merged: string[] = [];
  const seen = new Set<string>();

  sources.forEach((source) => {
    source.forEach((value) => {
      const normalized = value.trim();
      if (!normalized || seen.has(normalized)) {
        return;
      }

      seen.add(normalized);
      merged.push(normalized);
    });
  });

  return merged;
}

function pickAvailableModel(
  preferredModel: string | undefined,
  availableModels: readonly string[],
  fallbackModel: string = DEFAULT_AI_GATEWAY_MODEL,
) {
  const safeAvailableModels = filterSafeProviderModels(availableModels);
  const normalizedPreferred = preferredModel?.trim();
  if (
    normalizedPreferred &&
    !isPremiumCostModelId(normalizedPreferred) &&
    safeAvailableModels.includes(normalizedPreferred)
  ) {
    return normalizedPreferred;
  }

  const normalizedFallback = fallbackModel.trim();
  if (
    normalizedFallback &&
    !isPremiumCostModelId(normalizedFallback) &&
    safeAvailableModels.includes(normalizedFallback)
  ) {
    return normalizedFallback;
  }

  return safeAvailableModels[0]?.trim() ?? normalizedFallback;
}

function pickProviderEmbeddingModel(
  currentEmbeddingModel: string,
  modelMetadata: ReadonlyMap<string, ProviderModelInfo>,
) {
  const currentModel = currentEmbeddingModel.trim();
  if (!currentModel) {
    return DEFAULT_OPENROUTER_EMBEDDING_MODEL;
  }
  const currentMetadata = modelMetadata.get(currentModel);
  if (!currentMetadata) {
    return currentModel;
  }
  if (isEmbeddingModel(currentMetadata)) {
    return currentModel;
  }
  const firstProviderEmbedding = Array.from(modelMetadata.values())
    .filter(isEmbeddingModel)
    .map((model) => model.id)
    .sort((left, right) => left.localeCompare(right))[0];
  return firstProviderEmbedding ?? DEFAULT_OPENROUTER_EMBEDDING_MODEL;
}

function sanitizeAiModels(
  current: AiSettings,
  availableModels: readonly string[],
  modelMetadata: ReadonlyMap<string, ProviderModelInfo> = new Map(),
) {
  const providerModels = getProviderModelPool(current.llmProvider, availableModels);
  const providerDefaults = getAiProviderSwitchDefaults(current.llmProvider);
  const nextModel = pickAvailableModel(current.model, providerModels, providerDefaults.model);
  const nextMemoryAgentModel = pickAvailableModel(
    current.memoryAgentModel,
    providerModels,
    pickAvailableModel(providerDefaults.memoryAgentModel, providerModels, nextModel),
  );

  return {
    ...current,
    embeddingModel: pickProviderEmbeddingModel(current.embeddingModel, modelMetadata),
    model: nextModel,
    memoryAgentModel: nextMemoryAgentModel,
  };
}

function getProviderModelPool(
  llmProvider: AiSettings['llmProvider'],
  availableModels: readonly string[],
) {
  return filterSafeProviderModels(
    mergeModels(getProviderFallbackModels(llmProvider), availableModels),
  );
}

function getModelIdsFromResponse(data: AppModelsResponse) {
  return (data.models ?? [])
    .map((model) => (typeof model === 'string' ? model : model.id))
    .filter((model) => model.trim().length > 0);
}

function getModelMetadataFromResponse(data: AppModelsResponse) {
  const fromMetadata = data.modelMetadata ?? [];
  if (fromMetadata.length > 0) {
    return fromMetadata;
  }
  return (data.models ?? []).filter(
    (model): model is AppModelMetadata =>
      typeof model !== 'string' &&
      typeof model.id === 'string' &&
      Array.isArray(model.supportedParameters) &&
      typeof model.supportsStructuredOutputs === 'boolean',
  );
}

function createChatMessage(role: ChatMessage['role'], content: string): ChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    createdAt: Date.now(),
  };
}

function isSettingsMenuInteraction(event: MouseEvent<HTMLElement>) {
  const path = event.nativeEvent.composedPath?.() ?? [];
  return path.some(
    (entry) =>
      entry instanceof Element &&
      (entry.closest('.settings-panel') !== null || entry.closest('.menu-fab') !== null),
  );
}

function getAiProxyUrl() {
  const desktopUrl = getDesktopBackendUrl('/ai/chat');
  if (desktopUrl) {
    return desktopUrl;
  }

  if (AI_PROXY_URL) {
    return AI_PROXY_URL;
  }

  const url = new URL('/api/ai/chat', window.location.href);
  return url.toString();
}

function getAiEmbeddingUrl() {
  const url = new URL(getAiProxyUrl());
  url.pathname = url.pathname.replace(/\/chat\/?$/, '/embeddings');
  if (!/\/embeddings\/?$/.test(url.pathname)) {
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/embeddings`;
  }
  return url.toString();
}

function getTwitchTranscriptionUrl() {
  const url = new URL(getAiProxyUrl());
  url.pathname = url.pathname.replace(/\/ai\/chat\/?$/, '/twitch/transcribe-sample');
  if (!/\/twitch\/transcribe-sample\/?$/.test(url.pathname)) {
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/twitch/transcribe-sample`;
  }
  return url.toString();
}

function getTwitchFrameCaptureUrl() {
  const url = new URL(getAiProxyUrl());
  url.pathname = url.pathname.replace(/\/ai\/chat\/?$/, '/twitch/capture-frame');
  if (!/\/twitch\/capture-frame\/?$/.test(url.pathname)) {
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/twitch/capture-frame`;
  }
  return url.toString();
}

function getAiModelsUrl(llmProvider: AiSettings['llmProvider']) {
  const url = new URL(getAiProxyUrl());
  url.pathname = url.pathname.replace(/\/chat\/?$/, '/models');
  if (!/\/models\/?$/.test(url.pathname)) {
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/models`;
  }
  url.searchParams.set('provider', llmProvider);
  return url.toString();
}

function getAiHealthUrl({
  model,
  stateKey,
  transportMode,
}: {
  model?: string;
  stateKey?: string;
  transportMode?: AiSettings['aiTransportMode'];
} = {}) {
  const url = new URL(getAiProxyUrl());
  url.pathname = url.pathname.replace(/\/ai\/chat\/?$/, '/health');
  if (!/\/health\/?$/.test(url.pathname)) {
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/health`;
  }
  if (stateKey?.trim()) {
    url.searchParams.set('stateKey', stateKey.trim());
  }
  if (model?.trim()) {
    url.searchParams.set('model', model.trim());
  }
  if (transportMode) {
    url.searchParams.set('transportMode', transportMode);
  }
  return url.toString();
}

function getClientAiRouteLabel() {
  return `AI backend ${getAiProxyUrl()}`;
}

function decodeAiProxyAudioEvent(event: AiProxyStreamEvent): RemoteTtsAudioChunk | null {
  if (!event.audio) {
    return null;
  }
  const binary = window.atob(event.audio);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const mimeType = event.mimeType || 'audio/pcm';
  return {
    audioBlob: new Blob([bytes], { type: mimeType }),
    mimeType,
    sampleRate: typeof event.sampleRate === 'number' ? event.sampleRate : undefined,
  };
}

function isAssistantReplyMetadata(value: unknown): value is AssistantReplyMetadata {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.emotion === 'string' &&
    typeof record.valence === 'number' &&
    typeof record.arousal === 'number' &&
    typeof record.dominance === 'number'
  );
}

function getActiveTtsLabel(settings: AiSettings, piperVoice?: PiperVoiceProfile | null) {
  return settings.ttsProvider === 'piper'
    ? (piperVoice?.name ?? 'Piper voice')
    : getTtsProviderLabel(settings.ttsProvider);
}

function canUseFishLiveBridge(settings: AiSettings) {
  return (
    settings.ttsProvider === 'fish-speech' &&
    settings.fishSpeechTransport === 'websocket' &&
    settings.remoteTtsMode === 'live-bridge'
  );
}

function getEffectiveRemoteTtsMode(settings: AiSettings) {
  return canUseFishLiveBridge(settings) || settings.remoteTtsMode !== 'live-bridge'
    ? settings.remoteTtsMode
    : 'full-response';
}

function shouldChunkTtsRequests(settings: AiSettings) {
  const mode = getEffectiveRemoteTtsMode(settings);
  return settings.ttsProvider === 'piper' || mode === 'early-chunks' || mode === 'sentence-chunks';
}

function createRemoteTtsRequest(text: string, settings: AiSettings): RemoteTtsRequest {
  const streamingMode = getEffectiveRemoteTtsMode(settings);
  const fishLiveChunkingStrategy =
    settings.fishSpeechLiveChunkingStrategy === 'safe-phrase'
      ? 'python-safe'
      : settings.fishSpeechLiveChunkingStrategy === 'eager'
        ? 'eager'
        : 'app';
  if (settings.ttsProvider === 'inworld') {
    return {
      provider: 'inworld',
      text,
      streamingMode,
      voiceId: settings.inworldVoiceId.trim() || undefined,
      modelId: settings.inworldModelId.trim() || undefined,
      inworldTransport: settings.inworldTransport,
      sampleRate: settings.inworldSampleRate,
      timestampType: settings.inworldTimestampType,
      timestampTransportStrategy: settings.inworldTimestampTransportStrategy,
      deliveryMode: settings.inworldDeliveryMode,
      bufferCharThreshold: settings.inworldBufferCharThreshold,
      maxBufferDelayMs:
        settings.inworldMaxBufferDelayMs > 0 ? settings.inworldMaxBufferDelayMs : undefined,
      autoMode: settings.inworldAutoMode,
    };
  }

  return {
    provider: 'fish-speech',
    text,
    streamingMode,
    voiceId: settings.fishSpeechVoiceId.trim() || undefined,
    modelId: settings.fishSpeechModel.trim() || undefined,
    fishTransport: settings.fishSpeechTransport,
    format: settings.fishSpeechFormat,
    sampleRate: settings.fishSpeechSampleRate,
    latency: settings.fishSpeechLatency,
    conditionOnPreviousChunks: settings.fishSpeechConditionOnPreviousChunks,
    chunkLength: settings.fishSpeechChunkLength,
    chunkingStrategy: fishLiveChunkingStrategy,
  };
}

async function getBrowserProviderApiKey({
  keyName,
  provider,
  providerKeyVaultWorkspaceId,
}: {
  keyName: string;
  provider: ProviderKind;
  providerKeyVaultWorkspaceId?: string;
}) {
  const providerVault = createBrowserProviderKeyVault({
    workspaceId: providerKeyVaultWorkspaceId ?? 'local-browser',
  });
  return providerVault.getSecret(provider, keyName);
}

function getBrowserLlmProviderConfig(llmProvider: AiSettings['llmProvider']) {
  if (llmProvider === 'openrouter-responses') {
    return {
      keyName: 'openrouter.apiKey',
      label: 'OpenRouter',
      provider: 'openrouter' as const,
    };
  }
  return {
    keyName: 'aiGateway.apiKey',
    label: 'Vercel AI Gateway',
    provider: 'custom' as const,
  };
}

async function getBrowserRemoteTtsApiKey(
  providerName: RemoteTtsProvider,
  providerKeyVaultWorkspaceId?: string,
) {
  return getBrowserProviderApiKey(
    providerName === 'inworld'
      ? {
          keyName: 'inworld.apiKey',
          provider: 'inworld',
          providerKeyVaultWorkspaceId,
        }
      : {
          keyName: 'fishSpeech.apiKey',
          provider: 'fish_speech',
          providerKeyVaultWorkspaceId,
        },
  );
}

async function buildBackendProviderHeaders({
  llmProvider,
  providerKeyVaultWorkspaceId,
  toolChoiceMode,
  ttsBridge,
}: {
  llmProvider: AiSettings['llmProvider'];
  model?: string;
  providerKeyVaultWorkspaceId?: string;
  toolChoiceMode?: AiSettings['toolChoiceMode'];
  ttsBridge?: RemoteTtsRequest;
}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const providerConfig = getBrowserLlmProviderConfig(llmProvider);
  const apiKey = await getBrowserProviderApiKey({
    keyName: providerConfig.keyName,
    provider: providerConfig.provider,
    providerKeyVaultWorkspaceId,
  });
  headers['x-yourwifey-llm-provider'] = llmProvider;
  if (apiKey) {
    headers['x-yourwifey-llm-provider-key'] = apiKey;
  }
  const openAiByokApiKey = await getBrowserProviderApiKey({
    keyName: 'openai.apiKey',
    provider: 'openai',
    providerKeyVaultWorkspaceId,
  });
  if (openAiByokApiKey) {
    headers['x-yourwifey-openai-byok-key'] = openAiByokApiKey;
  }

  if (toolChoiceMode && toolChoiceMode !== 'off') {
    const tavilyApiKey = await getBrowserProviderApiKey({
      keyName: 'tavily.apiKey',
      provider: 'tavily',
      providerKeyVaultWorkspaceId,
    });
    if (tavilyApiKey) {
      headers['x-yourwifey-tavily-provider-key'] = tavilyApiKey;
    }
  }

  if (ttsBridge?.provider) {
    const ttsApiKey = await getBrowserRemoteTtsApiKey(
      ttsBridge.provider,
      providerKeyVaultWorkspaceId,
    );
    if (ttsApiKey) {
      headers['x-yourwifey-tts-provider-key'] = ttsApiKey;
    }
  }

  return headers;
}

async function readAiProxyStream(
  response: Response,
  onTextDelta?: (delta: string) => void,
  onAudioChunk?: (chunk: RemoteTtsAudioChunk) => void,
  signal?: AbortSignal,
): Promise<{
  meta?: AiProxyHealth['providerState'];
  replyMetadata?: AssistantReplyMetadata | null;
  text: string;
}> {
  if (!response.body) {
    throw new Error('Stream bot AI proxy did not return a readable stream.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let streamedText = '';
  let finalText = '';
  let finalMeta: AiProxyHealth['providerState'] | undefined;
  let finalReplyMetadata: AssistantReplyMetadata | null | undefined;

  const handleBlock = (block: string) => {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')
      .trim();

    if (!data || data === '[DONE]') {
      return;
    }

    let event: AiProxyStreamEvent;
    try {
      event = JSON.parse(data) as AiProxyStreamEvent;
    } catch {
      throw new Error('Stream bot AI proxy returned a malformed stream event.');
    }
    if (event.type === 'tts-error') {
      console.warn('[TTS] Live bridge failed:', event.error);
      return;
    }
    if (event.type === 'error' || event.ok === false) {
      throw new Error(event.error ?? 'Stream bot AI proxy stream failed.');
    }
    if (event.type === 'audio') {
      const chunk = decodeAiProxyAudioEvent(event);
      if (chunk) {
        onAudioChunk?.(chunk);
      }
      return;
    }
    if (event.type === 'delta' && event.delta) {
      streamedText += event.delta;
      onTextDelta?.(event.delta);
      return;
    }
    if (event.type === 'done') {
      finalText = event.text?.trim() || streamedText.trim();
      if (isAssistantReplyMetadata(event.replyMetadata)) {
        finalReplyMetadata = event.replyMetadata;
      } else if (isAssistantReplyMetadata(event.meta)) {
        finalReplyMetadata = event.meta;
      } else {
        finalMeta = event.meta ?? undefined;
        finalReplyMetadata = event.replyMetadata ?? null;
      }
    }
  };

  try {
    while (true) {
      const { value, done } = await readStreamChunkWithIdleTimeout(
        reader,
        AI_CHAT_STREAM_IDLE_TIMEOUT_MS,
        signal,
      );
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? '';
      for (const block of blocks) {
        handleBlock(block);
      }
    }

    buffer += decoder.decode();
    if (buffer.trim()) {
      handleBlock(buffer);
    }
  } finally {
    if (signal?.aborted) {
      await reader.cancel().catch(() => {});
    }
    reader.releaseLock();
  }

  return {
    meta: finalMeta,
    replyMetadata: finalReplyMetadata,
    text: finalText || streamedText.trim(),
  };
}

function buildOpenRouterRouting(settings: Pick<AiSettings, 'llmProvider' | 'openRouterAllowFallbacks' | 'openRouterProviderSlugs' | 'openRouterRoutingMode'>) {
  if (settings.llmProvider !== 'openrouter-responses' || settings.openRouterRoutingMode === 'auto') {
    return undefined;
  }
  const providers = settings.openRouterProviderSlugs
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (settings.openRouterRoutingMode === 'pinned' && providers.length === 0) {
    return undefined;
  }
  return {
    allowFallbacks: settings.openRouterAllowFallbacks,
    mode: settings.openRouterRoutingMode,
    providers,
  };
}

function readStreamChunkWithIdleTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  idleTimeoutMs: number,
  signal?: AbortSignal,
) {
  if (signal?.aborted) {
    return Promise.reject(new DOMException('AI chat request aborted.', 'AbortError'));
  }

  return new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      void reader.cancel().catch(() => {});
      reject(new Error(`AI proxy stream was idle for ${Math.round(idleTimeoutMs / 1000)}s.`));
    }, idleTimeoutMs);
    const onAbort = () => {
      window.clearTimeout(timer);
      void reader.cancel().catch(() => {});
      reject(new DOMException('AI chat request aborted.', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    reader.read().then(
      (result) => {
        window.clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        resolve(result);
      },
      (error) => {
        window.clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

async function requestChatCompletion({
  activeChatters = 1,
  disableState,
  maxTokens,
  maxToolRounds,
  messages,
  mode = 'direct',
  model,
  llmProvider = 'vercel-gateway',
  onAudioChunk,
  onTextDelta,
  responseFormat,
  stateKey,
  stateScope = 'chat',
  temperature,
  toolChoiceMode = 'auto',
  transportMode,
  ttsBridge,
  providerKeyVaultWorkspaceId,
  openRouterRouting,
  signal,
}: {
  activeChatters?: number;
  disableState?: boolean;
  maxTokens: number;
  maxToolRounds?: number;
  messages: AppCompletionMessage[];
  mode?: 'direct' | 'batch';
  model: string;
  llmProvider?: AiSettings['llmProvider'];
  onAudioChunk?: (chunk: RemoteTtsAudioChunk) => void;
  onTextDelta?: (delta: string) => void;
  responseFormat?: AppCompletionResponseFormat;
  stateKey?: string;
  stateScope?: 'chat' | 'memory';
  temperature: number;
  toolChoiceMode?: AiSettings['toolChoiceMode'];
  transportMode?: AiSettings['aiTransportMode'];
  ttsBridge?: RemoteTtsRequest;
  providerKeyVaultWorkspaceId?: string;
  openRouterRouting?: ReturnType<typeof buildOpenRouterRouting>;
  signal?: AbortSignal;
}): Promise<AppCompletionResponse> {
  const providerDefaults = getAiProviderSwitchDefaults(llmProvider);
  const safeModel = isPremiumCostModelId(model) ? providerDefaults.model : model;
  const headers = await buildBackendProviderHeaders({
    llmProvider,
    model: safeModel,
    providerKeyVaultWorkspaceId,
    toolChoiceMode,
    ttsBridge,
  });
  const requestBody = {
    activeChatters,
    disableState,
    llmProvider,
    maxToolRounds,
    maxTokens,
    messages,
    mode,
    model: safeModel,
    openAiStateMode: 'stateless',
    openRouterRouting,
    responseFormat,
    stateKey,
    stateScope,
    stream: Boolean(onTextDelta),
    temperature,
    toolChoiceMode,
    transportMode,
    ttsBridge,
  };

  const response = await fetch(getAiProxyUrl(), {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new Error(`Stream bot AI proxy failed with HTTP ${response.status}.`);
  }

  if (onTextDelta && response.headers.get('content-type')?.includes('text/event-stream')) {
    const streamResult = await readAiProxyStream(response, onTextDelta, onAudioChunk, signal);
    const text = streamResult.text;
    if (!text.trim()) {
      throw new Error('Stream bot AI proxy returned an empty response.');
    }

    return {
      choices: [
        {
          message: {
            content: text,
          },
        },
      ],
      meta: streamResult.meta,
      replyMetadata: streamResult.replyMetadata,
    };
  }

  const data = (await response.json()) as {
    ok?: boolean;
    text?: string;
    error?: string;
    meta?: AiProxyHealth['providerState'];
  };
  if (!data.ok || !data.text?.trim()) {
    throw new Error(data.error ?? 'Stream bot AI proxy returned an empty response.');
  }

  return {
    choices: [
      {
        message: {
          content: data.text,
        },
      },
    ],
    meta: data.meta,
  };
}

async function requestTextEmbedding(
  input: string,
  providerKeyVaultWorkspaceId?: string,
  llmProvider: AiSettings['llmProvider'] = 'vercel-gateway',
  operation: MemoryEmbeddingDebugSnapshot['operation'] = 'prompt-recall',
  onDebug?: (debug: MemoryEmbeddingDebugSnapshot) => void,
  embeddingMode: AiSettings['embeddingMode'] = 'browser',
  embeddingModel = DEFAULT_OPENROUTER_EMBEDDING_MODEL,
  embeddingLocalModel = DEFAULT_LOCAL_EMBEDDING_MODEL,
): Promise<number[] | null> {
  const text = input.trim();
  if (!text) {
    onDebug?.({
      inputChars: 0,
      operation,
      provider: 'transformers-local',
      status: 'skipped-empty',
      updatedAt: Date.now(),
    });
    return null;
  }

  if (embeddingMode === 'browser' || embeddingMode === 'auto') {
    const localModel = embeddingLocalModel.trim() || DEFAULT_LOCAL_EMBEDDING_MODEL;
    try {
      const localEmbedding = await requestLocalTextEmbedding(
        text,
        operation === 'prompt-recall' || operation === 'worker-search' ? 2500 : 6000,
        localModel,
      );
      if (localEmbedding?.length) {
        onDebug?.({
          inputChars: text.length,
          model: localModel,
          operation,
          provider: 'transformers-local',
          status: 'ok',
          updatedAt: Date.now(),
          vectorDims: localEmbedding.length,
        });
        return localEmbedding;
      }
    } catch (error) {
      onDebug?.({
        error: error instanceof Error ? error.message : String(error),
        inputChars: text.length,
        model: localModel,
        operation,
        provider: 'transformers-local',
        status: 'failed',
        updatedAt: Date.now(),
      });
    }

    if (embeddingMode === 'browser') {
      return null;
    }
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 1800);
  try {
    const headers = await buildBackendProviderHeaders({
      llmProvider,
      providerKeyVaultWorkspaceId,
    });
    const response = await fetch(getAiEmbeddingUrl(), {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        input: text.slice(0, 4000),
        llmProvider,
        model: embeddingModel.trim() || DEFAULT_OPENROUTER_EMBEDDING_MODEL,
      }),
    });
    if (!response.ok) {
      onDebug?.({
        error: `HTTP ${response.status}`,
        inputChars: text.length,
        operation,
        provider: llmProvider,
        status: 'failed',
        updatedAt: Date.now(),
      });
      return null;
    }

    const data = (await response.json()) as AppEmbeddingResponse;
    const embedding = data.ok && Array.isArray(data.embedding) ? data.embedding : null;
    onDebug?.({
      error: embedding ? undefined : 'Embedding response did not include a vector.',
      inputChars: text.length,
      operation,
      provider: llmProvider,
      status: embedding ? 'ok' : 'failed',
      updatedAt: Date.now(),
      vectorDims: embedding?.length,
    });
    return embedding;
  } catch (error) {
    onDebug?.({
      error: error instanceof Error ? error.message : String(error),
      inputChars: text.length,
      operation,
      provider: llmProvider,
      status: 'failed',
      updatedAt: Date.now(),
    });
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function requestTwitchStreamTranscript(input: {
  channel: string;
  llmProvider: AiSettings['llmProvider'];
  model: string;
  providerKeyVaultWorkspaceId?: string;
  sampleSeconds: number;
}) {
  const model = normalizeTwitchStreamTranscriptionModel(input.model);
  const transcriptionProvider = getTwitchStreamTranscriptionProvider(model);
  const headers = await buildBackendProviderHeaders({
    llmProvider:
      transcriptionProvider === 'openrouter' ? 'openrouter-responses' : input.llmProvider,
    providerKeyVaultWorkspaceId: input.providerKeyVaultWorkspaceId,
  });
  if (transcriptionProvider === 'fish-speech') {
    const fishAsrApiKey = await getBrowserRemoteTtsApiKey(
      'fish-speech',
      input.providerKeyVaultWorkspaceId,
    );
    if (fishAsrApiKey) {
      headers['x-yourwifey-tts-provider-key'] = fishAsrApiKey;
    }
  }
  const response = await fetch(getTwitchTranscriptionUrl(), {
    body: JSON.stringify({
      channel: input.channel,
      llmProvider: input.llmProvider,
      model,
      provider: transcriptionProvider,
      sampleSeconds: input.sampleSeconds,
    }),
    headers,
    method: 'POST',
  });
  const data = (await response.json().catch(() => ({}))) as TwitchStreamTranscriptionResponse;
  if (!response.ok || !data.ok || !data.transcript?.text?.trim()) {
    throw new Error(data.error || 'Twitch stream transcription returned no text.');
  }
  return {
    channel: data.transcript.channel || input.channel,
    createdAt: Date.now(),
    model: normalizeTwitchStreamTranscriptionModel(data.transcript.model || model),
    sampleSeconds: data.transcript.sampleSeconds || input.sampleSeconds,
    text: data.transcript.text.trim(),
  } satisfies TwitchStreamTranscript;
}

async function requestTwitchStreamFrame(input: {
  channel: string;
  detail: 'auto' | 'high' | 'low';
}) {
  const response = await fetch(getTwitchFrameCaptureUrl(), {
    body: JSON.stringify({
      channel: input.channel,
      detail: input.detail,
    }),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });
  const data = (await response.json().catch(() => ({}))) as TwitchStreamFrameResponse;
  if (!response.ok || !data.ok || !data.frame?.imageDataUrl?.trim()) {
    throw new Error(data.error || 'Twitch stream frame capture returned no image.');
  }
  return {
    channel: data.frame.channel || input.channel,
    createdAt: Date.now(),
    detail: normalizeTwitchStreamVisionDetail(data.frame.detail || input.detail),
    imageDataUrl: data.frame.imageDataUrl.trim(),
    mimeType: data.frame.mimeType || 'image/jpeg',
  } satisfies TwitchStreamFrame;
}

function getFreshTwitchStreamFrameForPrompt({
  frame,
  llmProvider,
  maxAgeSeconds,
  model,
  modelMetadata,
  visionEnabled,
}: {
  frame: TwitchStreamFrame | null;
  llmProvider: AiSettings['llmProvider'];
  maxAgeSeconds: number;
  model: string;
  modelMetadata?: AppModelMetadata | null;
  visionEnabled: boolean;
}) {
  const modelAcceptsImage =
    modelMetadata !== undefined && modelMetadata !== null
      ? supportsImageInput(modelMetadata)
      : isLikelyVisionModel(llmProvider, model);
  if (
    !visionEnabled ||
    !frame ||
    isPremiumCostModelId(model) ||
    !modelAcceptsImage
  ) {
    return null;
  }
  const maxAgeMs = Math.max(15, Math.min(600, maxAgeSeconds)) * 1000;
  if (Date.now() - frame.createdAt > maxAgeMs) {
    return null;
  }
  return frame;
}

function attachStreamVisionFrame(
  messages: AppCompletionMessage[],
  frame: TwitchStreamFrame | null,
): AppCompletionMessage[] {
  if (!frame) {
    return messages;
  }
  const userIndex = messages.map((message) => message.role).lastIndexOf('user');
  if (userIndex < 0) {
    return messages;
  }
  return messages.map((message, index) =>
    index === userIndex
      ? {
          ...message,
          content: `${message.content}\n\nCurrent Twitch stream frame is attached as visual context only. Use it to understand what is currently on stream when relevant; do not describe it unless it helps the reply.`,
          images: [
            ...(message.images ?? []),
            {
              detail: frame.detail,
              imageUrl: frame.imageDataUrl,
            },
          ],
        }
      : message,
  );
}

async function getSemanticMemoryContext(
  scopeKey: string,
  query: string,
  providerKeyVaultWorkspaceId?: string,
  llmProvider: AiSettings['llmProvider'] = 'vercel-gateway',
  onEmbeddingDebug?: (debug: MemoryEmbeddingDebugSnapshot) => void,
  embeddingMode: AiSettings['embeddingMode'] = 'browser',
  embeddingModel = DEFAULT_OPENROUTER_EMBEDDING_MODEL,
  embeddingLocalModel = DEFAULT_LOCAL_EMBEDDING_MODEL,
) {
  const embedding = await requestTextEmbedding(
    query,
    providerKeyVaultWorkspaceId,
    llmProvider,
    'prompt-recall',
    onEmbeddingDebug,
    embeddingMode,
    embeddingModel,
    embeddingLocalModel,
  );
  return buildSemanticMemoryContext(await findSemanticMemoryMatches(scopeKey, query, embedding));
}

async function rememberSemanticTurn(
  scopeKey: string,
  userText: string,
  assistantText: string,
  persona: PersonaProfile | null,
  providerKeyVaultWorkspaceId?: string,
  llmProvider: AiSettings['llmProvider'] = 'vercel-gateway',
  onEmbeddingDebug?: (debug: MemoryEmbeddingDebugSnapshot) => void,
  operation: MemoryEmbeddingDebugSnapshot['operation'] = 'semantic-save',
  embeddingMode: AiSettings['embeddingMode'] = 'browser',
  embeddingModel = DEFAULT_OPENROUTER_EMBEDDING_MODEL,
  embeddingLocalModel = DEFAULT_LOCAL_EMBEDDING_MODEL,
) {
  const embedding = await requestTextEmbedding(
    `${userText}\n${assistantText}`,
    providerKeyVaultWorkspaceId,
    llmProvider,
    operation,
    onEmbeddingDebug,
    embeddingMode,
    embeddingModel,
    embeddingLocalModel,
  );
  return addSemanticMemoryTurn({
    assistantText,
    embedding,
    persona,
    scopeKey,
    userText,
  });
}

function buildLadybugGrilloTurnPairInput(
  job: ChatAiJob,
  stateKey: string,
  userText: string,
  assistantText: string,
  persona: PersonaProfile,
): LadybugGrilloTurnPairInput {
  const representativeTurn = job.messages[0] ?? null;
  const isBatch = job.mode === 'batch';
  const source =
    representativeTurn?.source ?? (stateKey.startsWith('twitch:') ? 'twitch' : 'local');
  const channelId = representativeTurn?.channel ?? (source === 'twitch' ? 'unknown' : 'local');
  return {
    assistantName: persona.name,
    assistantText,
    authorName: isBatch
      ? `Chat batch (${job.messages.length})`
      : representativeTurn?.displayName ?? persona.userNickname,
    channelId,
    createdAt: representativeTurn?.timestamp ?? Date.now(),
    interfacePath: `${source}/${channelId}`,
    participantKey: isBatch
      ? `${stateKey}:chat-batch`
      : representativeTurn
        ? getGrilloParticipantKey(representativeTurn)
        : stateKey,
    scopeKey: stateKey,
    source,
    userText,
  };
}

function normalizeCommandSelector(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function resolveBundledModelId(selector: string, models: readonly BundledVrmOption[]) {
  const normalized = normalizeCommandSelector(selector);
  return (
    models.find(
      (model) =>
        normalizeCommandSelector(model.id) === normalized ||
        normalizeCommandSelector(model.label) === normalized ||
        normalizeCommandSelector(model.assetPath) === normalized,
    )?.id ?? null
  );
}

function resolveAnimationIndex(
  selector: string,
  playlist: readonly { id: string; name: string; url: string }[],
) {
  const trimmed = selector.trim();
  const numeric = Number.parseInt(trimmed, 10);
  if (Number.isFinite(numeric) && String(numeric) === trimmed) {
    const oneBasedIndex = numeric - 1;
    if (oneBasedIndex >= 0 && oneBasedIndex < playlist.length) {
      return oneBasedIndex;
    }
    if (numeric >= 0 && numeric < playlist.length) {
      return numeric;
    }
  }

  const normalized = normalizeCommandSelector(selector);
  const exactIndex = playlist.findIndex(
    (entry) =>
      normalizeCommandSelector(entry.id) === normalized ||
      normalizeCommandSelector(entry.name) === normalized,
  );
  if (exactIndex !== -1) {
    return exactIndex;
  }

  return playlist.findIndex(
    (entry) =>
      normalizeCommandSelector(entry.name).includes(normalized) ||
      normalizeCommandSelector(entry.id).includes(normalized) ||
      normalizeCommandSelector(entry.url).includes(normalized),
  );
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function normalizeMentionTag(value: string) {
  return value
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/[^a-z0-9_]+/g, '');
}

function getPersonaMentionTags(persona: PersonaProfile | null) {
  const tags = new Set<string>(['riko', 'rico']);
  if (persona?.name) {
    tags.add(normalizeMentionTag(persona.name));
  }
  if (persona?.id) {
    tags.add(normalizeMentionTag(persona.id));
  }
  const candidates = [persona?.id, persona?.name].map(normalizePersonaSelector);
  const preset = PERSONA_SCENE_PRESETS.find((entry) =>
    entry.personaSelectors
      .map(normalizePersonaSelector)
      .some((selector) => selector && candidates.includes(selector)),
  );
  preset?.personaSelectors.forEach((selector) => tags.add(normalizeMentionTag(selector)));

  return [...tags].filter(Boolean);
}

function normalizePersonaSelector(value: string | undefined | null) {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/[^a-z0-9]+/g, '');
}

function personaMatchesScenePreset(persona: PersonaProfile | null, preset: PersonaScenePreset) {
  if (!persona) {
    return false;
  }

  const candidates = [persona.id, persona.name].map(normalizePersonaSelector);
  return preset.personaSelectors
    .map(normalizePersonaSelector)
    .some((selector) => selector && candidates.includes(selector));
}

function getPersonaScenePreset(persona: PersonaProfile | null) {
  return (
    PERSONA_SCENE_PRESETS.find((preset) => personaMatchesScenePreset(persona, preset)) ??
    PERSONA_SCENE_PRESETS[0]!
  );
}

function resolvePersonaSelector(selector: string, personas: readonly PersonaProfile[]) {
  const normalized = normalizePersonaSelector(selector);
  if (!normalized) {
    return null;
  }

  const exactPersona = personas.find((persona) =>
    [persona.id, persona.name].some(
      (candidate) => normalizePersonaSelector(candidate) === normalized,
    ),
  );
  if (exactPersona) {
    return exactPersona;
  }

  const preset = PERSONA_SCENE_PRESETS.find((entry) =>
    entry.personaSelectors.some((candidate) => normalizePersonaSelector(candidate) === normalized),
  );
  if (preset) {
    return personas.find((persona) => personaMatchesScenePreset(persona, preset)) ?? null;
  }

  return (
    personas.find((persona) =>
      [persona.id, persona.name].some((candidate) =>
        normalizePersonaSelector(candidate).includes(normalized),
      ),
    ) ?? null
  );
}

function getPersonaPrimaryMentionTag(persona: PersonaProfile | null) {
  return normalizeMentionTag(persona?.name ?? DEFAULT_PERSONA.name) || 'riko';
}

function normalizeStateKeyPart(value: string | undefined, fallback: string) {
  const key = (value || fallback)
    .trim()
    .toLowerCase()
    .replace(/^#/, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return key || fallback;
}

function getPersonaStateKey(persona: PersonaProfile | null) {
  return normalizeStateKeyPart(persona?.id || persona?.name, DEFAULT_PERSONA.id || 'riko');
}

function getTwitchConversationStateKey(channel: string, persona: PersonaProfile | null) {
  return `twitch:${normalizeStateKeyPart(channel, DIRECT_TWITCH_CHANNEL || 'subsect')}:persona:${getPersonaStateKey(persona)}`;
}

function getLocalConversationStateKey(persona: PersonaProfile | null) {
  return `local:persona:${getPersonaStateKey(persona)}`;
}

function getMemoryStateKey(baseStateKey: string) {
  return `memory:${baseStateKey}`.slice(0, 160);
}

function twitchMessageMentionsPersona(text: string, persona: PersonaProfile | null) {
  const tags = getPersonaMentionTags(persona);
  const mentions = new Set(
    Array.from(text.matchAll(/@([a-z0-9_][a-z0-9_-]*)/gi)).map((match) =>
      normalizeMentionTag(match[1] ?? ''),
    ),
  );

  return tags.some((tag) => mentions.has(tag));
}

function getTwitchBatchSize(activeChatters: number, settings: TwitchSettings) {
  if (activeChatters <= 25) {
    return settings.batchLowSize;
  }
  if (activeChatters <= 50) {
    return settings.batchMidSize;
  }
  if (activeChatters <= 100) {
    return settings.batchHighSize;
  }
  return settings.batchMaxSize;
}

function getTwitchBatchWaitMs(activeChatters: number, settings: TwitchSettings) {
  return activeChatters > 100 ? settings.batchFastWaitMs : settings.batchWaitMs;
}

function pruneActiveTwitchChatters(chatters: Map<string, number>, now: number) {
  for (const [user, lastSeenAt] of chatters) {
    if (now - lastSeenAt > TWITCH_ACTIVE_CHATTER_WINDOW_MS) {
      chatters.delete(user);
    }
  }
  return chatters.size;
}

function getSubtitleLine(text: string, wordBoundaries: WordBoundary[], elapsedSeconds: number) {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (wordBoundaries.length === 0) {
    return cleaned;
  }

  const elapsedTicks = elapsedSeconds * PIPER_TIMING_TICKS_PER_SECOND;
  const nextWordIndex = wordBoundaries.findIndex((boundary) => elapsedTicks < boundary.offset);
  const visibleCount = nextWordIndex === -1 ? wordBoundaries.length : Math.max(1, nextWordIndex);
  const start = Math.max(0, visibleCount - SUBTITLE_WORD_WINDOW);
  const visibleWords = wordBoundaries.slice(start, visibleCount).map((boundary) => boundary.word);

  return visibleWords.join(' ').trim() || cleaned;
}

function getLiveBridgeSubtitleLine(text: string) {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  return words.slice(-SUBTITLE_WORD_WINDOW).join(' ');
}

function createEstimatedSubtitleWordBoundaries(text: string): WordBoundary[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  return words.map((word, index) => ({
    duration: ESTIMATED_SUBTITLE_WORD_SECONDS * PIPER_TIMING_TICKS_PER_SECOND,
    offset: index * ESTIMATED_SUBTITLE_WORD_SECONDS * PIPER_TIMING_TICKS_PER_SECOND,
    word,
  }));
}

function buildChatAiPrompt(
  job: ChatAiJob,
  persona: PersonaProfile | null,
  channel: string,
  replyLength: AiSettings['replyLength'],
) {
  const personaName = persona?.name ?? DEFAULT_PERSONA.name;
  const channelName = normalizeStateKeyPart(channel, DIRECT_TWITCH_CHANNEL || 'subsect');
  const mentionTags = getPersonaMentionTags(persona)
    .map((tag) => `@${tag}`)
    .join(', ');
  const localControllerNickname = persona?.userNickname.trim();
  const isTwitchTurn = job.messages.some((turn) => turn.source === 'twitch');
  const identityContext = [
    `Current chat room: ${isTwitchTurn ? `#${channelName}` : 'local chat box'}.`,
    isTwitchTurn
      ? `You are ${personaName}, the stream avatar/bot. Viewers mention you as ${mentionTags}.`
      : `You are ${personaName}, the local desktop avatar. The local chat box is a direct one-on-one conversation.`,
    localControllerNickname
      ? isTwitchTurn
        ? `The local controller/stream owner nickname is "${localControllerNickname}", but Twitch messages can come from other participants.`
        : `The local controller nickname is "${localControllerNickname}". Talk to them directly in second person.`
      : null,
    'Do not assume the current speaker is the local controller unless speaker context says they are local, trusted, the broadcaster, or a moderator.',
  ]
    .filter((value): value is string => Boolean(value))
    .join('\n');

  if (job.mode === 'direct') {
    const [target] = job.messages;
    const sourceLabel = target?.source === 'local' ? 'Local chat' : 'Live Twitch chat';
    return [
      `${sourceLabel}: direct message for ${personaName}.`,
      identityContext,
      `Approx active chatters in the last two minutes: ${job.activeChatterCount}.`,
      `Current message:\n${formatChatTurns(job.messages, 1)}`,
      target?.isBroadcaster
        ? 'Speaker context: the target is the broadcaster/channel owner.'
        : target?.isLocal
          ? 'Speaker context: the target is the local chat box participant/controller. Reply directly to them, not to an audience.'
          : target?.isMod
            ? 'Speaker context: the target is a Twitch moderator; reply to that display name, not the local controller nickname.'
            : 'Speaker context: the target is a Twitch chatter; reply to that display name, not the local controller nickname.',
      job.firstTimeChatter
        ? 'This is the first message seen from this viewer in this browser session; greet them naturally.'
        : null,
      getTurnReplyLengthInstruction(replyLength, 'direct'),
      'Do not mention command syntax, routing, queues, batching, or system internals.',
    ]
      .filter((value): value is string => Boolean(value))
      .join('\n\n');
  }

  return [
    `Live Twitch chat: busy group conversation for ${personaName}.`,
    identityContext,
    `Approx active chatters in the last two minutes: ${job.activeChatterCount}.`,
    'The chat is busy, so answer the overall energy or strongest shared topic instead of replying to every line.',
    getTurnReplyLengthInstruction(replyLength, 'batch'),
    `Current batch:\n${formatChatTurns(job.messages, 30)}`,
  ]
    .filter((value): value is string => Boolean(value))
    .join('\n\n');
}

function chatTurnToCommandMessage(turn: ChatTurn): CommandChatMessage {
  return {
    id: turn.id,
    user: turn.login,
    displayName: turn.displayName,
    text: turn.text,
    timestamp: turn.timestamp,
    badges: turn.badges,
    isMod: turn.isMod,
    isBroadcaster: turn.isBroadcaster,
    isLocal: turn.isLocal,
    isTrustedController: turn.isTrustedController,
  };
}

function getMemoryProgressStatus(memory: RelationshipMemory, intervalMessages: number | undefined) {
  const interval = normalizeMemoryAgentIntervalMessages(intervalMessages);
  const turnsSinceDiary = memory.turnCount - memory.lastDiaryTurnCount;
  const remainingTurns = Math.max(0, interval - turnsSinceDiary);
  if (remainingTurns === 0) {
    return 'Memory updated. Worker pass queued.';
  }

  return `Memory updated. Worker pass in ${remainingTurns} chat message${remainingTurns === 1 ? '' : 's'}.`;
}

function getAiErrorMessage(error: unknown, context: 'chat' | 'models' = 'chat') {
  if (!(error instanceof Error)) {
    return context === 'models'
      ? 'AI model list unavailable right now.'
      : 'AI request failed unexpectedly.';
  }

  const message = error.message.trim();
  if (message.includes('Failed to process AI completion request')) {
    return 'AI backend rejected the completion request. Refresh the session and retry.';
  }

  if (message.includes('HTTP error! status: 500')) {
    return context === 'models'
      ? 'AI model list failed with a server error.'
      : 'AI backend returned a server error while generating a reply.';
  }

  return (
    message ||
    (context === 'models'
      ? 'AI model list unavailable right now.'
      : 'AI request failed unexpectedly.')
  );
}

function mergeRelationshipMemoryInWorker(
  worker: Worker,
  currentMemory: RelationshipMemory,
  rawContent: string,
  targetTurnCount: number,
) {
  return new Promise<RelationshipMemory>((resolve, reject) => {
    const requestId = `memory-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const cleanup = () => {
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
    };

    const handleMessage = (event: MessageEvent<{ id?: string; memory?: RelationshipMemory }>) => {
      if (event.data?.id !== requestId || !event.data.memory) {
        return;
      }

      cleanup();
      resolve(event.data.memory);
    };

    const handleError = (error: ErrorEvent) => {
      cleanup();
      reject(error.error ?? new Error(error.message));
    };

    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleError);
    worker.postMessage({
      id: requestId,
      type: 'merge',
      currentMemory,
      rawContent,
      targetTurnCount,
    });
  });
}

type DesktopRuntimeStatus = {
  backendPort: string;
  clickThrough: boolean;
  mode: DesktopWindowMode;
};

function App() {
  const safeArea = DEFAULT_SAFE_AREA;
  const sceneActive = true;
  const providerKeyVaultWorkspaceId = 'local-browser';
  const [menuOpen, setMenuOpen] = useState(() => createDefaultUiState().menuOpen);
  const [desktopRuntime, setDesktopRuntime] = useState<DesktopRuntimeStatus | null>(() => {
    const desktopBridge = typeof window !== 'undefined' ? window.webWaifuDesktop : undefined;
    if (!desktopBridge?.isDesktop) {
      return null;
    }
    return {
      backendPort: desktopBridge.backendPort ?? '8797',
      clickThrough: false,
      mode: desktopBridge.mode ?? 'editor',
    };
  });
  const [desktopControlsVisible, setDesktopControlsVisible] = useState(true);
  const [chatBarOpen, setChatBarOpen] = useState(false);
  const [chatLogOpen, setChatLogOpen] = useState(() => createDefaultUiState().chatLogOpen);
  const [activeTab, setActiveTab] = useState<SettingsTabId>('vrm');
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [currentBundledModelId, setCurrentBundledModelId] =
    useState<string>(DEFAULT_BUNDLED_MODEL_ID);
  const [currentCustomVrmModelId, setCurrentCustomVrmModelId] = useState('');
  const [savedVrmModels, setSavedVrmModels] = useState<SavedVrmModelSummary[]>([]);
  const [savedVrmStatus, setSavedVrmStatus] = useState('');
  const [localTransferStatus, setLocalTransferStatus] = useState('Local transfer backup is ready.');
  const [manualPlayRequest, setManualPlayRequest] = useState<ManualPlayRequest | null>(null);
  const [facialExpressionRequest, setFacialExpressionRequest] =
    useState<FacialExpressionRequest | null>(null);
  const [emotionTelemetryEvents, setEmotionTelemetryEvents] = useState<EmotionTelemetryEvent[]>(
    [],
  );
  const [vrmTelemetry, setVrmTelemetry] = useState<VrmTelemetrySnapshot | null>(null);
  const [visualSettings, setVisualSettings] = useState(createDefaultVisualSettings);
  const [sequencerSettings, setSequencerSettings] = useState(createDefaultSequencerSettings);
  const [personas, setPersonas] = useState<PersonaProfile[]>(createDefaultPersonas);
  const [activePersonaId, setActivePersonaId] = useState(DEFAULT_PERSONA.id);
  const [personaVoiceBindings, setPersonaVoiceBindings] = useState<
    Record<string, PersonaVoiceBinding>
  >(() => createDefaultPersonaVoiceBindings());
  const [voiceLabVoices, setVoiceLabVoices] = useState<VoiceLabVoice[]>([]);
  const [aiSettings, setAiSettings] = useState<AiSettings>(createDefaultAiSettings);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatHistories, setChatHistories] = useState<Record<string, ChatMessage[]>>({});
  const [chatInput, setChatInput] = useState(() => createDefaultUiState().chatDraft);
  const [chatGenerating, setChatGenerating] = useState(false);
  const [assistantReplyLocked, setAssistantReplyLocked] = useState(false);
  const [chatDisplayOverrides, setChatDisplayOverrides] = useState<Record<string, string>>({});
  const [twitchChannel, setTwitchChannel] = useState(DIRECT_TWITCH_CHANNEL);
  const [twitchSettings, setTwitchSettings] = useState<TwitchSettings>(createDefaultTwitchSettings);
  const [twitchConnectionLabel, setTwitchConnectionLabel] = useState(
    DIRECT_TWITCH_CHAT_ENABLED ? 'Connecting' : 'Offline',
  );
  const [twitchActiveChatterCount, setTwitchActiveChatterCount] = useState(0);
  const [twitchStreamTranscripts, setTwitchStreamTranscripts] = useState<TwitchStreamTranscript[]>(
    [],
  );
  const [twitchStreamTranscriptionStatus, setTwitchStreamTranscriptionStatus] = useState(
    'Stream transcription idle.',
  );
  const [twitchStreamFrame, setTwitchStreamFrame] = useState<TwitchStreamFrame | null>(null);
  const [twitchMembershipStatus, setTwitchMembershipStatus] = useState('Membership events idle.');
  const [twitchStreamVisionStatus, setTwitchStreamVisionStatus] = useState('Stream vision idle.');
  const [relationshipMemory, setRelationshipMemory] = useState<RelationshipMemory>(
    createDefaultRelationshipMemory,
  );
  const [relationshipMemories, setRelationshipMemories] = useState<
    Record<string, RelationshipMemory>
  >({});
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [availableModelMetadata, setAvailableModelMetadata] = useState<
    Map<string, AppModelMetadata>
  >(() => new Map());
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [aiProxyHealth, setAiProxyHealth] = useState<AiProxyHealth | null>(null);
  const [aiProxyHealthError, setAiProxyHealthError] = useState<string | null>(null);
  const [memoryAgentBusy, setMemoryAgentBusy] = useState(false);
  const [memoryAgentStatus, setMemoryAgentStatus] = useState('Memory worker idle.');
  const [memoryBackendStatus, setMemoryBackendStatus] = useState<LadybugMemoryStatus | null>(null);
  const [grilloRuntimeStatus, setGrilloRuntimeStatus] =
    useState<LadybugGrilloRuntimeStatus | null>(null);
  const [backendGrilloTickBusy, setBackendGrilloTickBusy] = useState(false);
  const [memoryGraphSummary, setMemoryGraphSummary] = useState<LadybugMemoryGraphSummary | null>(
    null,
  );
  const [memoryPromptDebug, setMemoryPromptDebug] = useState<MemoryPromptDebugSnapshot | null>(
    null,
  );
  const [memoryEmbeddingDebug, setMemoryEmbeddingDebug] =
    useState<MemoryEmbeddingDebugSnapshot | null>(null);
  const [memoryWorkerDebug, setMemoryWorkerDebug] = useState<MemoryWorkerDebugSnapshot | null>(
    null,
  );
  const [memoryAgentPendingCounts, setMemoryAgentPendingCounts] = useState<Record<string, number>>(
    {},
  );
  const [grilloMemoryState, setGrilloMemoryState] = useState<GrilloMemoryState>(() =>
    createDefaultGrilloMemoryState(getLocalConversationStateKey(DEFAULT_PERSONA)),
  );
  const [ttsVoices, setTtsVoices] = useState<PiperVoiceProfile[]>(() => [
    ...CUSTOM_RIKO_PIPER_VOICES,
  ]);
  const [ttsCachedVoiceKeys, setTtsCachedVoiceKeys] = useState<string[]>([]);
  const [ttsVoicesLoading, setTtsVoicesLoading] = useState(false);
  const [ttsVoicesError, setTtsVoicesError] = useState<string | null>(null);
  const [remoteTtsVoices, setRemoteTtsVoices] = useState<
    Record<RemoteTtsProvider, RemoteTtsVoice[]>
  >({
    'fish-speech': [],
    inworld: [],
  });
  const [remoteTtsVoicesLoading, setRemoteTtsVoicesLoading] = useState(false);
  const [remoteTtsVoicesError, setRemoteTtsVoicesError] = useState<string | null>(null);
  const [ttsBusy, setTtsBusy] = useState(false);
  const [ttsStatus, setTtsStatus] = useState('Voice idle.');
  const [ttsActiveVoiceKey, setTtsActiveVoiceKey] = useState<string | null>(null);
  const ttsLatencyTraceRef = useRef<{
    firstAudioAt: number | null;
    firstDeltaAt: number | null;
    firstSpeechChunkAt: number | null;
    label: string;
    startedAt: number;
  } | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [subtitleText, setSubtitleText] = useState('');
  const blobAnimationUrlsRef = useRef<Set<string>>(new Set());
  const bundledModelUrlCacheRef = useRef<Map<string, string>>(new Map());
  const didHydrateAvatarRef = useRef(false);
  const ttsWarmVoicesRef = useRef<Set<string>>(new Set());
  const remoteTtsVoiceFetchAttemptedRef = useRef<Set<string>>(new Set());
  const assistantRenderRunRef = useRef(0);
  const assistantReplyLockedRef = useRef(false);
  const chatRequestRunRef = useRef(0);
  const chatHistoryRef = useRef<ChatMessage[]>([]);
  const chatHistoriesRef = useRef<Record<string, ChatMessage[]>>({});
  const activeChatHistoryStateKeyRef = useRef('');
  const relationshipMemoryRef = useRef<RelationshipMemory>(createDefaultRelationshipMemory());
  const relationshipMemoriesRef = useRef<Record<string, RelationshipMemory>>({});
  const aiSettingsRef = useRef<AiSettings>(createDefaultAiSettings());
  const twitchSettingsRef = useRef<TwitchSettings>(createDefaultTwitchSettings());
  const availableModelsRef = useRef<string[]>([]);
  const availableModelMetadataRef = useRef<Map<string, AppModelMetadata>>(new Map());
  const sequencerSettingsRef = useRef(createDefaultSequencerSettings());
  const directTwitchClientRef = useRef<DirectTwitchIrcClient | null>(null);
  const directTwitchCommandHandlerRef = useRef<(message: CommandChatMessage) => boolean>(
    () => false,
  );
  const directTwitchAiHandlerRef = useRef<(message: DirectTwitchChatMessage) => void>(() => {});
  const twitchActiveChattersRef = useRef<Map<string, number>>(new Map());
  const twitchKnownUsersRef = useRef<Set<string>>(new Set());
  const twitchContextRef = useRef<ChatTurn[]>([]);
  const twitchBatchRef = useRef<ChatTurn[]>([]);
  const twitchAiQueueRef = useRef<ChatAiJob[]>([]);
  const enqueueChatAiJobRef = useRef<(job: ChatAiJob) => void>(() => {});
  const twitchAiProcessingRef = useRef(false);
  const twitchLastReplyAtRef = useRef(0);
  const twitchBatchTimerRef = useRef<number | null>(null);
  const twitchStreamTranscriptsRef = useRef<TwitchStreamTranscript[]>([]);
  const twitchStreamTranscriptionBusyRef = useRef(false);
  const twitchStreamFrameRef = useRef<TwitchStreamFrame | null>(null);
  const twitchStreamVisionBusyRef = useRef(false);
  const memoryAgentPendingChatTurnCountsRef = useRef<Record<string, number>>({});
  const scheduleMemoryAgentAfterChatTurnsRef = useRef<(stateKey: string) => void>(() => {});
  const overlayAiStreamsRef = useRef<Map<string, { player: StreamingSpeechPlayer }>>(new Map());
  const subtitleDataRef = useRef<{ text: string; wordBoundaries: WordBoundary[] } | null>(null);
  const subtitleIntervalRef = useRef<number | null>(null);
  const subtitleClearTimeoutRef = useRef<number | null>(null);
  const subtitleStartedAtRef = useRef<number | null>(null);
  const liveBridgeSubtitleActiveRef = useRef(false);
  const startupStatusSentRef = useRef(false);
  const appliedPersonaSceneKeyRef = useRef<string | null>(null);
  const memoryAgentWorkerRef = useRef<Worker | null>(null);
  const memoryAgentTimeoutRef = useRef<number | null>(null);
  const memoryAgentRunRef = useRef(0);
  const memoryAgentFailedModelsRef = useRef<Set<string>>(new Set());
  const backendGrilloCadenceBusyRef = useRef(false);
  const grilloMemoryHydrationRunRef = useRef(0);
  const grilloRecentTurnsByStateKeyRef = useRef<Record<string, ChatTurn[]>>({});
  const ttsManager = useMemo(() => getTtsManager(), []);
  const ttsBenchmarkPlaybackRef = useRef<AudioPlayback | null>(null);

  const setAssistantReplyLock = useCallback((locked: boolean) => {
    assistantReplyLockedRef.current = locked;
    setAssistantReplyLocked(locked);
  }, []);

  const activePersona = useMemo(
    () => personas.find((persona) => persona.id === activePersonaId) ?? personas[0] ?? null,
    [activePersonaId, personas],
  );
  const activePersonaRef = useRef(activePersona);
  const activePersonaScenePreset = useMemo(
    () => getPersonaScenePreset(activePersona ?? DEFAULT_PERSONA),
    [activePersona],
  );
  const activePersonaMentionTag = useMemo(
    () => `@${getPersonaPrimaryMentionTag(activePersona ?? DEFAULT_PERSONA)}`,
    [activePersona],
  );
  const twitchModeLabel =
    !twitchSettings.streamModeEnabled
      ? 'Local'
      : twitchConnectionLabel === 'Live'
      ? twitchActiveChatterCount > twitchSettings.directChatterLimit
        ? 'Batch'
        : 'Queue'
      : twitchConnectionLabel;
  const latestAssistantMessage = useMemo(
    () => [...chatHistory].reverse().find((message) => message.role === 'assistant') ?? null,
    [chatHistory],
  );
  const selectedTtsVoice = useMemo(
    () => ttsVoices.find((voice) => voice.key === aiSettings.ttsVoice) ?? ttsVoices[0] ?? null,
    [aiSettings.ttsVoice, ttsVoices],
  );
  const selectedTtsCached = selectedTtsVoice
    ? ttsCachedVoiceKeys.includes(selectedTtsVoice.key)
    : false;
  const activeTtsVoice = useMemo(
    () => ttsVoices.find((voice) => voice.key === ttsActiveVoiceKey) ?? null,
    [ttsActiveVoiceKey, ttsVoices],
  );
  const ttsRuntimeSettings = useMemo(
    () => aiSettings,
    [
      aiSettings.fishSpeechChunkLength,
      aiSettings.fishSpeechConditionOnPreviousChunks,
      aiSettings.fishSpeechLatency,
      aiSettings.fishSpeechModel,
      aiSettings.fishSpeechVoiceId,
      aiSettings.inworldBufferCharThreshold,
      aiSettings.inworldDeliveryMode,
      aiSettings.inworldModelId,
      aiSettings.inworldVoiceId,
      aiSettings.remoteTtsMode,
      aiSettings.ttsEnabled,
      aiSettings.ttsExpressionTagsEnabled,
      aiSettings.ttsPlaybackRate,
      aiSettings.ttsProvider,
      aiSettings.ttsSimulatedStreaming,
      aiSettings.ttsVoice,
      aiSettings.ttsVolume,
    ],
  );
  const activeRemoteTtsVoices =
    ttsRuntimeSettings.ttsProvider === 'piper'
      ? []
      : remoteTtsVoices[ttsRuntimeSettings.ttsProvider];
  const activeRelationshipStateKey = useMemo(
    () => getLocalConversationStateKey(activePersona ?? DEFAULT_PERSONA),
    [activePersona],
  );
  const activeRelationshipStateKeyRef = useRef(activeRelationshipStateKey);
  if (!activeChatHistoryStateKeyRef.current) {
    activeChatHistoryStateKeyRef.current = activeRelationshipStateKey;
  }

  const syncMemoryAgentPendingCounts = useCallback(() => {
    setMemoryAgentPendingCounts({ ...memoryAgentPendingChatTurnCountsRef.current });
  }, []);

  const refreshGrilloMemoryState = useCallback((stateKey: string) => {
    const run = (grilloMemoryHydrationRunRef.current += 1);
    void hydrateGrilloMemoryState(stateKey).then((state) => {
      if (
        run === grilloMemoryHydrationRunRef.current &&
        shouldExposeScopedRelationshipMemory(stateKey, activeRelationshipStateKeyRef.current)
      ) {
        setGrilloMemoryState(state);
      }
    });
  }, []);

  const refreshMemoryBackendStatus = useCallback(() => {
    return Promise.all([
      loadLadybugMemoryStatus(),
      loadLadybugMemoryGraph(),
      loadLadybugGrilloRuntimeStatus(),
    ])
      .then(([status, graph, runtime]) => {
        setMemoryBackendStatus(status?.ok ? status : null);
        setMemoryGraphSummary(graph);
        setGrilloRuntimeStatus(runtime);
      })
      .catch((error) => {
        console.warn('[App] Failed to refresh Ladybug memory backend status', error);
        setMemoryBackendStatus(null);
        setMemoryGraphSummary(null);
        setGrilloRuntimeStatus(null);
      });
  }, []);

  useEffect(() => {
    void refreshMemoryBackendStatus();
    const timer = window.setInterval(() => {
      void refreshMemoryBackendStatus();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [refreshMemoryBackendStatus]);

  const getScopedRelationshipMemory = useCallback((stateKey: string) => {
    return relationshipMemoriesRef.current[stateKey] ?? createDefaultRelationshipMemory();
  }, []);

  const commitScopedRelationshipMemory = useCallback(
    (stateKey: string, memory: RelationshipMemory) => {
      setRelationshipMemories((current) => {
        const next = commitScopedRelationshipMemoryState(current, stateKey, memory);
        relationshipMemoriesRef.current = next;
        return next;
      });
      if (shouldExposeScopedRelationshipMemory(stateKey, activeRelationshipStateKeyRef.current)) {
        setRelationshipMemory(memory);
        relationshipMemoryRef.current = memory;
      }
    },
    [],
  );

  const clearScopedRelationshipMemory = useCallback((stateKey: string) => {
    setRelationshipMemories((current) => {
      const next = clearScopedRelationshipMemoryState(current, stateKey);
      relationshipMemoriesRef.current = next;
      return next;
    });
    if (shouldExposeScopedRelationshipMemory(stateKey, activeRelationshipStateKeyRef.current)) {
      const defaultMemory = createDefaultRelationshipMemory();
      setRelationshipMemory(defaultMemory);
      relationshipMemoryRef.current = defaultMemory;
    }
    return deleteLadybugRelationshipMemory(stateKey).catch((error) => {
      console.warn('[App] Failed to delete Ladybug relationship profile', error);
    });
  }, []);

  useEffect(() => {
    chatHistoryRef.current = chatHistory;
  }, [chatHistory]);

  useEffect(() => {
    chatHistoriesRef.current = chatHistories;
  }, [chatHistories]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    const stateKey = activeChatHistoryStateKeyRef.current || activeRelationshipStateKey;
    setChatHistories((current) => {
      if (current[stateKey] === chatHistory) {
        return current;
      }
      const next = {
        ...current,
        [stateKey]: chatHistory,
      };
      chatHistoriesRef.current = next;
      return next;
    });
  }, [chatHistory, activeRelationshipStateKey, hydrated]);

  useEffect(() => {
    relationshipMemoryRef.current = relationshipMemory;
  }, [relationshipMemory]);

  useEffect(() => {
    relationshipMemoriesRef.current = relationshipMemories;
  }, [relationshipMemories]);

  useEffect(() => {
    activePersonaRef.current = activePersona;
  }, [activePersona]);

  const recordRawChatMemoryTurns = useCallback(
    (stateKey: string, turns: ChatTurn[]) => {
      if (turns.length === 0) {
        return;
      }
      grilloRecentTurnsByStateKeyRef.current[stateKey] = [
        ...(grilloRecentTurnsByStateKeyRef.current[stateKey] ?? []),
        ...turns,
      ].slice(-24);
      addMemoryAgentPendingChatTurns(
        memoryAgentPendingChatTurnCountsRef.current,
        stateKey,
        turns.length,
      );
      syncMemoryAgentPendingCounts();
      void recordGrilloMemoryTurnFailClosedAsync(
        {
          assistantText: '',
          persona: activePersonaRef.current ?? DEFAULT_PERSONA,
          scopeKey: stateKey,
          turns,
        },
        (error) => {
          console.warn('[App] Failed to record raw chat memory turns', error);
        },
      )
        .then((nextGrilloMemoryState) => {
          if (
            nextGrilloMemoryState &&
            shouldExposeScopedRelationshipMemory(stateKey, activeRelationshipStateKeyRef.current)
          ) {
            setGrilloMemoryState(nextGrilloMemoryState);
          }
          void refreshMemoryBackendStatus();
        });
      scheduleMemoryAgentAfterChatTurnsRef.current(stateKey);
    },
    [refreshMemoryBackendStatus, syncMemoryAgentPendingCounts],
  );

  const captureTwitchStreamTranscript = useCallback(async () => {
    const currentTwitchSettings = twitchSettingsRef.current;
    if (
      !currentTwitchSettings.streamTranscriptionEnabled ||
      twitchStreamTranscriptionBusyRef.current
    ) {
      return;
    }

    const channel =
      directTwitchClientRef.current?.channel || twitchChannel || DIRECT_TWITCH_CHANNEL;
    if (!channel) {
      return;
    }

    twitchStreamTranscriptionBusyRef.current = true;
    const llmProvider = aiSettingsRef.current.llmProvider;
    setTwitchStreamTranscriptionStatus(`Sampling #${channel} audio for stream transcription...`);
    try {
      const transcript = await requestTwitchStreamTranscript({
        channel,
        llmProvider,
        model: currentTwitchSettings.streamTranscriptionModel || 'openai/whisper-large-v3',
        providerKeyVaultWorkspaceId,
        sampleSeconds: currentTwitchSettings.streamTranscriptionSampleSeconds,
      });
      setTwitchStreamTranscripts((current) =>
        [...current, transcript].slice(-currentTwitchSettings.streamTranscriptionContextLimit),
      );
      setTwitchStreamTranscriptionStatus(
        `Last stream audio sample: ${new Date(transcript.createdAt).toLocaleTimeString()} (${transcript.text.slice(0, 90)}${transcript.text.length > 90 ? '...' : ''})`,
      );
    } catch (error) {
      setTwitchStreamTranscriptionStatus(
        `Stream transcription failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    } finally {
      twitchStreamTranscriptionBusyRef.current = false;
    }
  }, [providerKeyVaultWorkspaceId, twitchChannel]);

  const captureTwitchStreamFrame = useCallback(async () => {
    const currentTwitchSettings = twitchSettingsRef.current;
    if (!currentTwitchSettings.streamVisionContextEnabled || twitchStreamVisionBusyRef.current) {
      return;
    }

    const channel =
      directTwitchClientRef.current?.channel || twitchChannel || DIRECT_TWITCH_CHANNEL;
    if (!channel) {
      return;
    }

    twitchStreamVisionBusyRef.current = true;
    setTwitchStreamVisionStatus(`Capturing #${channel} stream frame...`);
    try {
      const frame = await requestTwitchStreamFrame({
        channel,
        detail: currentTwitchSettings.streamVisionDetail,
      });
      setTwitchStreamFrame(frame);
      setTwitchStreamVisionStatus(
        `Last stream frame: ${new Date(frame.createdAt).toLocaleTimeString()} (${frame.detail})`,
      );
    } catch (error) {
      setTwitchStreamVisionStatus(
        `Stream frame capture failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    } finally {
      twitchStreamVisionBusyRef.current = false;
    }
  }, [twitchChannel]);

  useEffect(() => {
    if (!hydrated || !twitchSettings.streamTranscriptionEnabled) {
      return;
    }

    void captureTwitchStreamTranscript();
    const interval = window.setInterval(
      () => void captureTwitchStreamTranscript(),
      twitchSettings.streamTranscriptionIntervalSeconds * 1000,
    );
    return () => window.clearInterval(interval);
  }, [
    captureTwitchStreamTranscript,
    hydrated,
    twitchSettings.streamTranscriptionEnabled,
    twitchSettings.streamTranscriptionIntervalSeconds,
  ]);

  useEffect(() => {
    if (!hydrated || !twitchSettings.streamVisionContextEnabled) {
      return;
    }

    void captureTwitchStreamFrame();
    const interval = window.setInterval(
      () => void captureTwitchStreamFrame(),
      twitchSettings.streamVisionIntervalSeconds * 1000,
    );
    return () => window.clearInterval(interval);
  }, [
    captureTwitchStreamFrame,
    hydrated,
    twitchSettings.streamVisionContextEnabled,
    twitchSettings.streamVisionIntervalSeconds,
  ]);

  useEffect(() => {
    activeRelationshipStateKeyRef.current = activeRelationshipStateKey;
    if (!hydrated) {
      return;
    }
    const previousChatStateKey = activeChatHistoryStateKeyRef.current || activeRelationshipStateKey;
    if (previousChatStateKey !== activeRelationshipStateKey) {
      const nextChatHistories = {
        ...chatHistoriesRef.current,
        [previousChatStateKey]: chatHistoryRef.current,
      };
      const nextChatHistory = nextChatHistories[activeRelationshipStateKey] ?? [];
      chatHistoriesRef.current = nextChatHistories;
      chatHistoryRef.current = nextChatHistory;
      activeChatHistoryStateKeyRef.current = activeRelationshipStateKey;
      setChatHistories(nextChatHistories);
      setChatHistory(nextChatHistory);
      setChatGenerating(false);
    }
    setRelationshipMemory(getScopedRelationshipMemory(activeRelationshipStateKey));
    refreshGrilloMemoryState(activeRelationshipStateKey);
  }, [activeRelationshipStateKey, getScopedRelationshipMemory, hydrated, refreshGrilloMemoryState]);

  useEffect(() => {
    aiSettingsRef.current = aiSettings;
  }, [aiSettings]);

  useEffect(() => {
    if (
      !hydrated ||
      (aiSettings.embeddingMode !== 'browser' && aiSettings.embeddingMode !== 'auto')
    ) {
      return;
    }

    let cancelled = false;
    const model = aiSettings.embeddingLocalModel.trim() || DEFAULT_LOCAL_EMBEDDING_MODEL;
    setMemoryEmbeddingDebug({
      inputChars: 0,
      model,
      operation: 'prompt-recall',
      provider: 'transformers-local',
      status: 'warming',
      updatedAt: Date.now(),
    });
    void warmLocalTextEmbeddingModel(model).then((ok) => {
      if (cancelled) {
        return;
      }
      setMemoryEmbeddingDebug({
        error: ok ? undefined : 'Local embedding model warmup failed.',
        inputChars: 0,
        model,
        operation: 'prompt-recall',
        provider: 'transformers-local',
        status: ok ? 'ready' : 'failed',
        updatedAt: Date.now(),
      });
    });

    return () => {
      cancelled = true;
    };
  }, [aiSettings.embeddingLocalModel, aiSettings.embeddingMode, hydrated]);

  useEffect(() => {
    twitchSettingsRef.current = twitchSettings;
  }, [twitchSettings]);

  useEffect(() => {
    twitchStreamTranscriptsRef.current = twitchStreamTranscripts;
  }, [twitchStreamTranscripts]);

  useEffect(() => {
    twitchStreamFrameRef.current = twitchStreamFrame;
  }, [twitchStreamFrame]);

  useEffect(() => {
    availableModelsRef.current = availableModels;
  }, [availableModels]);

  useEffect(() => {
    availableModelMetadataRef.current = availableModelMetadata;
  }, [availableModelMetadata]);

  useEffect(() => {
    sequencerSettingsRef.current = sequencerSettings;
  }, [sequencerSettings]);

  useEffect(() => {
    memoryAgentFailedModelsRef.current.clear();
  }, [aiSettings.memoryAgentModel]);

  useEffect(() => {
    setMenuOpen(false);
  }, []);

  useEffect(() => {
    const worker = new Worker(new URL('./lib/chat/memory-agent-worker.ts', import.meta.url), {
      type: 'module',
    });
    memoryAgentWorkerRef.current = worker;

    return () => {
      if (memoryAgentTimeoutRef.current !== null) {
        window.clearTimeout(memoryAgentTimeoutRef.current);
      }
      memoryAgentTimeoutRef.current = null;
      memoryAgentRunRef.current += 1;
      worker.terminate();
      memoryAgentWorkerRef.current = null;
    };
  }, []);

  const desktopWindowMode =
    desktopRuntime?.mode ??
    (typeof window !== 'undefined' && window.webWaifuDesktop?.isDesktop
      ? window.webWaifuDesktop.mode
      : 'editor');
  const desktopForcesTransparentScene =
    desktopWindowMode !== 'editor' && visualSettings.sceneBackgroundMode !== 'chroma';
  const renderedVisualSettings = useMemo(
    () =>
      desktopForcesTransparentScene && visualSettings.sceneBackgroundMode !== 'transparent'
        ? { ...visualSettings, sceneBackgroundMode: 'transparent' as const }
        : visualSettings,
    [desktopForcesTransparentScene, visualSettings],
  );

  const shellStyle = useMemo(() => {
    const backgroundMode = renderedVisualSettings.sceneBackgroundMode;
    const customImage = renderedVisualSettings.sceneBackgroundImage.trim();
    const customOverlay = renderedVisualSettings.sceneBackgroundOverlay.trim();
    const customFilter = renderedVisualSettings.sceneBackgroundFilter.trim();
    const transparentBackground = backgroundMode === 'transparent';
    const backgroundImage =
      backgroundMode === 'custom' && customImage
        ? customImage
        : activePersonaScenePreset.backgroundImage;
    const backgroundOverlay = transparentBackground
      ? 'none'
      : backgroundMode === 'chroma'
        ? 'linear-gradient(0deg, var(--stream-chroma-color), var(--stream-chroma-color))'
        : backgroundMode === 'custom' && customOverlay
          ? customOverlay
          : activePersonaScenePreset.backgroundOverlay;
    const backgroundFilter =
      transparentBackground || backgroundMode === 'chroma'
        ? 'none'
        : backgroundMode === 'custom' && customFilter
          ? customFilter
          : activePersonaScenePreset.backgroundFilter;

    return {
      '--safe-top': `${safeArea.top}px`,
      '--safe-right': `${safeArea.right}px`,
      '--safe-bottom': `${safeArea.bottom}px`,
      '--safe-left': `${safeArea.left}px`,
      '--stream-bg-image':
        transparentBackground || backgroundMode === 'chroma' ? 'none' : `url("${backgroundImage}")`,
      '--stream-bg-color': transparentBackground
        ? 'transparent'
        : backgroundMode === 'chroma'
          ? renderedVisualSettings.sceneChromaColor
          : '#02040a',
      '--stream-bg-overlay': backgroundOverlay,
      '--stream-bg-filter': backgroundFilter,
      '--stream-chroma-color': renderedVisualSettings.sceneChromaColor,
      '--c-text-accent': activePersonaScenePreset.accent,
      '--c-border': activePersonaScenePreset.border,
      '--c-panel': activePersonaScenePreset.panel,
      '--text-muted': activePersonaScenePreset.textMuted,
    } as CSSProperties;
  }, [activePersonaScenePreset, renderedVisualSettings, safeArea]);

  const loadAvailableModels = useCallback(async () => {
    setModelsLoading(true);
    setModelsError(null);

    try {
      const llmProvider = aiSettingsRef.current.llmProvider;
      const headers = await buildBackendProviderHeaders({
        llmProvider,
        model: aiSettingsRef.current.model,
        providerKeyVaultWorkspaceId,
      });
      const response = await fetch(getAiModelsUrl(llmProvider), {
        cache: 'no-store',
        headers,
      });
      if (!response.ok) {
        throw new Error(`Provider models failed with HTTP ${response.status}.`);
      }
      const data = (await response.json()) as AppModelsResponse;
      if (!data.ok) {
        throw new Error(data.error || 'Provider model list failed.');
      }
      const modelMetadata = getModelMetadataFromResponse(data);
      const providerModels = mergeModels(
        modelMetadata.length > 0
          ? modelMetadata.filter(isChatModel).map((model) => model.id)
          : getModelIdsFromResponse(data),
      );
      const providerModelMetadata = new Map(modelMetadata.map((model) => [model.id, model] as const));
      setAvailableModels(providerModels);
      setAvailableModelMetadata(providerModelMetadata);
      setAiSettings((current) =>
        current.llmProvider === llmProvider
          ? sanitizeAiModels(current, providerModels, providerModelMetadata)
          : current,
      );
    } catch (error) {
      const message = getAiErrorMessage(error, 'models');
      setModelsError(message);
    } finally {
      setModelsLoading(false);
    }
  }, [providerKeyVaultWorkspaceId]);

  const refreshAiProxyHealth = useCallback(async () => {
    try {
      const providerHeaders = await buildBackendProviderHeaders({
        llmProvider: aiSettingsRef.current.llmProvider,
        model: aiSettingsRef.current.model,
        providerKeyVaultWorkspaceId,
      });
      const response = await fetch(
        getAiHealthUrl({
          model: aiSettingsRef.current.model,
          stateKey: activeRelationshipStateKeyRef.current,
          transportMode: aiSettingsRef.current.aiTransportMode,
        }),
        {
          cache: 'no-store',
          headers: { ...providerHeaders, Accept: 'application/json' },
        },
      );
      if (!response.ok) {
        throw new Error(`AI proxy health failed with HTTP ${response.status}.`);
      }
      const data = (await response.json()) as AiProxyHealth & { ok?: boolean; error?: string };
      if (data.ok === false) {
        throw new Error(data.error || 'AI proxy health check failed.');
      }
      setAiProxyHealth(data);
      setAiProxyHealthError(null);
    } catch (error) {
      setAiProxyHealthError(
        error instanceof Error ? error.message : 'AI proxy health check failed.',
      );
    }
  }, [providerKeyVaultWorkspaceId]);

  const stopTtsPlayback = useCallback(() => {
    ttsManager.stop();
  }, [ttsManager]);

  const clearChatDisplayOverride = useCallback((messageId: string) => {
    setChatDisplayOverrides((current) => {
      if (!(messageId in current)) {
        return current;
      }

      const next = { ...current };
      delete next[messageId];
      return next;
    });
  }, []);

  const cancelAssistantPresentation = useCallback(
    (stopAudio = false) => {
      assistantRenderRunRef.current += 1;
      chatRequestRunRef.current += 1;
      memoryAgentRunRef.current += 1;
      setAssistantReplyLock(false);
      if (memoryAgentTimeoutRef.current !== null) {
        window.clearTimeout(memoryAgentTimeoutRef.current);
        memoryAgentTimeoutRef.current = null;
      }
      setChatDisplayOverrides({});
      if (stopAudio) {
        stopTtsPlayback();
      }
    },
    [setAssistantReplyLock, stopTtsPlayback],
  );

  const refreshStoredTtsVoices = useCallback(async () => {
    try {
      setTtsCachedVoiceKeys(await getStoredPiperVoiceKeys());
    } catch (error) {
      console.warn('[TTS] Could not read cached Piper voices', error);
    }
  }, []);

  const loadTtsVoices = useCallback(async () => {
    setTtsVoicesLoading(true);
    setTtsVoicesError(null);

    try {
      const voices = await listPiperVoices();
      setTtsVoices(voices);
      setAiSettings((current) => ({
        ...current,
        ttsVoice: voices.some((voice) => voice.key === current.ttsVoice)
          ? current.ttsVoice
          : (voices[0]?.key ?? current.ttsVoice),
      }));
      setTtsStatus('Piper voices ready.');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Voice registry unavailable right now.';
      setTtsVoicesError(message);
      setTtsVoices([...CUSTOM_RIKO_PIPER_VOICES]);
      setTtsStatus(`Voice fallback active: ${message}`);
    } finally {
      await refreshStoredTtsVoices();
      setTtsVoicesLoading(false);
    }
  }, [refreshStoredTtsVoices]);

  const loadRemoteTtsVoices = useCallback(
    async (provider: RemoteTtsProvider, force = false) => {
      const fishScope = aiSettingsRef.current.fishSpeechVoiceScope;
      const fetchKey = provider === 'fish-speech' ? `${provider}:${fishScope}` : provider;
      if (!force && remoteTtsVoiceFetchAttemptedRef.current.has(fetchKey)) {
        return;
      }
      remoteTtsVoiceFetchAttemptedRef.current.add(fetchKey);
      setRemoteTtsVoicesLoading(true);
      setRemoteTtsVoicesError(null);

      try {
        const providerApiKey = await getBrowserRemoteTtsApiKey(
          provider,
          providerKeyVaultWorkspaceId,
        );
        const voices = await fetchRemoteTtsVoices(provider, { fishScope, providerApiKey });
        setRemoteTtsVoices((current) => ({
          ...current,
          [provider]: voices,
        }));
        setTtsStatus(`${getTtsProviderLabel(provider)} voices ready (${voices.length}).`);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Remote voice registry unavailable.';
        setRemoteTtsVoicesError(message);
        setTtsStatus(`Remote voice fetch failed: ${message}`);
        if (force) {
          remoteTtsVoiceFetchAttemptedRef.current.delete(fetchKey);
        }
      } finally {
        setRemoteTtsVoicesLoading(false);
      }
    },
    [providerKeyVaultWorkspaceId],
  );

  const handleCreateVoiceLabProviderVoice = useCallback(
    async (request: CreateRemoteTtsVoiceRequest): Promise<CreatedRemoteTtsVoice> => {
      const providerApiKey = await getBrowserRemoteTtsApiKey(
        request.provider,
        providerKeyVaultWorkspaceId,
      );
      const voice = await createRemoteTtsVoice(request, { providerApiKey });
      remoteTtsVoiceFetchAttemptedRef.current.delete(request.provider);
      for (const key of Array.from(remoteTtsVoiceFetchAttemptedRef.current)) {
        if (key.startsWith(`${request.provider}:`)) {
          remoteTtsVoiceFetchAttemptedRef.current.delete(key);
        }
      }
      void loadRemoteTtsVoices(request.provider, true);
      setTtsStatus(`${getTtsProviderLabel(request.provider)} voice created: ${voice.name}.`);
      return voice;
    },
    [loadRemoteTtsVoices, providerKeyVaultWorkspaceId],
  );

  useEffect(() => {
    if (ttsRuntimeSettings.ttsProvider === 'piper') {
      return;
    }
    void loadRemoteTtsVoices(ttsRuntimeSettings.ttsProvider);
  }, [ttsRuntimeSettings.ttsProvider, loadRemoteTtsVoices]);

  const speakWithSelectedTts = useCallback(
    async (text: string, label: string) => {
      const content = text.trim();
      if (!content) {
        return;
      }
      if (ttsRuntimeSettings.ttsProvider === 'piper' && !selectedTtsVoice) {
        return;
      }

      const activeTtsLabel = getActiveTtsLabel(ttsRuntimeSettings, selectedTtsVoice);
      setTtsBusy(true);
      setTtsVoicesError(null);
      setTtsStatus(`Synthesizing ${activeTtsLabel}...`);

      try {
        ttsManager.enableTts = ttsRuntimeSettings.ttsEnabled;
        if (ttsRuntimeSettings.ttsProvider === 'piper') {
          await ttsManager.speakPiperText(content, selectedTtsVoice!.key);
          setTtsActiveVoiceKey(selectedTtsVoice!.key);
          await refreshStoredTtsVoices();
        } else {
          const providerApiKey = await getBrowserRemoteTtsApiKey(
            ttsRuntimeSettings.ttsProvider,
            providerKeyVaultWorkspaceId,
          );
          await ttsManager.speakRemoteText(createRemoteTtsRequest(content, ttsRuntimeSettings), {
            providerApiKey,
          });
          setTtsActiveVoiceKey(null);
        }
        setTtsStatus(`${label} finished.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown TTS synthesis failure.';
        setTtsVoicesError(message);
        setTtsStatus(`TTS failed: ${message}`);
        console.error('[TTS] Synthesis failed:', error);
      } finally {
        setTtsBusy(false);
      }
    },
    [
      providerKeyVaultWorkspaceId,
      refreshStoredTtsVoices,
      selectedTtsVoice,
      ttsManager,
      ttsRuntimeSettings,
    ],
  );

  const updateAssistantMessageContent = useCallback((messageId: string, content: string) => {
    setChatHistory((current) =>
      trimChatHistory(
        current.map((message) =>
          message.id === messageId
            ? {
                ...message,
                content,
              }
            : message,
        ),
      ),
    );
  }, []);

  const createStreamingAssistantPlayer = useCallback(
    (assistantMessage: ChatMessage, shouldSpeak: boolean, label: string) => {
      const thisRun = ++assistantRenderRunRef.current;
      const voice = selectedTtsVoice;
      const ttsProvider = ttsRuntimeSettings.ttsProvider;
      const chunkTtsRequests = shouldChunkTtsRequests(ttsRuntimeSettings);
      const canSpeak = shouldSpeak && (ttsProvider !== 'piper' || Boolean(voice));
      const liveBridgeTts =
        canSpeak &&
        canUseFishLiveBridge(ttsRuntimeSettings);
      const latencyTrace = {
        firstAudioAt: null as number | null,
        firstDeltaAt: null as number | null,
        firstSpeechChunkAt: null as number | null,
        label,
        startedAt: performance.now(),
      };
      ttsLatencyTraceRef.current = latencyTrace;
      const metadataFilter = createAssistantReplyStreamFilter();
      let fullText = '';
      let displayText = '';
      let queuedDisplayText = '';
      let displayPumpTimer: number | null = null;
      let liveSubtitleText = '';
      let queuedLiveSubtitleText = '';
      let liveSubtitlePumpTimer: number | null = null;
      let finalDisplayPending = false;
      let pendingText = '';
      let rawDeltaText = '';
      let staleDeltaCount = 0;
      let sawDelta = false;
      let queuedSpeech = false;
      let liveBridgeSink: RemotePcmPushStream | null = null;
      const speechPromises: Promise<void>[] = [];
      const displaySettledResolvers: Array<() => void> = [];

      if (canSpeak) {
        ttsManager.enableTts = ttsRuntimeSettings.ttsEnabled;
        ttsManager.resetSpeechQueue();
        if (liveBridgeTts) {
          liveBridgeSubtitleActiveRef.current = true;
          stopSubtitleTracking(true);
          liveBridgeSink = ttsManager.startRemotePcmPushStream(`${label} live bridge`);
          queuedSpeech = true;
        }
        setTtsBusy(true);
        setTtsVoicesError(null);
        setTtsActiveVoiceKey(ttsProvider === 'piper' ? voice!.key : null);
        setTtsStatus(`Streaming ${getActiveTtsLabel(ttsRuntimeSettings, voice)}...`);
      }

      const isStale = () => assistantRenderRunRef.current !== thisRun;

      const resolveDisplaySettled = () => {
        while (displaySettledResolvers.length > 0) {
          displaySettledResolvers.shift()?.();
        }
      };

      const waitForDisplaySettled = () => {
        if (!queuedDisplayText && displayPumpTimer === null) {
          return Promise.resolve();
        }

        return new Promise<void>((resolve) => {
          displaySettledResolvers.push(resolve);
        });
      };

      const setDisplayOverride = (value: string) => {
        setChatDisplayOverrides((current) => ({
          ...current,
          [assistantMessage.id]: value,
        }));
      };

      setDisplayOverride('');

      const pumpDisplay = () => {
        displayPumpTimer = null;
        if (isStale()) {
          resolveDisplaySettled();
          return;
        }

        if (!queuedDisplayText) {
          resolveDisplaySettled();
          if (finalDisplayPending && displayText.trim() === fullText.trim()) {
            window.setTimeout(() => {
              if (!isStale()) {
                clearChatDisplayOverride(assistantMessage.id);
              }
            }, STREAM_DISPLAY_PUNCTUATION_PAUSE_MS);
          }
          return;
        }

        const nextText = queuedDisplayText.slice(0, STREAM_DISPLAY_CHARS_PER_TICK);
        queuedDisplayText = queuedDisplayText.slice(nextText.length);
        displayText += nextText;
        setDisplayOverride(displayText);

        const pause =
          /[.!?]["')\]]?\s*$/.test(displayText) && queuedDisplayText
            ? STREAM_DISPLAY_PUNCTUATION_PAUSE_MS
            : STREAM_DISPLAY_TICK_MS;
        displayPumpTimer = window.setTimeout(pumpDisplay, pause);
      };

      const queueDisplayText = (text: string) => {
        if (!text || isStale()) {
          return;
        }

        queuedDisplayText += text;
        if (displayPumpTimer === null) {
          displayPumpTimer = window.setTimeout(pumpDisplay, 0);
        }
      };

      const pumpLiveSubtitle = () => {
        liveSubtitlePumpTimer = null;
        if (isStale() || !liveBridgeTts) {
          return;
        }
        if (!queuedLiveSubtitleText) {
          return;
        }
        const nextText = queuedLiveSubtitleText.slice(0, LIVE_BRIDGE_SUBTITLE_CHARS_PER_TICK);
        queuedLiveSubtitleText = queuedLiveSubtitleText.slice(nextText.length);
        liveSubtitleText += nextText;
        setSubtitleText(getLiveBridgeSubtitleLine(liveSubtitleText));
        const pause =
          /[.!?]["')\]]?\s*$/.test(liveSubtitleText) && queuedLiveSubtitleText
            ? LIVE_BRIDGE_SUBTITLE_PUNCTUATION_PAUSE_MS
            : LIVE_BRIDGE_SUBTITLE_TICK_MS;
        if (queuedLiveSubtitleText) {
          liveSubtitlePumpTimer = window.setTimeout(pumpLiveSubtitle, pause);
        }
      };

      const queueLiveSubtitleText = (text: string) => {
        if (!text || isStale() || !liveBridgeTts) {
          return;
        }
        queuedLiveSubtitleText += text;
        if (liveSubtitlePumpTimer === null) {
          liveSubtitlePumpTimer = window.setTimeout(pumpLiveSubtitle, 0);
        }
      };

      const enqueueSpeech = (chunk: string) => {
        if (!canSpeak || isStale()) {
          return;
        }

        if (latencyTrace.firstSpeechChunkAt === null) {
          latencyTrace.firstSpeechChunkAt = performance.now();
          console.info('[TTS Latency] first speech chunk', {
            chunkLength: chunk.length,
            label,
            mode: getEffectiveRemoteTtsMode(ttsRuntimeSettings),
            msFromStart: Math.round(latencyTrace.firstSpeechChunkAt - latencyTrace.startedAt),
            provider: ttsProvider,
            transport:
              ttsProvider === 'fish-speech'
                ? ttsRuntimeSettings.fishSpeechTransport
                : ttsProvider === 'inworld'
                  ? ttsRuntimeSettings.inworldTransport
                  : 'piper',
          });
        }
        queuedSpeech = true;
        const task =
          ttsProvider === 'piper'
            ? ttsManager.queuePiperText(chunk, voice!.key)
            : (async () => {
                const providerApiKey = await getBrowserRemoteTtsApiKey(
                  ttsProvider,
                  providerKeyVaultWorkspaceId,
                );
                return ttsManager.queueRemoteText(
                  createRemoteTtsRequest(chunk, ttsRuntimeSettings),
                  {
                    providerApiKey,
                  },
                );
              })();
        speechPromises.push(
          task.catch((error) => {
            const message =
              error instanceof Error ? error.message : 'Unknown streaming TTS failure.';
            setTtsVoicesError(message);
            setTtsStatus(`TTS failed: ${message}`);
            console.error('[TTS] Streaming synthesis failed:', error);
          }),
        );
      };

      const consumeSpeakableChunks = (force = false) => {
        const extracted = extractSpeakableChunks(pendingText, force);
        pendingText = extracted.remaining;
        for (const chunk of extracted.chunks) {
          enqueueSpeech(chunk);
        }
      };

      const cancel = () => {
        assistantRenderRunRef.current += 1;
        if (displayPumpTimer !== null) {
          window.clearTimeout(displayPumpTimer);
          displayPumpTimer = null;
        }
        if (liveSubtitlePumpTimer !== null) {
          window.clearTimeout(liveSubtitlePumpTimer);
          liveSubtitlePumpTimer = null;
        }
        queuedDisplayText = '';
        queuedLiveSubtitleText = '';
        pendingText = '';
        liveBridgeSubtitleActiveRef.current = false;
        if (liveBridgeSink) {
          void liveBridgeSink.close().catch(() => undefined);
          liveBridgeSink = null;
        }
        if (canSpeak) {
          ttsManager.stop();
          setTtsBusy(false);
          setTtsStatus(`${label} cancelled.`);
        }
        resolveDisplaySettled();
        clearChatDisplayOverride(assistantMessage.id);
      };

      const pushAudioChunk = (chunk: RemoteTtsAudioChunk) => {
        if (!liveBridgeSink || isStale()) {
          return;
        }
        if (latencyTrace.firstAudioAt === null) {
          latencyTrace.firstAudioAt = performance.now();
          console.info('[TTS Latency] first audio chunk', {
            label,
            mimeType: chunk.mimeType,
            msFromFirstDelta:
              latencyTrace.firstDeltaAt === null
                ? null
                : Math.round(latencyTrace.firstAudioAt - latencyTrace.firstDeltaAt),
            msFromStart: Math.round(latencyTrace.firstAudioAt - latencyTrace.startedAt),
            provider: ttsProvider,
          });
        }
        speechPromises.push(
          liveBridgeSink.push(chunk).catch((error) => {
            const message =
              error instanceof Error ? error.message : 'Unknown live bridge playback failure.';
            setTtsVoicesError(message);
            setTtsStatus(`TTS failed: ${message}`);
            console.error('[TTS] Live bridge playback failed:', error);
          }),
        );
      };

      const pushDelta = (delta: string) => {
        if (!delta) {
          return;
        }
        rawDeltaText += delta;
        if (isStale()) {
          staleDeltaCount += 1;
          return;
        }
        if (latencyTrace.firstDeltaAt === null) {
          latencyTrace.firstDeltaAt = performance.now();
          console.info('[TTS Latency] first LLM delta', {
            label,
            msFromStart: Math.round(latencyTrace.firstDeltaAt - latencyTrace.startedAt),
          });
        }

        const visibleDelta = metadataFilter.push(delta);
        if (!visibleDelta) {
          return;
        }

        sawDelta = true;
        fullText += visibleDelta;
        queueDisplayText(visibleDelta);
        if (liveBridgeTts) {
          queueLiveSubtitleText(visibleDelta);
        }
        if (chunkTtsRequests && !liveBridgeTts) {
          pendingText += visibleDelta;
          consumeSpeakableChunks(false);
        }
      };

      const finish = async (finalText?: string) => {
        const rawFinalText = finalText ?? fullText;
        const parsedReply = metadataFilter.finish(finalText ?? fullText);
        const normalizedFinal = parsedReply.text;
        const metaOpenIndex = rawFinalText.indexOf('<yw-meta>');
        const metaCloseIndex = rawFinalText.indexOf('</yw-meta>');
        const staleAtFinish = isStale();
        const streamDebug = {
          chunkTtsRequests,
          displayLength: displayText.length,
          label,
          liveBridgeTts,
          metaBalanced:
            metaOpenIndex === -1 || (metaCloseIndex > metaOpenIndex && metaCloseIndex !== -1),
          metaCloseIndex,
          metaOpenIndex,
          messageId: assistantMessage.id,
          normalizedFinalLength: normalizedFinal.length,
          normalizedTail: normalizedFinal.slice(-160),
          queuedDisplayLength: queuedDisplayText.length,
          rawDeltaLength: rawDeltaText.length,
          rawDeltaTail: rawDeltaText.slice(-160),
          rawFinalLength: rawFinalText.length,
          rawFinalTail: rawFinalText.slice(-160),
          run: thisRun,
          sawDelta,
          staleAtFinish,
          staleDeltaCount,
          ttsProvider,
          visibleFullLength: fullText.length,
          ...metadataFilter.debug(),
        };
        if (
          staleAtFinish ||
          staleDeltaCount > 0 ||
          streamDebug.metaBalanced === false ||
          (rawFinalText && normalizedFinal && rawFinalText.length - normalizedFinal.length > 80)
        ) {
          console.warn('[AI Stream Debug] suspicious assistant stream finish', streamDebug);
        } else {
          console.info('[AI Stream Debug] assistant stream finish', streamDebug);
        }
        if (!isStale() && !sawDelta && normalizedFinal && normalizedFinal !== fullText.trim()) {
          if (!sawDelta) {
            fullText = normalizedFinal;
            pendingText = normalizedFinal;
            queueDisplayText(normalizedFinal);
            queueLiveSubtitleText(normalizedFinal);
          } else if (normalizedFinal.startsWith(fullText)) {
            const suffix = normalizedFinal.slice(fullText.length);
            fullText = normalizedFinal;
            pendingText += suffix;
            queueDisplayText(suffix);
            queueLiveSubtitleText(suffix);
          } else {
            const suffix = findOverlappingSuffix(fullText, normalizedFinal);
            const visiblePrefix = displayText + queuedDisplayText;
            fullText = normalizedFinal;
            if (normalizedFinal.startsWith(visiblePrefix)) {
              const suffix = normalizedFinal.slice(visiblePrefix.length);
              queueDisplayText(suffix);
              queueLiveSubtitleText(suffix);
            } else {
              displayText = '';
              queuedDisplayText = '';
              queueDisplayText(normalizedFinal);
              liveSubtitleText = '';
              queuedLiveSubtitleText = '';
              queueLiveSubtitleText(normalizedFinal);
            }
            pendingText += suffix;
          }
        }
        if (!isStale() && fullText.trim()) {
          updateAssistantMessageContent(assistantMessage.id, fullText.trim());
        }

        if (liveBridgeTts) {
          if (liveSubtitlePumpTimer !== null && queuedLiveSubtitleText.length > 0) {
            window.clearTimeout(liveSubtitlePumpTimer);
            liveSubtitlePumpTimer = null;
            let flushedChunks = 0;
            while (queuedLiveSubtitleText.length > 0 && flushedChunks < 12 && !isStale()) {
              pumpLiveSubtitle();
              flushedChunks += 1;
            }
            if (queuedLiveSubtitleText.length > 0 && !isStale()) {
              liveSubtitlePumpTimer = window.setTimeout(pumpLiveSubtitle, 0);
            }
          }
          if (liveBridgeSink) {
            speechPromises.push(liveBridgeSink.close());
          }
          liveBridgeSubtitleActiveRef.current = false;
        } else if (chunkTtsRequests) {
          consumeSpeakableChunks(true);
        } else {
          const finalSpeechText = (fullText.trim() || normalizedFinal).trim();
          if (finalSpeechText) {
            enqueueSpeech(finalSpeechText);
          }
        }
        finalDisplayPending = true;
        void waitForDisplaySettled().then(() => {
          if (!isStale() && displayText.trim() === fullText.trim()) {
            clearChatDisplayOverride(assistantMessage.id);
          }
        });

        await waitForDisplaySettled();

        if (!isStale() && canSpeak) {
          if (speechPromises.length > 0) {
            await Promise.allSettled(speechPromises);
            if (!isStale() && queuedSpeech) {
              if (ttsProvider === 'piper') {
                await refreshStoredTtsVoices();
              }
            }
          }

          if (!isStale()) {
            setTtsBusy(false);
            setTtsStatus(`${label} finished.`);
          }
        }

        return {
          metadata: parsedReply.metadata,
          text: fullText.trim() || normalizedFinal,
        };
      };

      return { cancel, finish, pushAudioChunk, pushDelta };
    },
    [
      providerKeyVaultWorkspaceId,
      refreshStoredTtsVoices,
      selectedTtsVoice,
      ttsManager,
      ttsRuntimeSettings,
      updateAssistantMessageContent,
      clearChatDisplayOverride,
    ],
  );

  const createStreamingSpeechPlayer = useCallback(
    (shouldSpeak: boolean, label: string): StreamingSpeechPlayer => {
      const thisRun = ++assistantRenderRunRef.current;
      const voice = selectedTtsVoice;
      const ttsProvider = ttsRuntimeSettings.ttsProvider;
      const chunkTtsRequests = shouldChunkTtsRequests(ttsRuntimeSettings);
      const canSpeak = shouldSpeak && (ttsProvider !== 'piper' || Boolean(voice));
      const metadataFilter = createAssistantReplyStreamFilter();
      let fullText = '';
      let pendingText = '';
      let sawDelta = false;
      let queuedSpeech = false;
      const speechPromises: Promise<void>[] = [];

      if (canSpeak) {
        ttsManager.enableTts = ttsRuntimeSettings.ttsEnabled;
        ttsManager.resetSpeechQueue();
        setTtsBusy(true);
        setTtsVoicesError(null);
        setTtsActiveVoiceKey(ttsProvider === 'piper' ? voice!.key : null);
        setTtsStatus(`Streaming ${getActiveTtsLabel(ttsRuntimeSettings, voice)}...`);
      }

      const isStale = () => assistantRenderRunRef.current !== thisRun;

      const enqueueSpeech = (chunk: string) => {
        if (!canSpeak || isStale()) {
          return;
        }

        queuedSpeech = true;
        const task =
          ttsProvider === 'piper'
            ? ttsManager.queuePiperText(chunk, voice!.key)
            : (async () => {
                const providerApiKey = await getBrowserRemoteTtsApiKey(
                  ttsProvider,
                  providerKeyVaultWorkspaceId,
                );
                return ttsManager.queueRemoteText(
                  createRemoteTtsRequest(chunk, ttsRuntimeSettings),
                  {
                    providerApiKey,
                  },
                );
              })();
        speechPromises.push(
          task.catch((error) => {
            const message =
              error instanceof Error ? error.message : 'Unknown streaming TTS failure.';
            setTtsVoicesError(message);
            setTtsStatus(`TTS failed: ${message}`);
            console.error('[TTS] Streaming synthesis failed:', error);
          }),
        );
      };

      const consumeSpeakableChunks = (force = false) => {
        const extracted = extractSpeakableChunks(pendingText, force);
        pendingText = extracted.remaining;
        for (const chunk of extracted.chunks) {
          enqueueSpeech(chunk);
        }
      };

      const cancel = () => {
        assistantRenderRunRef.current += 1;
        pendingText = '';
        if (canSpeak) {
          ttsManager.stop();
          setTtsBusy(false);
          setTtsStatus(`${label} cancelled.`);
        }
      };

      const pushDelta = (delta: string) => {
        if (!delta || isStale()) {
          return;
        }

        const visibleDelta = metadataFilter.push(delta);
        if (!visibleDelta) {
          return;
        }

        sawDelta = true;
        fullText += visibleDelta;
        if (chunkTtsRequests) {
          pendingText += visibleDelta;
          consumeSpeakableChunks(false);
        }
      };

      const finish = async (finalText?: string) => {
        const parsedReply = metadataFilter.finish(finalText ?? fullText);
        const normalizedFinal = parsedReply.text;
        if (!isStale() && !sawDelta && normalizedFinal && normalizedFinal !== fullText.trim()) {
          if (!sawDelta) {
            fullText = normalizedFinal;
            pendingText = normalizedFinal;
          } else if (normalizedFinal.startsWith(fullText)) {
            const suffix = normalizedFinal.slice(fullText.length);
            fullText = normalizedFinal;
            pendingText += suffix;
          } else {
            const suffix = findOverlappingSuffix(fullText, normalizedFinal);
            fullText = normalizedFinal;
            pendingText += suffix;
          }
        }

        if (chunkTtsRequests) {
          consumeSpeakableChunks(true);
        } else {
          const finalSpeechText = (fullText.trim() || normalizedFinal).trim();
          if (finalSpeechText) {
            enqueueSpeech(finalSpeechText);
          }
        }

        if (!isStale() && canSpeak) {
          if (speechPromises.length > 0) {
            await Promise.allSettled(speechPromises);
            if (!isStale() && queuedSpeech) {
              if (ttsProvider === 'piper') {
                await refreshStoredTtsVoices();
              }
            }
          }

          if (!isStale()) {
            setTtsBusy(false);
            setTtsStatus(`${label} finished.`);
          }
        }

        return {
          metadata: parsedReply.metadata,
          text: fullText.trim() || normalizedFinal,
        };
      };

      return { cancel, finish, pushDelta };
    },
    [
      providerKeyVaultWorkspaceId,
      refreshStoredTtsVoices,
      selectedTtsVoice,
      ttsManager,
      ttsRuntimeSettings,
    ],
  );

  const handleCacheTtsVoice = useCallback(async () => {
    if (!selectedTtsVoice) {
      setTtsStatus('Pick a Piper voice first.');
      return;
    }

    assistantRenderRunRef.current += 1;
    ttsManager.stop();
    setTtsBusy(true);
    setTtsVoicesError(null);
    setTtsStatus(`Loading ${selectedTtsVoice.name} model...`);

    try {
      ttsManager.enableTts = ttsRuntimeSettings.ttsEnabled;
      const audioState = await ttsManager.primeAudio();
      await cachePiperVoice(selectedTtsVoice.key);
      setTtsStatus(`Activating ${selectedTtsVoice.name} model...`);
      await loadPiperVoiceSession(selectedTtsVoice.key);
      setTtsActiveVoiceKey(selectedTtsVoice.key);
      await refreshStoredTtsVoices();
      setTtsStatus(`${selectedTtsVoice.name} model loaded. Audio ${audioState}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Voice model load failed.';
      setTtsVoicesError(message);
      setTtsStatus(`Voice load failed: ${message}`);
      console.error('[TTS] Voice model load failed:', error);
    } finally {
      setTtsBusy(false);
    }
  }, [ttsRuntimeSettings.ttsEnabled, refreshStoredTtsVoices, selectedTtsVoice, ttsManager]);

  const handleSelectTtsVoice = useCallback(
    (voiceId: string) => {
      assistantRenderRunRef.current += 1;
      ttsManager.stop();
      setTtsBusy(false);
      setTtsVoicesError(null);
      setAiSettings((current) => ({
        ...current,
        ttsVoice: voiceId,
      }));

      const nextVoice = ttsVoices.find((voice) => voice.key === voiceId);
      const activeVoice = ttsVoices.find((voice) => voice.key === ttsActiveVoiceKey);
      if (ttsActiveVoiceKey === voiceId) {
        setTtsStatus(`${nextVoice?.name ?? voiceId} is the active Piper model.`);
        return;
      }

      setTtsStatus(
        `Selected ${nextVoice?.name ?? voiceId}. Active model is ${
          activeVoice?.name ?? 'none'
        }; Load Model or Test Voice to switch.`,
      );
    },
    [ttsActiveVoiceKey, ttsManager, ttsVoices],
  );

  const handleTestTtsVoice = useCallback(() => {
    if (!ttsRuntimeSettings.ttsEnabled) {
      setTtsStatus('Enable TTS first.');
      return;
    }

    if (ttsRuntimeSettings.ttsProvider === 'piper' && !selectedTtsVoice) {
      setTtsStatus('Pick a Piper voice first.');
      return;
    }

    const label = getActiveTtsLabel(ttsRuntimeSettings, selectedTtsVoice);
    void speakWithSelectedTts(`${label} voice check. This model is active now.`, `${label} test`);
  }, [selectedTtsVoice, speakWithSelectedTts, ttsRuntimeSettings]);

  const handleSpeakLastReply = useCallback(() => {
    if (!ttsRuntimeSettings.ttsEnabled) {
      setTtsStatus('Enable TTS first.');
      return;
    }

    if (!latestAssistantMessage) {
      setTtsStatus('No assistant reply to speak yet.');
      return;
    }

    void speakWithSelectedTts(latestAssistantMessage.content, 'latest reply');
  }, [ttsRuntimeSettings.ttsEnabled, latestAssistantMessage, speakWithSelectedTts]);

  const stopSubtitleTracking = useCallback((clearNow = false) => {
    if (subtitleIntervalRef.current !== null) {
      window.clearInterval(subtitleIntervalRef.current);
      subtitleIntervalRef.current = null;
    }
    if (subtitleClearTimeoutRef.current !== null) {
      window.clearTimeout(subtitleClearTimeoutRef.current);
      subtitleClearTimeoutRef.current = null;
    }
    subtitleStartedAtRef.current = null;
    if (clearNow) {
      subtitleDataRef.current = null;
      setSubtitleText('');
    }
  }, []);

  const refreshSubtitleFromAudio = useCallback(() => {
    const subtitleData = subtitleDataRef.current;
    if (!subtitleData) {
      return;
    }

    const elapsedSeconds =
      ttsManager.currentAudio?.currentTime ??
      (subtitleStartedAtRef.current === null
        ? 0
        : (performance.now() - subtitleStartedAtRef.current) / 1000);
    setSubtitleText(
      getSubtitleLine(subtitleData.text, subtitleData.wordBoundaries, elapsedSeconds),
    );
  }, [ttsManager]);

  const startSubtitleTracking = useCallback(
    (subtitleData: { text: string; wordBoundaries: WordBoundary[] }) => {
      stopSubtitleTracking(false);
      const normalizedSubtitleData =
        subtitleData.wordBoundaries.length > 0
          ? subtitleData
          : {
              ...subtitleData,
              wordBoundaries: createEstimatedSubtitleWordBoundaries(subtitleData.text),
            };
      subtitleDataRef.current = normalizedSubtitleData;
      subtitleStartedAtRef.current = performance.now();
      setSubtitleText(
        getSubtitleLine(
          normalizedSubtitleData.text,
          normalizedSubtitleData.wordBoundaries,
          0,
        ),
      );
      subtitleIntervalRef.current = window.setInterval(refreshSubtitleFromAudio, 80);
      refreshSubtitleFromAudio();
    },
    [refreshSubtitleFromAudio, stopSubtitleTracking],
  );
  const startSubtitleTrackingRef = useRef(startSubtitleTracking);
  const stopSubtitleTrackingRef = useRef(stopSubtitleTracking);

  useEffect(() => {
    startSubtitleTrackingRef.current = startSubtitleTracking;
    stopSubtitleTrackingRef.current = stopSubtitleTracking;
  }, [startSubtitleTracking, stopSubtitleTracking]);

  const handleStopTts = useCallback(() => {
    stopTtsPlayback();
    ttsBenchmarkPlaybackRef.current?.stop();
    stopSubtitleTracking(true);
    setTtsStatus('Playback stopped.');
  }, [stopSubtitleTracking, stopTtsPlayback]);

  const handleRunTtsBenchmark = useCallback(
    async (
      text: string,
      rounds: number,
      signal: AbortSignal,
      onResults: (results: TtsBenchmarkResult[]) => void,
    ) => {
      const content = text.trim();
      if (!content) {
        return [];
      }

      stopTtsPlayback();
      stopSubtitleTracking(true);
      setTtsBusy(true);
      setTtsStatus('TTS benchmark running.');

      const settings = aiSettingsRef.current;
      const fishSettings: AiSettings = {
        ...settings,
        ttsProvider: 'fish-speech',
        fishSpeechFormat: 'pcm',
        remoteTtsMode: 'full-response',
      };
      const inworldSettings: AiSettings = {
        ...settings,
        ttsProvider: 'inworld',
        remoteTtsMode: 'full-response',
      };
      const candidates: TtsBenchmarkCandidate[] = [
        {
          id: 'fish-websocket',
          label: 'Fish WebSocket',
          provider: 'fish-speech',
          request: {
            ...createRemoteTtsRequest(content, fishSettings),
            fishTransport: 'websocket',
            format: 'pcm',
          },
        },
        {
          id: 'fish-timestamp-sse',
          label: 'Fish Timestamp SSE',
          provider: 'fish-speech',
          request: {
            ...createRemoteTtsRequest(content, fishSettings),
            fishTransport: 'timestamp-sse',
            format: 'pcm',
          },
        },
        {
          id: 'inworld-http',
          label: 'Inworld HTTP',
          provider: 'inworld',
          request: {
            ...createRemoteTtsRequest(content, inworldSettings),
            inworldTransport: 'http',
          },
        },
        {
          id: 'inworld-websocket',
          label: 'Inworld WebSocket',
          provider: 'inworld',
          request: {
            ...createRemoteTtsRequest(content, inworldSettings),
            inworldTransport: 'websocket',
          },
        },
      ];
      const providerKeys = new Map<RemoteTtsProvider, string | null>();
      await Promise.all(
        (['fish-speech', 'inworld'] as const).map(async (provider) => {
          try {
            providerKeys.set(
              provider,
              (await getBrowserRemoteTtsApiKey(provider, providerKeyVaultWorkspaceId)) ?? null,
            );
          } catch {
            providerKeys.set(provider, null);
          }
        }),
      );

      const playback = ttsBenchmarkPlaybackRef.current ?? new AudioPlayback();
      ttsBenchmarkPlaybackRef.current = playback;
      const safeRounds = Math.max(1, Math.min(10, Math.round(rounds) || 1));
      const results: TtsBenchmarkResult[] = [];

      try {
        for (let round = 1; round <= safeRounds; round += 1) {
          for (const candidate of candidates) {
            if (signal.aborted) {
              throw new Error('Benchmark stopped');
            }

            playback.stop();
            playback.reset();
            setTtsStatus(`Benchmark ${candidate.label} · round ${round}/${safeRounds}.`);
            const startedAt = performance.now();
            let firstAudioMs: number | null = null;
            let chunks = 0;
            let bytes = 0;
            let timing = ZERO_TTS_BENCHMARK_TIMING;

            try {
              for await (const chunk of createRemoteTtsStream(
                candidate.request,
                signal,
                { providerApiKey: providerKeys.get(candidate.provider) ?? null },
              )) {
                if (signal.aborted) {
                  throw new Error('Benchmark stopped');
                }
                if (chunk.mimeType !== 'audio/pcm') {
                  throw new Error(`Benchmark expected audio/pcm, got ${chunk.mimeType}.`);
                }
                const audioBytes = new Uint8Array(await chunk.audioBlob.arrayBuffer());
                if (firstAudioMs === null) {
                  firstAudioMs = Math.round(performance.now() - startedAt);
                }
                chunks += 1;
                bytes += audioBytes.byteLength;
                timing = mergeTtsBenchmarkTiming(
                  timing,
                  summarizeTtsBenchmarkTiming(chunk.timestamps, chunk.speechTiming),
                );
                await playback.playPcmChunk(
                  audioBytes,
                  chunk.sampleRate ?? candidate.request.sampleRate ?? 44100,
                );
              }

              const networkDoneAt = performance.now();
              await playback.waitForIdle();
              results.push({
                id: candidate.id,
                label: candidate.label,
                round,
                ok: true,
                firstAudioMs,
                totalMs: Math.round(networkDoneAt - startedAt),
                playbackMs: Math.round(performance.now() - startedAt),
                chunks,
                bytes,
                timing,
              });
            } catch (error) {
              if (signal.aborted) {
                throw new Error('Benchmark stopped');
              }
              results.push({
                id: candidate.id,
                label: candidate.label,
                round,
                ok: false,
                firstAudioMs,
                totalMs: Math.round(performance.now() - startedAt),
                playbackMs: Math.round(performance.now() - startedAt),
                chunks,
                bytes,
                timing,
                error: error instanceof Error ? error.message : String(error),
              });
            }
            onResults([...results]);
          }
        }
        setTtsStatus('TTS benchmark finished.');
        return results;
      } finally {
        if (signal.aborted) {
          playback.stop();
        }
        setTtsBusy(false);
      }
    },
    [providerKeyVaultWorkspaceId, stopSubtitleTracking, stopTtsPlayback],
  );

  const playAssistantResponse = useCallback(
    async (assistantMessage: ChatMessage, shouldSpeak: boolean, label: string) => {
      const parsedReply = stripAssistantReplyMetadata(assistantMessage.content);
      const content = parsedReply.text;
      if (!content) {
        clearChatDisplayOverride(assistantMessage.id);
        return;
      }

      const thisRun = ++assistantRenderRunRef.current;
      const extracted = extractSpeakableChunks(content, true);
      const revealChunks = [...extracted.chunks];
      const remainingChunk = extracted.remaining.trim();
      if (remainingChunk) {
        revealChunks.push(remainingChunk);
      }
      if (revealChunks.length === 0) {
        revealChunks.push(content);
      }

      const isStale = () => assistantRenderRunRef.current !== thisRun;
      const chunkTtsRequests = shouldChunkTtsRequests(ttsRuntimeSettings);

      if (
        !ttsRuntimeSettings.ttsSimulatedStreaming ||
        revealChunks.length === 1 ||
        !chunkTtsRequests
      ) {
        clearChatDisplayOverride(assistantMessage.id);
        if (shouldSpeak) {
          await speakWithSelectedTts(content, label);
        }
        if (!isStale()) {
          clearChatDisplayOverride(assistantMessage.id);
        }
        return;
      }

      let revealed = '';

      for (const chunk of revealChunks) {
        if (isStale()) {
          return;
        }

        revealed = revealed ? `${revealed} ${chunk}` : chunk;
        setChatDisplayOverrides((current) => ({
          ...current,
          [assistantMessage.id]: revealed,
        }));

        if (shouldSpeak) {
          await speakWithSelectedTts(chunk, label);
        } else {
          await new Promise<void>((resolve) => {
            window.setTimeout(resolve, getChunkRevealDelay(chunk));
          });
        }
      }

      if (!isStale()) {
        clearChatDisplayOverride(assistantMessage.id);
      }
    },
    [clearChatDisplayOverride, speakWithSelectedTts, ttsRuntimeSettings],
  );

  useEffect(() => {
    ttsManager.onSpeechStarted = () => {
      setTtsStatus('Playing speech.');
    };
    ttsManager.onSpeechFinished = () => {
      stopSubtitleTrackingRef.current(false);
      subtitleClearTimeoutRef.current = window.setTimeout(() => {
        subtitleDataRef.current = null;
        setSubtitleText('');
        subtitleClearTimeoutRef.current = null;
      }, SUBTITLE_CLEAR_DELAY_MS);
      setTtsStatus('Speech finished.');
    };
    ttsManager.onLipSyncData = (data) => {
      if (liveBridgeSubtitleActiveRef.current && data.wordBoundaries.length === 0) {
        return;
      }
      startSubtitleTrackingRef.current(data);
    };
    ttsManager.onError = (error) => {
      stopSubtitleTrackingRef.current(true);
      setTtsVoicesError(error.message);
      setTtsStatus(`TTS failed: ${error.message}`);
    };

    return () => {
      ttsManager.onSpeechStarted = null;
      ttsManager.onSpeechFinished = null;
      ttsManager.onLipSyncData = null;
      ttsManager.onError = null;
      stopSubtitleTrackingRef.current(true);
    };
  }, [ttsManager]);

  useEffect(() => {
    let cancelled = false;
    const resumeBrowserAudio = async () => {
      try {
        const state = await ttsManager.primeAudio();
        if (!cancelled) {
          setTtsStatus(
            state === 'running'
              ? 'Browser audio ready.'
              : 'Browser audio armed; click once if playback is blocked.',
          );
        }
        return state;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Browser audio setup failed.';
        if (!cancelled) {
          setTtsVoicesError(message);
          setTtsStatus(`Browser audio failed: ${message}`);
        }
        throw error;
      }
    };

    window.__yourwifeyAudio = {
      getState: () => ttsManager.getAudioState(),
      getStream: () => ttsManager.getOutputStream(),
      resume: resumeBrowserAudio,
    };
    window.__YOURWIFEY_AUDIO_STREAM__ = () => ttsManager.getOutputStream();

    if (AUTO_RESUME_BROWSER_AUDIO) {
      void resumeBrowserAudio().catch(() => {});
    }

    const unlockOnce = () => {
      void resumeBrowserAudio().catch(() => {});
    };

    const unlockController = new AbortController();
    const unlockOptions: AddEventListenerOptions = {
      capture: true,
      once: true,
      signal: unlockController.signal,
    };

    window.addEventListener('pointerdown', unlockOnce, unlockOptions);
    window.addEventListener('keydown', unlockOnce, unlockOptions);

    return () => {
      cancelled = true;
      unlockController.abort();
      delete window.__yourwifeyAudio;
      delete window.__YOURWIFEY_AUDIO_STREAM__;
    };
  }, [ttsManager]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateHostState() {
      const persistedState = await loadPersistedChatState();

      if (cancelled) {
        return;
      }

      const hydratedActivePersona =
        persistedState.personas.find((persona) => persona.id === persistedState.activePersonaId) ??
        persistedState.personas[0] ??
        DEFAULT_PERSONA;
      const hydratedLocalStateKey = getLocalConversationStateKey(hydratedActivePersona);
      const hydratedChatHistories =
        Object.keys(persistedState.chatHistories).length > 0
          ? persistedState.chatHistories
          : {
              [hydratedLocalStateKey]: trimChatHistory(persistedState.chatHistory),
            };
      const hydratedRelationshipMemories =
        Object.keys(persistedState.relationshipMemories).length > 0
          ? persistedState.relationshipMemories
          : {
              [hydratedLocalStateKey]: persistedState.relationshipMemory,
            };
      const ladybugRelationshipMemories = await loadLadybugRelationshipMemories();
      const nextRelationshipMemories =
        ladybugRelationshipMemories && Object.keys(ladybugRelationshipMemories).length > 0
          ? ladybugRelationshipMemories
          : hydratedRelationshipMemories;
      const hydratedTwitchChannel = persistedState.twitchChannel || DIRECT_TWITCH_CHANNEL;
      const hydratedDesktopMode =
        window.webWaifuDesktop?.isDesktop === true ? window.webWaifuDesktop.mode : 'editor';
      const hydratedVisualSettings =
        hydratedDesktopMode !== 'editor' &&
        persistedState.visualSettings.sceneBackgroundMode !== 'transparent'
          ? { ...persistedState.visualSettings, sceneBackgroundMode: 'transparent' as const }
          : persistedState.visualSettings;

      setPersonas(persistedState.personas);
      setActivePersonaId(persistedState.activePersonaId);
      setPersonaVoiceBindings(persistedState.personaVoiceBindings);
      setVoiceLabVoices(persistedState.voiceLabVoices);
      setAiSettings(persistedState.aiSettings);
      setChatHistories(hydratedChatHistories);
      chatHistoriesRef.current = hydratedChatHistories;
      activeChatHistoryStateKeyRef.current = hydratedLocalStateKey;
      setChatHistory(trimChatHistory(hydratedChatHistories[hydratedLocalStateKey] ?? []));
      setRelationshipMemory(
        nextRelationshipMemories[hydratedLocalStateKey] ?? persistedState.relationshipMemory,
      );
      setRelationshipMemories(nextRelationshipMemories);
      setMenuOpen(false);
      setChatLogOpen(true);
      setChatInput(persistedState.uiState.chatDraft);
      setActiveTab(persistedState.activeTab);
      setTwitchChannel(hydratedTwitchChannel);
      setTwitchSettings(persistedState.twitchSettings);
      setEmotionTelemetryEvents(persistedState.emotionTelemetryEvents);
      setCurrentBundledModelId(persistedState.currentBundledModelId || DEFAULT_BUNDLED_MODEL_ID);
      setCurrentCustomVrmModelId(persistedState.currentCustomVrmModelId);
      setSequencerSettings(persistedState.sequencerSettings);
      setVisualSettings(hydratedVisualSettings);

      setHydrated(true);
      void loadAvailableModels();
      void refreshAiProxyHealth();
      void loadTtsVoices();
    }

    void hydrateHostState();

    return () => {
      cancelled = true;
    };
  }, [loadAvailableModels, loadTtsVoices, refreshAiProxyHealth]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    void refreshAiProxyHealth();
    const interval = window.setInterval(() => {
      void refreshAiProxyHealth();
    }, 15000);

    return () => {
      window.clearInterval(interval);
    };
  }, [menuOpen, refreshAiProxyHealth]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    void loadAvailableModels();
  }, [aiSettings.llmProvider, hydrated, loadAvailableModels]);

  useEffect(() => {
    if (!personas.some((persona) => persona.id === activePersonaId)) {
      setActivePersonaId(personas[0]?.id ?? DEFAULT_PERSONA.id);
    }
  }, [activePersonaId, personas]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    let cancelled = false;
    let idleHandle: number | null = null;
    const persistTimer = window.setTimeout(() => {
      const persist = () => {
        if (cancelled) {
          return;
        }

        const stateKey = activeChatHistoryStateKeyRef.current || activeRelationshipStateKey;
        const nextChatHistories = {
          ...chatHistories,
          [stateKey]: chatHistory,
        };
        const nextPersistedState = {
          personas,
          activePersonaId: activePersona?.id ?? DEFAULT_PERSONA.id,
          aiSettings,
          chatHistory,
          chatHistories: nextChatHistories,
          relationshipMemory,
          relationshipMemories,
          personaVoiceBindings,
          voiceLabVoices,
          uiState: {
            menuOpen: false,
            chatLogOpen,
            chatDraft: chatInput,
          },
          activeTab,
          currentBundledModelId,
          currentCustomVrmModelId,
          emotionTelemetryEvents,
          twitchChannel,
          twitchSettings,
          sequencerSettings,
          visualSettings,
        };

        void savePersistedChatState(nextPersistedState).catch((error) => {
          console.warn('[App] Failed to persist chat state', error);
        });
        void saveLadybugRelationshipMemories(nextPersistedState.relationshipMemories).catch(
          (error) => {
            console.warn('[App] Failed to persist Ladybug relationship graph', error);
          },
        );
      };

      if ('requestIdleCallback' in window) {
        idleHandle = window.requestIdleCallback(
          () => {
            persist();
          },
          { timeout: 1500 },
        );
        return;
      }

      persist();
    }, PERSIST_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(persistTimer);
      if (idleHandle !== null) {
        window.cancelIdleCallback(idleHandle);
      }
    };
  }, [
    activePersona,
    activeRelationshipStateKey,
    activeTab,
    aiSettings,
    chatHistories,
    chatHistory,
    chatInput,
    chatLogOpen,
    currentCustomVrmModelId,
    currentBundledModelId,
    hydrated,
    emotionTelemetryEvents,
    menuOpen,
    personas,
    personaVoiceBindings,
    relationshipMemory,
    relationshipMemories,
    sequencerSettings,
    twitchChannel,
    twitchSettings,
    visualSettings,
    voiceLabVoices,
  ]);

  useEffect(() => {
    const currentBlobUrls = new Set(
      sequencerSettings.playlist.map((entry) => entry.url).filter((url) => url.startsWith('blob:')),
    );

    blobAnimationUrlsRef.current.forEach((url) => {
      if (!currentBlobUrls.has(url)) {
        URL.revokeObjectURL(url);
      }
    });
    blobAnimationUrlsRef.current = currentBlobUrls;
  }, [sequencerSettings.playlist]);

  useEffect(() => {
    return () => {
      assistantRenderRunRef.current += 1;
      if (
        modelUrl?.startsWith('blob:') &&
        ![...bundledModelUrlCacheRef.current.values()].includes(modelUrl)
      ) {
        URL.revokeObjectURL(modelUrl);
      }
      bundledModelUrlCacheRef.current.forEach((url) => {
        URL.revokeObjectURL(url);
      });
      bundledModelUrlCacheRef.current.clear();
      blobAnimationUrlsRef.current.forEach((url) => {
        URL.revokeObjectURL(url);
      });
    };
  }, []);

  useEffect(() => () => stopTtsPlayback(), [stopTtsPlayback]);

  useEffect(() => {
    ttsManager.enableTts = ttsRuntimeSettings.ttsEnabled;
    if (!ttsRuntimeSettings.ttsEnabled) {
      stopTtsPlayback();
    }
  }, [ttsRuntimeSettings.ttsEnabled, stopTtsPlayback, ttsManager]);

  useEffect(() => {
    ttsManager.setPlaybackRate(aiSettings.ttsPlaybackRate);
    ttsManager.setVolume(aiSettings.ttsVolume);
  }, [aiSettings.ttsPlaybackRate, aiSettings.ttsVolume, ttsManager]);

  useEffect(() => {
    if (
      !hydrated ||
      !ttsRuntimeSettings.ttsEnabled ||
      !selectedTtsVoice ||
      selectedTtsCached ||
      ttsBusy ||
      ttsVoicesLoading ||
      ttsWarmVoicesRef.current.has(selectedTtsVoice.key)
    ) {
      return;
    }

    ttsWarmVoicesRef.current.add(selectedTtsVoice.key);

    let cancelled = false;
    let timeoutId: number | null = null;
    const idleHandle =
      'requestIdleCallback' in window
        ? window.requestIdleCallback(
            async () => {
              if (cancelled) {
                return;
              }

              try {
                setTtsStatus(`Warming ${selectedTtsVoice.name} in background...`);
                await cachePiperVoice(selectedTtsVoice.key);
                await refreshStoredTtsVoices();
                if (!cancelled) {
                  setTtsStatus(`${selectedTtsVoice.name} ready.`);
                }
              } catch (error) {
                console.warn('[TTS] Background voice warm failed:', error);
                ttsWarmVoicesRef.current.delete(selectedTtsVoice.key);
              }
            },
            { timeout: 3000 },
          )
        : null;

    if (idleHandle === null) {
      timeoutId = window.setTimeout(() => {
        void (async () => {
          if (cancelled) {
            return;
          }

          try {
            setTtsStatus(`Warming ${selectedTtsVoice.name} in background...`);
            await cachePiperVoice(selectedTtsVoice.key);
            await refreshStoredTtsVoices();
            if (!cancelled) {
              setTtsStatus(`${selectedTtsVoice.name} ready.`);
            }
          } catch (error) {
            console.warn('[TTS] Background voice warm failed:', error);
            ttsWarmVoicesRef.current.delete(selectedTtsVoice.key);
          }
        })();
      }, 1200);
    }

    return () => {
      cancelled = true;
      if (idleHandle !== null) {
        window.cancelIdleCallback(idleHandle);
      }
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [
    ttsRuntimeSettings.ttsEnabled,
    hydrated,
    refreshStoredTtsVoices,
    selectedTtsCached,
    selectedTtsVoice,
    ttsBusy,
    ttsVoicesLoading,
  ]);

  const refreshSavedVrmModels = useCallback(async () => {
    try {
      const models = await listSavedVrmModels();
      setSavedVrmModels(models);
      return models;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Saved VRM library unavailable.';
      setSavedVrmStatus(message);
      console.warn('[VRM] Failed to list saved models:', error);
      return [];
    }
  }, []);

  const loadModelUrl = (nextUrl: string | null) => {
    setModelUrl((current) => {
      if (
        current &&
        current !== nextUrl &&
        current.startsWith('blob:') &&
        ![...bundledModelUrlCacheRef.current.values()].includes(current)
      ) {
        URL.revokeObjectURL(current);
      }
      return nextUrl;
    });
  };

  const prepareForModelSwap = useCallback(() => {
    setManualPlayRequest(null);
    setSequencerSettings((current) => ({
      ...current,
      playing: false,
      currentIndex: -1,
    }));
  }, []);

  const handleLoadBundledModel = useCallback(
    async (modelId: string) => {
      const bundledModel = BUNDLED_VRM_MODELS.find((model) => model.id === modelId);
      if (!bundledModel) {
        return;
      }

      prepareForModelSwap();
      let cachedUrl = bundledModelUrlCacheRef.current.get(bundledModel.id);
      if (!cachedUrl) {
        const assetBlob = await fetchGameAssetBlob(bundledModel.assetPath);
        cachedUrl = URL.createObjectURL(assetBlob);
        bundledModelUrlCacheRef.current.set(bundledModel.id, cachedUrl);
      }
      loadModelUrl(cachedUrl);
      setCurrentBundledModelId(bundledModel.id);
      setCurrentCustomVrmModelId('');
      setSavedVrmStatus(`Loaded ${bundledModel.label}.`);
    },
    [prepareForModelSwap],
  );

  const handleLoadSavedVrmModel = useCallback(
    async (modelId: string) => {
      const model = savedVrmModels.find((entry) => entry.id === modelId);
      prepareForModelSwap();
      const blob = await getSavedVrmModelBlob(modelId);
      const url = URL.createObjectURL(blob);
      loadModelUrl(url);
      setCurrentBundledModelId('');
      setCurrentCustomVrmModelId(modelId);
      setSavedVrmStatus(`Loaded saved VRM: ${model?.name ?? 'Custom VRM'}.`);
    },
    [prepareForModelSwap, savedVrmModels],
  );

  const handleSaveAndLoadVrmFile = useCallback(
    async (file: File) => {
      prepareForModelSwap();
      setSavedVrmStatus(`Saving ${file.name}...`);
      const savedModel = await saveVrmModelFile(file);
      const models = await refreshSavedVrmModels();
      const savedName = models.find((model) => model.id === savedModel.id)?.name ?? savedModel.name;
      const blob = await getSavedVrmModelBlob(savedModel.id);
      const url = URL.createObjectURL(blob);
      loadModelUrl(url);
      setCurrentBundledModelId('');
      setCurrentCustomVrmModelId(savedModel.id);
      setSavedVrmStatus(`Saved and loaded ${savedName}.`);
    },
    [prepareForModelSwap, refreshSavedVrmModels],
  );

  const handleDeleteSavedVrmModel = useCallback(
    async (modelId: string) => {
      const model = savedVrmModels.find((entry) => entry.id === modelId);
      await deleteSavedVrmModel(modelId);
      const models = await refreshSavedVrmModels();
      if (currentCustomVrmModelId === modelId) {
        setCurrentCustomVrmModelId('');
        void handleLoadBundledModel(DEFAULT_BUNDLED_MODEL_ID).catch((error) => {
          console.error('[VRM] Failed to restore default avatar after delete:', error);
        });
      }
      setSavedVrmStatus(
        `Deleted ${model?.name ?? 'saved VRM'}.${models.length ? '' : ' Library is empty.'}`,
      );
    },
    [currentCustomVrmModelId, handleLoadBundledModel, refreshSavedVrmModels, savedVrmModels],
  );

  useEffect(() => {
    if (!hydrated || didHydrateAvatarRef.current) {
      return;
    }

    didHydrateAvatarRef.current = true;
    void (async () => {
      const models = await refreshSavedVrmModels();
      if (currentCustomVrmModelId && models.some((model) => model.id === currentCustomVrmModelId)) {
        await handleLoadSavedVrmModel(currentCustomVrmModelId);
        return;
      }
      if (currentCustomVrmModelId) {
        setSavedVrmStatus('Saved VRM missing. Loading default avatar.');
        setCurrentCustomVrmModelId('');
      }
      await handleLoadBundledModel(currentBundledModelId || DEFAULT_BUNDLED_MODEL_ID);
    })().catch((error) => {
      console.error('[App] Failed to load hydrated avatar asset:', error);
      setSavedVrmStatus(error instanceof Error ? error.message : 'Avatar load failed.');
    });
  }, [
    currentBundledModelId,
    currentCustomVrmModelId,
    handleLoadBundledModel,
    handleLoadSavedVrmModel,
    hydrated,
    refreshSavedVrmModels,
  ]);

  const handleSavePersona = useCallback((draft: PersonaDraft, personaId?: string) => {
    const nextId = personaId ?? `persona-${Date.now()}`;
    const nextPersona: PersonaProfile = {
      id: nextId,
      ...draft,
    };

    setPersonas((current) =>
      current.some((persona) => persona.id === nextId)
        ? current.map((persona) => (persona.id === nextId ? nextPersona : persona))
        : [...current, nextPersona],
    );
    setActivePersonaId(nextId);
  }, []);

  const handleDeletePersona = useCallback((personaId: string) => {
    setPersonas((current) => {
      const next = current.filter((persona) => persona.id !== personaId);
      return next.length > 0 ? next : createDefaultPersonas();
    });
    setPersonaVoiceBindings((current) => {
      const next = { ...current };
      delete next[personaId];
      return next;
    });
  }, []);

  const applyPersonaVoiceBinding = useCallback((binding: PersonaVoiceBinding) => {
    setAiSettings((current) => {
      if (
        binding.provider === 'piper' &&
        current.ttsProvider === 'piper' &&
        current.ttsVoice === binding.voiceId
      ) {
        return current;
      }
      if (
        binding.provider === 'fish-speech' &&
        current.ttsProvider === 'fish-speech' &&
        current.fishSpeechVoiceId === binding.voiceId &&
        (!binding.modelId || current.fishSpeechModel === binding.modelId)
      ) {
        return current;
      }
      if (
        binding.provider === 'inworld' &&
        current.ttsProvider === 'inworld' &&
        current.inworldVoiceId === binding.voiceId &&
        (!binding.modelId || current.inworldModelId === binding.modelId)
      ) {
        return current;
      }

      if (binding.provider === 'piper') {
        return {
          ...current,
          ttsProvider: 'piper',
          ttsVoice: binding.voiceId,
        };
      }
      if (binding.provider === 'fish-speech') {
        return {
          ...current,
          fishSpeechModel: binding.modelId || current.fishSpeechModel,
          fishSpeechVoiceId: binding.voiceId,
          ttsProvider: 'fish-speech',
        };
      }
      return {
        ...current,
        inworldModelId: binding.modelId || current.inworldModelId,
        inworldVoiceId: binding.voiceId,
        ttsProvider: 'inworld',
      };
    });
  }, []);

  const handleApplyPersonaVoice = useCallback(
    (personaId: string) => {
      const persona = personas.find((entry) => entry.id === personaId) ?? activePersona;
      const binding =
        personaVoiceBindings[personaId] ??
        getPresetPersonaVoiceBinding(getPersonaScenePreset(persona));
      applyPersonaVoiceBinding(binding);
    },
    [activePersona, applyPersonaVoiceBinding, personaVoiceBindings, personas],
  );

  const handleUseCurrentVoiceAsPersonaDefault = useCallback(
    (personaId: string) => {
      const now = Date.now();
      let binding: PersonaVoiceBinding | null = null;
      if (ttsRuntimeSettings.ttsProvider === 'piper') {
        const voice = ttsVoices.find((entry) => entry.key === ttsRuntimeSettings.ttsVoice);
        binding = {
          label: voice?.name ?? ttsRuntimeSettings.ttsVoice,
          provider: 'piper',
          updatedAt: now,
          voiceId: ttsRuntimeSettings.ttsVoice,
        };
      } else if (
        ttsRuntimeSettings.ttsProvider === 'fish-speech' &&
        ttsRuntimeSettings.fishSpeechVoiceId.trim()
      ) {
        binding = {
          label: `Fish Speech ${ttsRuntimeSettings.fishSpeechVoiceId.trim()}`,
          modelId: ttsRuntimeSettings.fishSpeechModel,
          provider: 'fish-speech',
          updatedAt: now,
          voiceId: ttsRuntimeSettings.fishSpeechVoiceId.trim(),
        };
      } else if (
        ttsRuntimeSettings.ttsProvider === 'inworld' &&
        ttsRuntimeSettings.inworldVoiceId.trim()
      ) {
        binding = {
          label: `Inworld ${ttsRuntimeSettings.inworldVoiceId.trim()}`,
          modelId: ttsRuntimeSettings.inworldModelId,
          provider: 'inworld',
          updatedAt: now,
          voiceId: ttsRuntimeSettings.inworldVoiceId.trim(),
        };
      }

      if (!binding) {
        return;
      }

      setPersonaVoiceBindings((current) => ({
        ...current,
        [personaId]: binding,
      }));
    },
    [ttsRuntimeSettings, ttsVoices],
  );

  const handleSaveVoiceLabVoice = useCallback((voice: VoiceLabVoice) => {
    setVoiceLabVoices((current) =>
      current.some((entry) => entry.id === voice.id)
        ? current.map((entry) => (entry.id === voice.id ? voice : entry))
        : [...current, voice],
    );

    const voiceId = voice.providerVoiceId.trim();
    if (!voiceId || voice.assignedPersonaIds.length === 0) {
      return;
    }

    const binding: PersonaVoiceBinding = {
      customVoiceId: voice.id,
      label: voice.name,
      modelId: voice.modelId || undefined,
      provider: voice.provider,
      updatedAt: voice.updatedAt,
      voiceId,
    };
    setPersonaVoiceBindings((current) => {
      const next = { ...current };
      for (const personaId of voice.assignedPersonaIds) {
        next[personaId] = binding;
      }
      return next;
    });
  }, []);

  const handleDeleteVoiceLabVoice = useCallback((voiceId: string) => {
    setVoiceLabVoices((current) => current.filter((voice) => voice.id !== voiceId));
    setPersonaVoiceBindings((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([, binding]) => binding.customVoiceId !== voiceId),
      ),
    );
  }, []);

  const handleClearChat = useCallback(() => {
    cancelAssistantPresentation(true);
    setChatGenerating(false);
    setChatHistories((current) => {
      const next = { ...current, [activeRelationshipStateKey]: [] };
      chatHistoriesRef.current = next;
      return next;
    });
    setChatHistory([]);
  }, [activeRelationshipStateKey, cancelAssistantPresentation]);

  const handleClearDraft = useCallback(() => {
    setChatInput('');
  }, []);

  const handleClearMemory = useCallback(() => {
    const relationshipClear = clearScopedRelationshipMemory(activeRelationshipStateKey);
    const grilloClear = clearGrilloMemoryStateAsync(activeRelationshipStateKey);
    const semanticClear = clearSemanticMemory(activeRelationshipStateKey);
    setGrilloMemoryState(createDefaultGrilloMemoryState(activeRelationshipStateKey));
    clearMemoryAgentPendingChatTurns(
      memoryAgentPendingChatTurnCountsRef.current,
      activeRelationshipStateKey,
    );
    syncMemoryAgentPendingCounts();
    setMemoryAgentStatus('Memory cleared for current scope, including semantic recall.');
    void Promise.allSettled([relationshipClear, grilloClear, semanticClear]).then(() => {
      void refreshMemoryBackendStatus();
    });
  }, [
    activeRelationshipStateKey,
    clearScopedRelationshipMemory,
    refreshMemoryBackendStatus,
    syncMemoryAgentPendingCounts,
  ]);

  const handleResetContext = useCallback(() => {
    cancelAssistantPresentation(true);
    setChatGenerating(false);
    setChatInput('');
    setChatHistories((current) => {
      const next = { ...current, [activeRelationshipStateKey]: [] };
      chatHistoriesRef.current = next;
      return next;
    });
    setChatHistory([]);
    twitchContextRef.current = [];
    twitchAiQueueRef.current = [];
    twitchBatchRef.current = [];
    clearMemoryAgentPendingChatTurns(
      memoryAgentPendingChatTurnCountsRef.current,
      activeRelationshipStateKey,
    );
    syncMemoryAgentPendingCounts();
    setMemoryAgentStatus('Local chat context reset. Durable memory was kept.');
  }, [activeRelationshipStateKey, cancelAssistantPresentation, syncMemoryAgentPendingCounts]);

  const runBackendGrilloTickOnce = useCallback(
    async ({
      beatType,
      reason,
      stateKey,
    }: {
      beatType: BackendGrilloBeatType;
      reason: string;
      stateKey: string;
    }) => {
      const settings = aiSettingsRef.current;
      const model = settings.memoryAgentModel.trim() || settings.model;
      const headers = await buildBackendProviderHeaders({
        llmProvider: settings.llmProvider,
        providerKeyVaultWorkspaceId,
      });
      return runLadybugGrilloTick(
        {
          beatType,
          embeddingMode: settings.embeddingMode,
          embeddingModel: settings.embeddingModel,
          llmProvider: settings.llmProvider,
          maxToolRounds: settings.maxToolRounds,
          model,
          reason,
          scopeKey: stateKey,
        },
        { headers },
      );
    },
    [providerKeyVaultWorkspaceId],
  );

  const runBackendGrilloCadence = useCallback(
    async (stateKey: string, reason: string) => {
      if (backendGrilloCadenceBusyRef.current) {
        setMemoryAgentStatus('Backend GRILLO cadence skipped: tick already running.');
        return;
      }
      backendGrilloCadenceBusyRef.current = true;
      setBackendGrilloTickBusy(true);
      setMemoryAgentStatus('Running backend GRILLO cadence beats...');
      const summaries: string[] = [];
      try {
        for (const beatType of BACKEND_GRILLO_CADENCE_BEATS) {
          const result = await runBackendGrilloTickOnce({
            beatType,
            reason: `${reason}_${beatType}`,
            stateKey,
          });
          summaries.push(
            result?.noOpReason
              ? `${result.beatType ?? beatType}: ${result.noOpReason}`
              : `${result?.beatType ?? beatType}: ${result?.writes ?? 0} write${
                  result?.writes === 1 ? '' : 's'
                }`,
          );
        }
        setMemoryAgentStatus(`Backend GRILLO cadence complete: ${summaries.join(' / ')}.`);
      } catch (error) {
        console.warn('[App] Backend GRILLO cadence failed', error);
        const message = error instanceof Error ? error.message : String(error);
        setMemoryAgentStatus(`Backend GRILLO cadence failed: ${message}`);
      } finally {
        backendGrilloCadenceBusyRef.current = false;
        setBackendGrilloTickBusy(false);
        void refreshMemoryBackendStatus();
      }
    },
    [refreshMemoryBackendStatus, runBackendGrilloTickOnce],
  );

  const runRelationshipMemoryRefresh = useCallback(
    async (
      historySnapshot: ChatMessage[],
      memorySnapshot: RelationshipMemory,
      stateKey: string,
      scheduledRun: number,
      reason: 'chat-cadence' | 'scheduled' | 'manual',
      processedChatTurnCount = 0,
    ) => {
      const worker = memoryAgentWorkerRef.current;
      if (!worker) {
        return;
      }

      setMemoryAgentBusy(true);
      setMemoryWorkerDebug({
        processedChatTurnCount,
        reason,
        stateKey,
        status: 'running',
        updatedAt: Date.now(),
      });
      setMemoryAgentStatus(
        reason === 'manual'
          ? 'Running memory worker...'
          : reason === 'chat-cadence'
            ? 'Running memory worker for chat message cadence...'
            : 'Running background memory worker...',
      );

      try {
        const excludedModels = Array.from(memoryAgentFailedModelsRef.current);
        const providerModels = getProviderModelPool(aiSettings.llmProvider, availableModels);
        const modelCandidates = getMemoryAgentModelCandidates(
          providerModels,
          aiSettings.model,
          excludedModels,
          aiSettings.memoryAgentModel,
        );

        let rawContent = '';
        let lastError: unknown = null;
        const recentTurns = grilloRecentTurnsByStateKeyRef.current[stateKey] ?? [];

        for (const model of modelCandidates) {
          try {
            const result = await runGrilloMemoryWorkerLoop({
              complete: async (request) => {
                const response = await requestChatCompletion({
                  disableState: true,
                  maxTokens: request.maxTokens,
                  maxToolRounds: aiSettingsRef.current.maxToolRounds,
                  messages: request.messages,
                  model: request.model,
                  llmProvider: aiSettings.llmProvider,
                  responseFormat: request.responseFormat,
                  stateKey: request.stateKey,
                  stateScope: request.stateScope,
                  temperature: request.temperature,
                  transportMode: aiSettings.aiTransportMode,
                  providerKeyVaultWorkspaceId,
                });
                return response.choices[0]?.message.content?.trim() ?? '';
              },
              history: historySnapshot,
              model,
              persona: activePersona ?? DEFAULT_PERSONA,
              relationshipMemory: memorySnapshot,
              semanticMemory: {
                insert: async (text) => {
                  const write = await rememberSemanticTurn(
                    stateKey,
                    text,
                    '',
                    activePersona ?? DEFAULT_PERSONA,
                    providerKeyVaultWorkspaceId,
                    aiSettings.llmProvider,
                    setMemoryEmbeddingDebug,
                    'worker-insert',
                    aiSettings.embeddingMode,
                    aiSettings.embeddingModel,
                    aiSettings.embeddingLocalModel,
                  );
                  return {
                    id: write?.record.id,
                    ok: Boolean(write),
                    totalIndexed: write?.totalIndexed,
                    vectorDims: write?.vectorDims,
                  };
                },
                search: async (query, limit) => {
                  const embedding = await requestTextEmbedding(
                    query,
                    providerKeyVaultWorkspaceId,
                    aiSettings.llmProvider,
                    'worker-search',
                    setMemoryEmbeddingDebug,
                    aiSettings.embeddingMode,
                    aiSettings.embeddingModel,
                    aiSettings.embeddingLocalModel,
                  );
                  return (await findSemanticMemoryMatches(stateKey, query, embedding, limit)).map(
                    (match) => ({
                      score: match.score,
                      text: `[semantic:${match.scopeKey}] ${match.text.replace(/\s+/g, ' ').trim()}`,
                    }),
                  );
                },
              },
              scopeKey: stateKey,
              turns: recentTurns,
            });

            if (memoryAgentRunRef.current !== scheduledRun) {
              return;
            }

            rawContent = extractGrilloWorkerRelationshipJson(result.finalJsonText);
            if (rawContent) {
              refreshGrilloMemoryState(stateKey);
              void refreshMemoryBackendStatus();
              setMemoryWorkerDebug({
                model,
                processedChatTurnCount,
                reason,
                rounds: result.rounds,
                stateKey,
                status: 'updated',
                toolCalls: result.toolCalls.length,
                updatedAt: Date.now(),
              });
              setMemoryAgentStatus(
                `Grillo worker: ${model}; tools=${result.toolCalls.length}; rounds=${result.rounds}.`,
              );
              break;
            }
          } catch (error) {
            lastError = error;
            memoryAgentFailedModelsRef.current.add(model.toLowerCase());
          }
        }

        if (!rawContent) {
          for (const model of modelCandidates) {
            try {
              const response = await requestChatCompletion({
                model,
                llmProvider: aiSettings.llmProvider,
                messages: buildMemoryAgentMessages(
                  historySnapshot,
                  memorySnapshot,
                  activePersona ?? DEFAULT_PERSONA,
                ),
                maxTokens: 260,
                responseFormat: MEMORY_AGENT_JSON_FORMAT,
                stateKey: getMemoryStateKey(stateKey),
                stateScope: 'memory',
                disableState: true,
                transportMode: aiSettings.aiTransportMode,
                temperature: 0.35,
                providerKeyVaultWorkspaceId,
              });

              if (memoryAgentRunRef.current !== scheduledRun) {
                return;
              }

              rawContent = response.choices[0]?.message.content?.trim() ?? '';
              if (rawContent) {
                setMemoryWorkerDebug({
                  model,
                  processedChatTurnCount,
                  reason,
                  stateKey,
                  status: 'updated',
                  toolCalls: 0,
                  updatedAt: Date.now(),
                });
                setMemoryAgentStatus(`Legacy diary model: ${model}`);
                break;
              }
            } catch (error) {
              lastError = error;
              memoryAgentFailedModelsRef.current.add(model.toLowerCase());
            }
          }
        }

        if (memoryAgentRunRef.current !== scheduledRun) {
          return;
        }

        if (!rawContent) {
          if (lastError) {
            throw lastError;
          }
          setMemoryWorkerDebug({
            processedChatTurnCount,
            reason,
            stateKey,
            status: 'no-json',
            updatedAt: Date.now(),
          });
          setMemoryAgentStatus('Memory worker returned no JSON.');
          return;
        }

        const targetTurnCount =
          processedChatTurnCount > 0
            ? Math.max(
                memorySnapshot.turnCount,
                memorySnapshot.lastDiaryTurnCount + processedChatTurnCount,
              )
            : memorySnapshot.turnCount;
        const mergedMemory = await mergeRelationshipMemoryInWorker(
          worker,
          getScopedRelationshipMemory(stateKey),
          rawContent,
          targetTurnCount,
        );

        if (memoryAgentRunRef.current !== scheduledRun) {
          return;
        }

        commitScopedRelationshipMemory(stateKey, mergedMemory);
        void refreshMemoryBackendStatus();
        if (processedChatTurnCount > 0) {
          consumeMemoryAgentPendingChatTurns(
            memoryAgentPendingChatTurnCountsRef.current,
            stateKey,
            processedChatTurnCount,
          );
          syncMemoryAgentPendingCounts();
        }
        setMemoryAgentStatus('Memory worker updated.');
      } catch (error) {
        setMemoryWorkerDebug({
          error: error instanceof Error ? error.message : String(error),
          processedChatTurnCount,
          reason,
          stateKey,
          status: 'failed',
          updatedAt: Date.now(),
        });
        setMemoryAgentStatus('Memory worker failed.');
      } finally {
        if (memoryAgentRunRef.current === scheduledRun) {
          setMemoryAgentBusy(false);
        }
        if (reason === 'chat-cadence' && memoryAgentRunRef.current === scheduledRun) {
          void runBackendGrilloCadence(stateKey, 'chat_cadence');
        }
      }
    },
    [
      activePersona,
      aiSettings.aiTransportMode,
      aiSettings.llmProvider,
      aiSettings.memoryAgentModel,
      aiSettings.model,
      availableModels,
      commitScopedRelationshipMemory,
      getScopedRelationshipMemory,
      providerKeyVaultWorkspaceId,
      refreshGrilloMemoryState,
      refreshMemoryBackendStatus,
      runBackendGrilloCadence,
      syncMemoryAgentPendingCounts,
      twitchChannel,
    ],
  );

  const scheduleRelationshipMemoryRefresh = useCallback(
    (historySnapshot: ChatMessage[], memorySnapshot: RelationshipMemory, stateKey: string) => {
      if (
        !shouldRunMemoryAgent(memorySnapshot, aiSettingsRef.current.memoryAgentIntervalMessages)
      ) {
        return;
      }

      if (memoryAgentTimeoutRef.current !== null) {
        window.clearTimeout(memoryAgentTimeoutRef.current);
      }

      const scheduledRun = ++memoryAgentRunRef.current;
      const processedChatTurnCount = memoryAgentPendingChatTurnCountsRef.current[stateKey] ?? 0;
      memoryAgentTimeoutRef.current = window.setTimeout(() => {
        memoryAgentTimeoutRef.current = null;
        void runRelationshipMemoryRefresh(
          historySnapshot,
          memorySnapshot,
          stateKey,
          scheduledRun,
          'scheduled',
          processedChatTurnCount,
        );
      }, MEMORY_AGENT_DELAY_MS);
    },
    [runRelationshipMemoryRefresh],
  );

  const scheduleMemoryAgentAfterChatTurns = useCallback(
    (stateKey: string) => {
      const cadence = getMemoryAgentCadenceDecision(
        memoryAgentPendingChatTurnCountsRef.current,
        stateKey,
        aiSettingsRef.current.memoryAgentIntervalMessages,
      );
      if (shouldExposeScopedRelationshipMemory(stateKey, activeRelationshipStateKeyRef.current)) {
        setMemoryAgentStatus(
          cadence.remaining > 0
            ? `Memory pass in ${cadence.remaining} chat message${cadence.remaining === 1 ? '' : 's'}.`
            : 'Memory worker queued for chat message cadence.',
        );
      }
      if (!cadence.shouldQueue || memoryAgentTimeoutRef.current !== null) {
        return;
      }

      const historySnapshot = [...chatHistoryRef.current];
      const memorySnapshot = getScopedRelationshipMemory(stateKey);
      const scheduledRun = ++memoryAgentRunRef.current;
      const pendingCount = cadence.pendingCount;
      memoryAgentTimeoutRef.current = window.setTimeout(() => {
        memoryAgentTimeoutRef.current = null;
        void runRelationshipMemoryRefresh(
          historySnapshot,
          memorySnapshot,
          stateKey,
          scheduledRun,
          'chat-cadence',
          pendingCount,
        );
      }, MEMORY_AGENT_DELAY_MS);
    },
    [getScopedRelationshipMemory, runRelationshipMemoryRefresh],
  );

  useEffect(() => {
    scheduleMemoryAgentAfterChatTurnsRef.current = scheduleMemoryAgentAfterChatTurns;
  }, [scheduleMemoryAgentAfterChatTurns]);

  const handleRunMemoryAgentNow = useCallback(() => {
    if (memoryAgentTimeoutRef.current !== null) {
      window.clearTimeout(memoryAgentTimeoutRef.current);
      memoryAgentTimeoutRef.current = null;
    }

    const historySnapshot = [...chatHistory];
    const memorySnapshot = relationshipMemoryRef.current;
    const stateKey = activeRelationshipStateKey;
    const scheduledRun = ++memoryAgentRunRef.current;
    const processedChatTurnCount = memoryAgentPendingChatTurnCountsRef.current[stateKey] ?? 0;
    void runRelationshipMemoryRefresh(
      historySnapshot,
      memorySnapshot,
      stateKey,
      scheduledRun,
      'manual',
      processedChatTurnCount,
    );
  }, [activeRelationshipStateKey, chatHistory, runRelationshipMemoryRefresh]);

  const runBackendGrilloTask = useCallback((beatType: BackendGrilloBeatType) => {
    if (backendGrilloTickBusy) {
      return;
    }
    const stateKey = activeRelationshipStateKeyRef.current;
    setBackendGrilloTickBusy(true);
    setMemoryAgentStatus(`Running backend GRILLO ${beatType} through memory lane.`);
    void runBackendGrilloTickOnce({
      beatType,
      reason:
        beatType === 'reflection'
          ? 'manual_ui_beat'
          : beatType === 'relationship'
            ? 'manual_ui_relationship'
            : beatType === 'consolidation'
              ? 'manual_ui_consolidation'
              : beatType === 'compaction'
                ? 'manual_ui_compaction'
                : beatType === 'semantic_indexing'
                  ? 'manual_ui_semantic_indexing'
                  : 'manual_ui',
      stateKey,
    })
      .then((result) => {
        if (!result) {
          setMemoryAgentStatus('Backend GRILLO tick did not return a result.');
          return;
        }
        setMemoryAgentStatus(
          result.noOpReason
            ? `Backend GRILLO ${result.beatType ?? beatType} no-op: ${result.noOpReason}.`
            : `Backend GRILLO ${result.beatType ?? beatType} wrote ${result.writes} update${result.writes === 1 ? '' : 's'}.`,
        );
      })
      .catch((error) => {
        console.warn('[App] Backend GRILLO tick failed', error);
        const message = error instanceof Error ? error.message : String(error);
        setMemoryAgentStatus(`Backend GRILLO tick failed: ${message}`);
      })
      .finally(() => {
        setBackendGrilloTickBusy(false);
        void refreshMemoryBackendStatus();
      });
  }, [backendGrilloTickBusy, refreshMemoryBackendStatus, runBackendGrilloTickOnce]);

  const handleRunBackendGrilloTick = useCallback(() => {
    runBackendGrilloTask('extraction');
  }, [runBackendGrilloTask]);

  const handleRunBackendGrilloBeat = useCallback(() => {
    runBackendGrilloTask('reflection');
  }, [runBackendGrilloTask]);

  const handleRunBackendGrilloConsolidation = useCallback(() => {
    runBackendGrilloTask('consolidation');
  }, [runBackendGrilloTask]);

  const handleRunBackendGrilloCompaction = useCallback(() => {
    runBackendGrilloTask('compaction');
  }, [runBackendGrilloTask]);

  const handleRunBackendGrilloSemanticIndexing = useCallback(() => {
    runBackendGrilloTask('semantic_indexing');
  }, [runBackendGrilloTask]);

  const patchEmotionTelemetryEvent = useCallback((patch: EmotionTelemetryPatch) => {
    setEmotionTelemetryEvents((current) =>
      current.map((event) => (event.id === patch.id ? { ...event, ...patch } : event)),
    );
  }, []);

  const playAssistantMetadataAnimation = useCallback(
    (metadata: AssistantReplyMetadata | null, stateKey = activeRelationshipStateKeyRef.current) => {
      if (!metadata) {
        return;
      }

      const nonce = Date.now();
      const telemetryId = `emotion-${nonce}-${Math.random().toString(36).slice(2, 8)}`;
      const memory = getScopedRelationshipMemory(stateKey);
      const nextAffectState = updateAffectState(memory.affectState, metadata, nonce);
      const nextMemory = {
        ...memory,
        affectState: nextAffectState,
      };
      commitScopedRelationshipMemory(stateKey, nextMemory);
      const metadataVad = getMetadataVad(metadata);
      const expression = resolveFacialExpressionForReplyMetadata(metadata);
      const baseIntensity = resolveFacialExpressionIntensityForReplyMetadata(metadata);
      const intensity = Math.min(1, baseIntensity + getAffectExpressionBoost(nextAffectState));
      const durationMs = Math.round(
        resolveFacialExpressionDurationMsForReplyMetadata(metadata) *
          (1 + Math.min(0.28, nextAffectState.arousal * 0.18)),
      );
      const playlist = sequencerSettingsRef.current.playlist;
      const index = resolveAnimationIndexForReplyMetadata(metadata, playlist);
      const animationEntry = index >= 0 ? playlist[index] ?? null : null;
      setEmotionTelemetryEvents((current) =>
        [
          {
            affectArousal: nextAffectState.arousal,
            affectDominance: nextAffectState.dominance,
            affectLabel: nextAffectState.label,
            affectValence: nextAffectState.valence,
            id: telemetryId,
            createdAt: nonce,
            emotion: metadata.emotion,
            metadataArousal: metadataVad.arousal,
            metadataDominance: metadataVad.dominance,
            metadataValence: metadataVad.valence,
            requestedExpression: expression,
            requestedIntensity: intensity,
            requestedDurationMs: durationMs,
            resolvedExpressionNames: [],
            appliedIntensity: 0,
            expressionAccepted: null,
            expressionReason: 'pending',
            animationIndex: index,
            animationId: animationEntry?.id ?? null,
            animationName: animationEntry?.name ?? null,
            animationAccepted: index === -1 ? false : null,
            animationReason: index === -1 ? 'no enabled emotion animation match' : 'pending',
          },
          ...current,
        ].slice(0, 20),
      );

      setFacialExpressionRequest({
        durationMs,
        expression,
        intensity,
        nonce,
        telemetryId,
        vad: {
          arousal: nextAffectState.arousal,
          dominance: nextAffectState.dominance,
          valence: nextAffectState.valence,
        },
      });

      if (index === -1) {
        return;
      }

      setManualPlayRequest({
        index,
        kind: 'reaction',
        nonce: nonce + 1,
        telemetryId,
      });
    },
    [commitScopedRelationshipMemory, getScopedRelationshipMemory],
  );

  const handleSendMessage = useCallback(
    async (overrideInput?: string) => {
      const message = (overrideInput ?? chatInput).trim();
      if (!message) {
        return;
      }
      if (assistantReplyLockedRef.current) {
        return;
      }

      const persona = activePersona ?? DEFAULT_PERSONA;
      const currentTwitchSettings = twitchSettingsRef.current;
      const turn = createLocalChatTurn({
        displayName: currentTwitchSettings.localDisplayName,
        persona,
        text: message,
        trustedController: currentTwitchSettings.localTrustedControls,
      });
      setChatInput('');

      const handledCommand =
        currentTwitchSettings.commandsEnabled &&
        directTwitchCommandHandlerRef.current(chatTurnToCommandMessage(turn));
      if (handledCommand) {
        return;
      }

      recordRawChatMemoryTurns(getLocalConversationStateKey(persona), [turn]);
      setChatHistory((current) => {
        const userMessage = chatTurnToChatMessage(turn);
        if (current.some((entry) => entry.id === userMessage.id)) {
          return current;
        }
        return trimChatHistory([...current, userMessage]);
      });
      const activeChatterCount = Math.max(
        1,
        pruneActiveTwitchChatters(twitchActiveChattersRef.current, Date.now()),
      );
      twitchContextRef.current = [...twitchContextRef.current, turn].slice(
        -currentTwitchSettings.contextLimit,
      );
      enqueueChatAiJobRef.current({
        id: `local-direct-${turn.id}`,
        mode: 'direct',
        activeChatterCount,
        context: twitchContextRef.current.slice(-currentTwitchSettings.contextLimit),
        messages: [turn],
      });
    },
    [activePersona, chatInput, recordRawChatMemoryTurns],
  );

  const handleSendChatBarMessage = useCallback(() => {
    void handleSendMessage();
  }, [handleSendMessage]);

  const handleToggleChatLog = useCallback(() => {
    setChatLogOpen((current) => !current);
  }, []);

  const handleToggleMenu = useCallback(() => {
    setMenuOpen((current) => !current);
  }, []);

  const handleCloseMenu = useCallback(() => {
    setMenuOpen(false);
  }, []);

  const appendSystemMessage = useCallback((content: string) => {
    setChatHistory((current) =>
      trimChatHistory([...current, createChatMessage('system', content)]),
    );
  }, []);

  useEffect(() => {
    const desktopBridge = window.webWaifuDesktop;
    if (!desktopBridge?.isDesktop) {
      return undefined;
    }

    const offBackground = desktopBridge.onSceneBackgroundModeRequested?.((mode) => {
      if (mode !== 'persona' && mode !== 'custom' && mode !== 'chroma' && mode !== 'transparent') {
        return;
      }
      setVisualSettings((current) => ({
        ...current,
        sceneBackgroundMode: mode,
        sceneChromaColor: mode === 'chroma' ? '#00ff00' : current.sceneChromaColor,
      }));
      setActiveTab('background');
      setMenuOpen(true);
      appendSystemMessage(`[Desktop] Scene background set to ${mode}.`);
    });

    const offAbout = desktopBridge.onOpenAboutRequested?.(() => {
      setActiveTab('account');
      setMenuOpen(true);
      appendSystemMessage(
        '[Desktop] WebWaifu 4 local-first desktop/OBS VTuber assistant. Provider keys stay local; use Background for transparent/chroma scene controls.',
      );
    });
    const offControls = desktopBridge.onDesktopControlsVisibilityRequested?.((visible) => {
      setDesktopControlsVisible(visible);
    });

    return () => {
      offBackground?.();
      offAbout?.();
      offControls?.();
    };
  }, [appendSystemMessage]);

  useEffect(() => {
    const desktopBridge = window.webWaifuDesktop;
    if (!desktopBridge?.isDesktop) {
      setDesktopRuntime(null);
      return undefined;
    }

    desktopBridge
      .getRuntime?.()
      .then((runtime) => setDesktopRuntime(runtime))
      .catch(() => {
        setDesktopRuntime({
          backendPort: desktopBridge.backendPort ?? '8797',
          clickThrough: false,
          mode: desktopBridge.mode ?? 'editor',
        });
      });

    return desktopBridge.onRuntimeChanged?.((runtime) => setDesktopRuntime(runtime));
  }, []);

  const handleDesktopWindowMode = useCallback((mode: DesktopWindowMode) => {
    void window.webWaifuDesktop?.relaunchWindowMode?.(mode);
  }, []);

  const handleDesktopSceneMode = useCallback((mode: SceneBackgroundMode) => {
    setVisualSettings((current) => ({
      ...current,
      sceneBackgroundMode: mode,
      sceneChromaColor: mode === 'chroma' ? '#00ff00' : current.sceneChromaColor,
    }));
    if (mode === 'transparent' || mode === 'chroma') {
      setActiveTab('background');
    }
  }, []);

  const handleDesktopClickThrough = useCallback(() => {
    if (!desktopRuntime) {
      return;
    }
    void window.webWaifuDesktop
      ?.setClickThrough?.(!desktopRuntime.clickThrough)
      .then((runtime) => setDesktopRuntime(runtime))
      .catch(() => undefined);
  }, [desktopRuntime]);

  const handleOpenDesktopBackgroundSettings = useCallback(() => {
    setActiveTab('background');
    setMenuOpen(true);
  }, []);

  useEffect(() => {
    if (!hydrated || !desktopRuntime || desktopRuntime.mode === 'editor') {
      return;
    }
    setVisualSettings((current) => {
      if (
        current.sceneBackgroundMode === 'transparent' ||
        current.sceneBackgroundMode === 'chroma'
      ) {
        return current;
      }
      return {
        ...current,
        sceneBackgroundMode: 'transparent',
      };
    });
  }, [desktopRuntime, hydrated]);

  useEffect(() => {
    if (!hydrated || startupStatusSentRef.current) {
      return;
    }

    startupStatusSentRef.current = true;
    appendSystemMessage(
      `[Startup] Client Twitch IRC ${DIRECT_TWITCH_CHAT_ENABLED ? `listening to #${twitchChannel || DIRECT_TWITCH_CHANNEL}` : 'disabled'}; server Twitch is off by default. AI: ${getClientAiRouteLabel()}, model=${aiSettingsRef.current.model}. Browser audio stream exposed at window.__yourwifeyAudio.getStream(). Commands: !ww4 help, status, audio, state, state reset, refresh, channel <name>, persona <riko|neuro|hikari>, llm <model>, vrm <id>, camera close|full, anim <name|index>, tts on|off, autospeak on|off, say <text>, chat on|off.`,
    );
  }, [appendSystemMessage, hydrated, twitchChannel]);

  useEffect(() => {
    if (!hydrated || !activePersona) {
      return;
    }

    const sceneKey = `${activePersona.id}:${activePersonaScenePreset.id}`;
    if (appliedPersonaSceneKeyRef.current === sceneKey) {
      return;
    }
    appliedPersonaSceneKeyRef.current = sceneKey;

    stopTtsPlayback();

    if (currentCustomVrmModelId) {
      return;
    }

    if (currentBundledModelId !== activePersonaScenePreset.bundledModelId) {
      void handleLoadBundledModel(activePersonaScenePreset.bundledModelId).catch((error) => {
        console.error('[App] Failed to apply persona scene preset:', error);
        appendSystemMessage(
          `Persona scene failed: could not load ${activePersonaScenePreset.bundledModelId}.`,
        );
      });
    }
  }, [
    activePersona,
    activePersonaScenePreset,
    appendSystemMessage,
    currentBundledModelId,
    currentCustomVrmModelId,
    handleLoadBundledModel,
    hydrated,
    stopTtsPlayback,
  ]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    const binding =
      (activePersona ? personaVoiceBindings[activePersona.id] : undefined) ??
      getPresetPersonaVoiceBinding(activePersonaScenePreset);
    if (binding.provider === 'piper' && !ttsVoices.some((voice) => voice.key === binding.voiceId)) {
      return;
    }
    applyPersonaVoiceBinding(binding);
  }, [
    activePersona,
    activePersonaScenePreset,
    applyPersonaVoiceBinding,
    hydrated,
    personaVoiceBindings,
    ttsVoices,
  ]);

  const playAnimationByIndex = useCallback(
    (index: number) => {
      const entry = sequencerSettingsRef.current.playlist[index];
      if (!entry) {
        appendSystemMessage(`Stream command failed: animation ${index + 1} does not exist.`);
        return;
      }

      setManualPlayRequest({
        index,
        nonce: Date.now(),
      });
    },
    [appendSystemMessage],
  );

  const handleOverlayCommand = useCallback(
    (command: Extract<OverlayServerEvent, { type: 'overlay:command' }>['payload']) => {
      switch (command.action) {
        case 'reload':
          window.location.reload();
          break;
        case 'set-ai-model':
          setAvailableModels((current) =>
            current.includes(command.model) ? current : [...current, command.model],
          );
          setAiSettings((current) => ({
            ...current,
            model: command.model,
          }));
          appendSystemMessage(`Stream command: LLM model set to ${command.model}.`);
          break;
        case 'list-personas':
          appendSystemMessage(`Personas: ${personas.map((persona) => persona.name).join(', ')}.`);
          break;
        case 'set-persona': {
          const nextPersona = resolvePersonaSelector(command.persona, personas);
          if (!nextPersona) {
            appendSystemMessage(`Stream command failed: unknown persona "${command.persona}".`);
            return;
          }

          setActivePersonaId(nextPersona.id);
          appendSystemMessage(`Stream command: persona set to ${nextPersona.name}.`);
          break;
        }
        case 'set-character': {
          const nextPersona = resolvePersonaSelector(command.selector, personas);
          if (nextPersona) {
            setActivePersonaId(nextPersona.id);
            appendSystemMessage(`Stream command: persona set to ${nextPersona.name}.`);
            break;
          }

          const modelId = resolveBundledModelId(command.selector, BUNDLED_VRM_MODELS);
          if (!modelId) {
            appendSystemMessage(`Stream command failed: unknown character "${command.selector}".`);
            return;
          }
          void handleLoadBundledModel(modelId).catch((error) => {
            console.error('[StreamBot] Character command failed:', error);
            appendSystemMessage(`Stream command failed: could not load character ${modelId}.`);
          });
          break;
        }
        case 'list-vrms':
          console.info('[StreamBot] Bundled VRMs:', BUNDLED_VRM_MODELS);
          appendSystemMessage(
            `Bundled VRMs: ${BUNDLED_VRM_MODELS.map((model) => model.id).join(', ')}`,
          );
          break;
        case 'load-vrm': {
          const modelId = resolveBundledModelId(command.model, BUNDLED_VRM_MODELS);
          if (!modelId) {
            appendSystemMessage(`Stream command failed: unknown VRM "${command.model}".`);
            return;
          }
          void handleLoadBundledModel(modelId).catch((error) => {
            console.error('[StreamBot] VRM command failed:', error);
            appendSystemMessage(`Stream command failed: could not load VRM ${modelId}.`);
          });
          break;
        }
        case 'set-camera-view':
          setVisualSettings((current) => ({
            ...current,
            cameraViewMode: command.viewMode,
          }));
          appendSystemMessage(
            `Stream command: camera set to ${command.viewMode === 'half-body' ? 'Half Body / Close' : 'Full Body'}.`,
          );
          break;
        case 'list-animations':
          console.info('[StreamBot] Animations:', sequencerSettingsRef.current.playlist);
          appendSystemMessage(
            `Animations: ${sequencerSettingsRef.current.playlist
              .map((entry, index) => `${index + 1}:${entry.name}`)
              .join(', ')}`,
          );
          break;
        case 'play-animation': {
          const index = resolveAnimationIndex(
            command.selector,
            sequencerSettingsRef.current.playlist,
          );
          if (index === -1) {
            appendSystemMessage(`Stream command failed: unknown animation "${command.selector}".`);
            return;
          }
          playAnimationByIndex(index);
          break;
        }
        case 'sequencer':
          if (command.command === 'start') {
            setSequencerSettings((current) => ({
              ...current,
              playing: true,
            }));
            break;
          }
          if (command.command === 'stop') {
            setSequencerSettings((current) => ({
              ...current,
              playing: false,
              currentIndex: -1,
            }));
            break;
          }
          if (command.command === 'next') {
            const playlist = sequencerSettingsRef.current.playlist;
            const enabledIndexes = playlist
              .map((entry, index) => ({ entry, index }))
              .filter(({ entry }) => entry.enabled && entry.loopEligible !== false)
              .map(({ index }) => index);
            if (enabledIndexes.length === 0) {
              appendSystemMessage('Stream command failed: no enabled animations.');
              return;
            }
            const currentPosition = enabledIndexes.indexOf(
              sequencerSettingsRef.current.currentIndex,
            );
            const nextIndex =
              enabledIndexes[(currentPosition + 1) % enabledIndexes.length] ?? enabledIndexes[0]!;
            playAnimationByIndex(nextIndex);
            break;
          }
          if (command.command === 'random') {
            const enabledIndexes = sequencerSettingsRef.current.playlist
              .map((entry, index) => ({ entry, index }))
              .filter(({ entry }) => entry.enabled && entry.loopEligible !== false)
              .map(({ index }) => index);
            if (enabledIndexes.length === 0) {
              appendSystemMessage('Stream command failed: no enabled animations.');
              return;
            }
            const randomIndex = enabledIndexes[Math.floor(Math.random() * enabledIndexes.length)]!;
            playAnimationByIndex(randomIndex);
          }
          break;
        case 'set-animation-speed':
          setSequencerSettings((current) => ({
            ...current,
            speed: clampNumber(command.speed, 0.1, 3),
          }));
          break;
        case 'set-animation-duration':
          setSequencerSettings((current) => ({
            ...current,
            duration: clampNumber(command.duration, 2, 120),
          }));
          break;
        case 'set-tts':
          setAiSettings((current) => ({
            ...current,
            ttsEnabled: command.enabled,
          }));
          break;
        case 'set-auto-speak':
          setAiSettings((current) => ({
            ...current,
            ttsAutoSpeak: command.enabled,
          }));
          break;
        case 'say': {
          const assistantMessage = createChatMessage('assistant', command.text);
          setChatHistory((current) => trimChatHistory([...current, assistantMessage]));
          void playAssistantResponse(
            assistantMessage,
            aiSettingsRef.current.ttsEnabled && aiSettingsRef.current.ttsAutoSpeak,
            `${activePersona?.name ?? DEFAULT_PERSONA.name} manual stream line`,
          );
          break;
        }
      }
    },
    [
      activePersona?.name,
      appendSystemMessage,
      handleLoadBundledModel,
      personas,
      playAnimationByIndex,
      playAssistantResponse,
    ],
  );

  const handleDirectTwitchCommand = useCallback(
    (message: CommandChatMessage) => {
      const parsed = parseDirectStreamCommand(message, {
        admins: ['subsect'],
        allowMods: true,
        allowTrustedControllers: true,
        prefixes: DIRECT_COMMAND_PREFIXES,
      });
      if (!parsed.matched) {
        return false;
      }

      if (!parsed.authorized) {
        console.info(`[DirectTwitch] Ignored command from ${message.displayName}.`);
        return true;
      }

      const command = parsed.command;
      const respond = (response: string) => {
        appendSystemMessage(`[Command] ${response}`);
      };
      const getCommandStateKey = () =>
        message.isLocal
          ? getLocalConversationStateKey(activePersona ?? DEFAULT_PERSONA)
          : getTwitchConversationStateKey(twitchChannel, activePersona ?? DEFAULT_PERSONA);
      const runOverlayCommand = (
        command: Extract<OverlayServerEvent, { type: 'overlay:command' }>['payload'],
        response: string,
      ) => {
        handleOverlayCommand(command);
        respond(response);
        return true;
      };

      switch (command.kind) {
        case 'help':
          respond(getDirectStreamCommandHelp());
          return true;
        case 'status': {
          const activeChatters = pruneActiveTwitchChatters(
            twitchActiveChattersRef.current,
            Date.now(),
          );
          const currentChannel = directTwitchClientRef.current?.channel ?? twitchChannel;
          const chatStateKey = message.isLocal
            ? getLocalConversationStateKey(activePersona ?? DEFAULT_PERSONA)
            : getTwitchConversationStateKey(currentChannel, activePersona ?? DEFAULT_PERSONA);
          respond(
            `Direct Twitch IRC: #${currentChannel}, controller=${twitchSettingsRef.current.localDisplayName}, activeChatters=${activeChatters}, aiQueue=${twitchAiQueueRef.current.length}/${twitchSettingsRef.current.maxPendingJobs}, batchPending=${twitchBatchRef.current.length}, state=${chatStateKey}.`,
          );
          return true;
        }
        case 'audio': {
          const stream = ttsManager.getOutputStream();
          respond(
            `Browser audio: context=${ttsManager.getAudioState()}, streamTracks=${stream?.getAudioTracks().length ?? 0}, tts=${aiSettingsRef.current.ttsEnabled ? 'on' : 'off'}, autospeak=${aiSettingsRef.current.ttsAutoSpeak ? 'on' : 'off'}, volume=${aiSettingsRef.current.ttsVolume}.`,
          );
          return true;
        }
        case 'ai-state':
          respond(
            `Client AI: route=${getClientAiRouteLabel()}, model=${aiSettingsRef.current.model}, state=${getTwitchConversationStateKey(directTwitchClientRef.current?.channel ?? twitchChannel, activePersona ?? DEFAULT_PERSONA)}, queue=${twitchAiQueueRef.current.length}/${twitchSettingsRef.current.maxPendingJobs}, batchPending=${twitchBatchRef.current.length}.`,
          );
          return true;
        case 'reset-ai-state':
          twitchAiQueueRef.current = [];
          twitchBatchRef.current = [];
          twitchKnownUsersRef.current.clear();
          commitScopedRelationshipMemory(getCommandStateKey(), createDefaultRelationshipMemory());
          respond('Client AI queue and relationship state reset.');
          return true;
        case 'refresh':
          return runOverlayCommand({ action: 'reload' }, 'Refreshing the overlay.');
        case 'channel':
          directTwitchClientRef.current?.switchChannel(command.channel);
          setTwitchChannel(command.channel);
          respond(`Switching Twitch chat to #${command.channel}.`);
          return true;
        case 'set-ai-model':
          return runOverlayCommand(
            { action: 'set-ai-model', model: command.model },
            `LLM model set to ${command.model}.`,
          );
        case 'list-personas':
          respond(`Personas: ${personas.map((persona) => persona.name).join(', ')}.`);
          return true;
        case 'set-persona': {
          const nextPersona = resolvePersonaSelector(command.selector, personas);
          if (nextPersona) {
            setActivePersonaId(nextPersona.id);
            respond(`Persona switched to ${nextPersona.name}; scene preset is applying.`);
          } else {
            respond(
              `Unknown persona "${command.selector}". Try: ${personas.map((persona) => persona.name).join(', ')}.`,
            );
          }
          return true;
        }
        case 'set-character': {
          const nextPersona = resolvePersonaSelector(command.selector, personas);
          if (nextPersona) {
            setActivePersonaId(nextPersona.id);
            respond(`Persona switched to ${nextPersona.name}; scene preset is applying.`);
            return true;
          }
          return runOverlayCommand(
            { action: 'load-vrm', model: command.selector },
            `Loading VRM ${command.selector}.`,
          );
        }
        case 'list-vrms':
          return runOverlayCommand({ action: 'list-vrms' }, 'Asked overlay to list bundled VRMs.');
        case 'set-vrm':
          return runOverlayCommand(
            { action: 'load-vrm', model: command.model },
            `Loading VRM ${command.model}.`,
          );
        case 'set-camera-view':
          return runOverlayCommand(
            { action: 'set-camera-view', viewMode: command.mode },
            `Camera framing set to ${command.mode === 'half-body' ? 'Half Body / Close' : 'Full Body'}.`,
          );
        case 'list-animations':
          return runOverlayCommand(
            { action: 'list-animations' },
            'Asked overlay to list animations.',
          );
        case 'play-animation':
          return runOverlayCommand(
            { action: 'play-animation', selector: command.selector },
            `Playing animation ${command.selector}.`,
          );
        case 'sequencer':
          return runOverlayCommand(
            { action: 'sequencer', command: command.action },
            `Animation sequencer ${command.action}.`,
          );
        case 'set-animation-speed':
          return runOverlayCommand(
            { action: 'set-animation-speed', speed: command.speed },
            `Animation speed set to ${command.speed}.`,
          );
        case 'set-animation-duration':
          return runOverlayCommand(
            { action: 'set-animation-duration', duration: command.duration },
            `Animation duration set to ${command.duration}s.`,
          );
        case 'set-tts':
          return runOverlayCommand(
            { action: 'set-tts', enabled: command.enabled },
            `TTS ${command.enabled ? 'enabled' : 'disabled'}.`,
          );
        case 'set-auto-speak':
          return runOverlayCommand(
            { action: 'set-auto-speak', enabled: command.enabled },
            `Auto-speak ${command.enabled ? 'enabled' : 'disabled'}.`,
          );
        case 'say':
          return runOverlayCommand(
            { action: 'say', text: command.text },
            'Sending manual line to the overlay.',
          );
        case 'set-chat-overlay':
          setChatLogOpen(command.enabled);
          respond(`Twitch overlay chat ${command.enabled ? 'expanded' : 'collapsed'}.`);
          return true;
      }
    },
    [
      activePersona,
      appendSystemMessage,
      commitScopedRelationshipMemory,
      handleOverlayCommand,
      personas,
      ttsManager,
      twitchChannel,
    ],
  );

  const runChatAiJob = useCallback(
    async (job: ChatAiJob) => {
      const settings = aiSettingsRef.current;
      const currentTwitchSettings = twitchSettingsRef.current;
      const persona = activePersona ?? DEFAULT_PERSONA;
      const channel = directTwitchClientRef.current?.channel ?? twitchChannel;
      const providerModels = getProviderModelPool(settings.llmProvider, availableModelsRef.current);
      const selectedModel = pickAvailableModel(
        settings.model,
        providerModels,
        settings.llmProvider === 'openrouter-responses'
          ? DEFAULT_OPENROUTER_MODEL
          : DEFAULT_AI_GATEWAY_MODEL,
      );
      const replyFormat = selectReplyFormat(
        settings.llmProvider,
        availableModelMetadataRef.current.get(selectedModel) ?? null,
      );
      const assistantResponseFormat = replyFormat === 'structured'
        ? ASSISTANT_REPLY_JSON_FORMAT
        : undefined;
      const targetMessage = job.messages[0];
      const prompt = buildChatAiPrompt(
        job,
        persona,
        channel,
        settings.replyLength,
      );
      const streamTranscriptContext = formatTwitchStreamTranscriptContext(
        twitchStreamTranscriptsRef.current,
        currentTwitchSettings.streamTranscriptionContextLimit,
      );
      const currentTurnContext = [prompt, streamTranscriptContext].filter(Boolean).join('\n\n');
      const userContent = buildChatTurnMemoryMessage(job.mode, job.messages);
      const userMessage = targetMessage
        ? chatTurnToChatMessage(targetMessage)
        : createChatMessage('user', userContent);
      const stateKey =
        targetMessage?.source === 'local'
          ? getLocalConversationStateKey(persona)
          : getTwitchConversationStateKey(channel, persona);
      const memorySnapshot = getScopedRelationshipMemory(stateKey);
      const requestHistory = trimChatHistory([...chatHistoryRef.current]);
      const memoryHistory = trimChatHistory([...chatHistoryRef.current, userMessage]);
      const assistantMessage = createChatMessage('assistant', '');
      const speechPlayer = createStreamingAssistantPlayer(
        assistantMessage,
        settings.ttsEnabled && settings.ttsAutoSpeak,
        `${persona.name} ${targetMessage?.source === 'local' ? 'local chat' : 'Twitch'} reply`,
      );
      const ttsBridge =
        settings.ttsEnabled &&
        settings.ttsAutoSpeak &&
        canUseFishLiveBridge(settings)
          ? createRemoteTtsRequest('', settings)
          : undefined;
      const chatAbortController = new AbortController();
      const chatHardTimeout = window.setTimeout(() => {
        chatAbortController.abort();
      }, AI_CHAT_HARD_TIMEOUT_MS);
      setChatHistory((current) => {
        const hasUserMessage = current.some((message) => message.id === userMessage.id);
        return trimChatHistory([
          ...current,
          ...(hasUserMessage ? [] : [userMessage]),
          assistantMessage,
        ]);
      });

      try {
        setAssistantReplyLock(true);
        setChatGenerating(true);
        const participantKeys = job.messages.map(getGrilloParticipantKey);
        const preflightStartedAt = performance.now();
        const semanticMemoryPromise = getSemanticMemoryContext(
          stateKey,
          userContent,
          providerKeyVaultWorkspaceId,
          settings.llmProvider,
          setMemoryEmbeddingDebug,
          settings.embeddingMode,
          settings.embeddingModel,
          settings.embeddingLocalModel,
        );
        const grilloContextPacketPromise = loadLadybugGrilloContextPacket(stateKey, {
          participantKeys,
          query: userContent,
        }).catch((error) => {
          console.warn('[App] Failed to load native GRILLO context packet', error);
          return null;
        });
        const [semanticMemoryContext, grilloContextPacket] = await Promise.all([
          semanticMemoryPromise,
          grilloContextPacketPromise,
        ]);
        console.info('[Chat Preflight] memory context ready', {
          hasLadybugPacket: Boolean(grilloContextPacket),
          ms: Math.round(performance.now() - preflightStartedAt),
          semanticChars: semanticMemoryContext.length,
        });
        const grilloPromptMemory = grilloContextPacket
          ? {
              contextPacket: grilloContextPacket,
              diaryThoughts: [],
              recalledMemories: [],
              relationshipMemory: [],
            }
          : await buildGrilloMemoryPromptAdditionsFailClosedAsync(
              {
                participantKeys,
                query: userContent,
                scopeKey: stateKey,
              },
              (error) => {
                console.warn('[App] Failed to load local GRILLO prompt memory', error);
              },
            );
        setMemoryPromptDebug({
          grilloContextPacket: grilloContextPacket
            ? {
                background_information: grilloContextPacket.background_information,
                channel_history: grilloContextPacket.channel_history,
                output_description: grilloContextPacket.output_description,
                recalled_memories: grilloContextPacket.recalled_memories.map((item) => item.text),
                relationship_memory: grilloContextPacket.relationship_memory,
                thoughts: grilloContextPacket.thoughts,
              }
            : null,
          grilloDiaryThoughts: grilloPromptMemory.diaryThoughts.slice(0, 4),
          grilloRecalledMemories: grilloPromptMemory.recalledMemories
            .slice(0, 6)
            .map((item) => item.text),
          grilloRelationshipMemory: grilloPromptMemory.relationshipMemory.slice(0, 6),
          semanticMemoryContext,
          source: targetMessage?.source ?? 'twitch',
          stateKey,
          turnText: userContent.slice(0, 600),
          updatedAt: Date.now(),
        });
        const promptVisionFrame = getFreshTwitchStreamFrameForPrompt({
          frame: twitchStreamFrameRef.current,
          llmProvider: settings.llmProvider,
          maxAgeSeconds: currentTwitchSettings.streamVisionMaxAgeSeconds,
          model: selectedModel,
          modelMetadata: availableModelMetadataRef.current.get(selectedModel) ?? null,
          visionEnabled: currentTwitchSettings.streamVisionContextEnabled,
        });
        const promptMessages = attachStreamVisionFrame(
          await buildChatCompletionMessages({
            animationCatalogContext: buildAnimationCatalogInstruction(
              sequencerSettingsRef.current.playlist,
            ),
            channelHistory: job.context,
            currentTurnContext,
            grilloMemory: grilloPromptMemory,
            history: requestHistory,
            maxHistoryMessages: job.mode === 'batch' ? 18 : 14,
            persona,
            relationshipMemory: memorySnapshot,
            replyLength: settings.replyLength,
            semanticMemoryContext,
            turnContext: {
              activeChatters: job.activeChatterCount,
              batchMessages: job.messages.length,
              batchSize: getTwitchBatchSize(job.activeChatterCount, currentTwitchSettings),
              botMentionTags: getPersonaMentionTags(persona)
                .map((tag) => `@${tag}`)
                .join(', '),
              chatterThreshold: currentTwitchSettings.directChatterLimit,
              channel,
              conversationScope: targetMessage?.source === 'local' ? 'local-chat' : 'twitch-chat',
              currentTurnText: userContent,
              displayName: targetMessage?.displayName ?? '',
              firstTimeChatter: job.firstTimeChatter ?? false,
              isLocal: targetMessage?.isLocal ?? false,
              isTrustedController: targetMessage?.isTrustedController ?? false,
              login: targetMessage?.login ?? '',
              localControllerNickname: currentTwitchSettings.localDisplayName || 'not configured',
              source: targetMessage?.source ?? 'twitch',
              streamVisionAttached: Boolean(promptVisionFrame),
              targetBadges: targetMessage?.badges.join('/') ?? '',
              targetIsBroadcaster: targetMessage?.isBroadcaster ?? false,
              targetIsMod: targetMessage?.isMod ?? false,
              targetTwitchDisplayName: targetMessage?.displayName ?? '',
              targetTwitchLogin: targetMessage?.login ?? '',
              turnKind: job.mode,
            },
            ttsExpressionTagsEnabled: settings.ttsExpressionTagsEnabled,
            ttsModel:
              settings.ttsProvider === 'fish-speech'
                ? settings.fishSpeechModel
                : settings.ttsProvider === 'inworld'
                  ? settings.inworldModelId
                  : '',
            ttsProvider: settings.ttsProvider,
          }),
          promptVisionFrame,
        );
        console.info('[Chat Preflight] /ai/chat request ready', {
          messageCount: promptMessages.length,
          ms: Math.round(performance.now() - preflightStartedAt),
          provider: settings.llmProvider,
          model: selectedModel,
          replyFormat,
          toolChoiceMode: settings.toolChoiceMode,
          promptChars: promptMessages.reduce((total, message) => total + message.content.length, 0),
        });
        const response = await requestChatCompletion({
          activeChatters: job.activeChatterCount,
          mode: job.mode,
          model: selectedModel,
          llmProvider: settings.llmProvider,
          messages: promptMessages,
          maxTokens: settings.maxTokens,
          maxToolRounds: settings.maxToolRounds,
          stateKey,
          stateScope: 'chat',
          onAudioChunk: speechPlayer.pushAudioChunk,
          onTextDelta: speechPlayer.pushDelta,
          responseFormat: assistantResponseFormat,
          temperature: settings.temperature,
          toolChoiceMode: settings.toolChoiceMode,
          transportMode: settings.aiTransportMode,
          ttsBridge,
          providerKeyVaultWorkspaceId,
          openRouterRouting: buildOpenRouterRouting(settings),
          signal: chatAbortController.signal,
        });
        if (response.meta) {
          setAiProxyHealth((current) => ({
            ...(current ?? {}),
            aiProvider: settings.llmProvider,
            model: selectedModel,
            providerState: {
              ...(current?.providerState ?? {}),
              ...response.meta,
            },
          }));
        }

        const assistantReply = await speechPlayer.finish(response.choices[0]?.message.content);
        const assistantContent = assistantReply.text;
        if (!assistantContent) {
          throw new Error('AI backend returned an empty chat reply.');
        }
        playAssistantMetadataAnimation(response.replyMetadata ?? assistantReply.metadata, stateKey);
        const completedAssistantMessage = {
          ...assistantMessage,
          content: assistantContent,
        };
        const updatedHistory = trimChatHistory([...memoryHistory, completedAssistantMessage]);
        setChatHistory((current) =>
          trimChatHistory(
            current.map((message) =>
              message.id === assistantMessage.id ? completedAssistantMessage : message,
            ),
          ),
        );
        const shouldRecordDurableMemory = shouldIngestChatJobToGrillo(
          job.mode,
          job.messages,
          persona,
          currentTwitchSettings,
        );
        if (shouldRecordDurableMemory) {
          const nextRelationshipMemory = updateRelationshipMemory(
            memorySnapshot,
            updatedHistory,
            userContent,
          );
          commitScopedRelationshipMemory(stateKey, nextRelationshipMemory);
          setMemoryAgentStatus(
            getMemoryProgressStatus(nextRelationshipMemory, settings.memoryAgentIntervalMessages),
          );
          grilloRecentTurnsByStateKeyRef.current[stateKey] = [
            ...(grilloRecentTurnsByStateKeyRef.current[stateKey] ?? []),
            ...job.messages,
          ].slice(-24);
          scheduleRelationshipMemoryRefresh(updatedHistory, nextRelationshipMemory, stateKey);
          void rememberSemanticTurn(
            stateKey,
            userContent,
            assistantContent,
            persona,
            providerKeyVaultWorkspaceId,
            settings.llmProvider,
            setMemoryEmbeddingDebug,
            'semantic-save',
            settings.embeddingMode,
            settings.embeddingModel,
            settings.embeddingLocalModel,
          )
            .then(() => {
              void refreshMemoryBackendStatus();
            })
            .catch((error) => {
              console.warn('[App] Failed to record semantic chat memory turn', error);
            });
          void saveLadybugGrilloTurnPair(
            buildLadybugGrilloTurnPairInput(job, stateKey, userContent, assistantContent, persona),
          )
            .then((saved) => {
              if (saved) {
                void refreshMemoryBackendStatus();
              }
            })
            .catch((error) => {
              console.warn('[App] Failed to record native GRILLO turn pair', error);
            });
          const nextGrilloMemoryState = await recordGrilloMemoryTurnFailClosedAsync(
            {
              assistantText: assistantContent,
              persona,
              scopeKey: stateKey,
              turns: job.messages,
            },
            (error) => {
              console.warn('[App] Failed to record local GRILLO memory turn', error);
            },
          );
          if (nextGrilloMemoryState && stateKey === activeRelationshipStateKey) {
            setGrilloMemoryState(nextGrilloMemoryState);
          }
          void refreshMemoryBackendStatus();
        } else {
          setMemoryAgentStatus('Stream Mode memory gate kept this Twitch turn short-term only.');
        }
      } catch (error) {
        speechPlayer.cancel?.();
        const message = getAiErrorMessage(error, 'chat');
        setChatHistory((current) =>
          trimChatHistory(
            current.map((entry) =>
              entry.id === assistantMessage.id
                ? {
                    ...entry,
                    content: `Request failed: ${message}`,
                  }
                : entry,
            ),
          ),
        );
        appendSystemMessage(`[Chat] AI reply failed: ${message}`);
      } finally {
        window.clearTimeout(chatHardTimeout);
        setChatGenerating(false);
        setAssistantReplyLock(false);
      }
    },
    [
      activePersona,
      appendSystemMessage,
      commitScopedRelationshipMemory,
      createStreamingAssistantPlayer,
      getScopedRelationshipMemory,
      playAssistantMetadataAnimation,
      providerKeyVaultWorkspaceId,
      scheduleRelationshipMemoryRefresh,
      setAssistantReplyLock,
      activeRelationshipStateKey,
      twitchChannel,
    ],
  );

  const processTwitchAiQueue = useCallback(async () => {
    if (twitchAiProcessingRef.current) {
      return;
    }

    twitchAiProcessingRef.current = true;
    try {
      while (twitchAiQueueRef.current.length > 0) {
        const sinceLastReply = Date.now() - twitchLastReplyAtRef.current;
        const waitMs = Math.max(0, twitchSettingsRef.current.replyGapMs - sinceLastReply);
        if (waitMs > 0) {
          await delay(waitMs);
        }

        const job = twitchAiQueueRef.current.shift();
        if (!job) {
          continue;
        }

        await runChatAiJob(job);
        twitchLastReplyAtRef.current = Date.now();
      }
    } finally {
      twitchAiProcessingRef.current = false;
      if (twitchAiQueueRef.current.length > 0) {
        void processTwitchAiQueue();
      }
    }
  }, [runChatAiJob]);

  const enqueueTwitchAiJob = useCallback(
    (job: ChatAiJob) => {
      const currentTwitchSettings = twitchSettingsRef.current;
      const backpressure = enqueueTwitchAiJobWithBackpressure(twitchAiQueueRef.current, job, {
        maxBatchMessages: currentTwitchSettings.maxBatchMessages,
        maxPendingJobs: currentTwitchSettings.maxPendingJobs,
      });
      const backpressureMessage = describeTwitchAiQueueBackpressure(backpressure);
      if (backpressureMessage) {
        console.warn(`[Twitch AI] ${backpressureMessage}`);
        appendSystemMessage(`[Twitch AI] ${backpressureMessage}`);
      }
      void processTwitchAiQueue();
    },
    [appendSystemMessage, processTwitchAiQueue],
  );

  useEffect(() => {
    enqueueChatAiJobRef.current = enqueueTwitchAiJob;
  }, [enqueueTwitchAiJob]);

  const flushTwitchBatch = useCallback(
    (reason: 'count' | 'timer') => {
      if (twitchBatchTimerRef.current !== null) {
        window.clearTimeout(twitchBatchTimerRef.current);
        twitchBatchTimerRef.current = null;
      }

      const messages = twitchBatchRef.current.splice(0);
      if (messages.length === 0) {
        return;
      }

      const activeChatterCount = pruneActiveTwitchChatters(
        twitchActiveChattersRef.current,
        Date.now(),
      );
      console.info(
        `[DirectTwitch] Queued ${reason} batch with ${messages.length} messages and ${activeChatterCount} active chatters.`,
      );
      enqueueTwitchAiJob({
        id: `twitch-batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        mode: 'batch',
        activeChatterCount,
        context: twitchContextRef.current.slice(-twitchSettingsRef.current.contextLimit),
        messages,
      });
    },
    [enqueueTwitchAiJob],
  );

  const scheduleTwitchBatchFlush = useCallback(
    (activeChatterCount: number) => {
      if (twitchBatchTimerRef.current !== null) {
        return;
      }

      const waitMs = getTwitchBatchWaitMs(activeChatterCount, twitchSettingsRef.current);
      twitchBatchTimerRef.current = window.setTimeout(() => {
        flushTwitchBatch('timer');
      }, waitMs);
    },
    [flushTwitchBatch],
  );

  const handleDirectTwitchAiMessage = useCallback(
    (message: DirectTwitchChatMessage) => {
      const currentTwitchSettings = twitchSettingsRef.current;
      if (!currentTwitchSettings.streamModeEnabled || !currentTwitchSettings.aiEnabled) {
        return;
      }

      const now = Date.now();
      const normalizedUser = message.user.toLowerCase();
      const firstTimeChatter = !twitchKnownUsersRef.current.has(normalizedUser);
      const currentChannel = directTwitchClientRef.current?.channel ?? twitchChannel;
      const turn = createTwitchChatTurn(message, currentChannel, firstTimeChatter);
      twitchKnownUsersRef.current.add(normalizedUser);
      twitchActiveChattersRef.current.set(normalizedUser, now);
      const activeChatterCount = pruneActiveTwitchChatters(twitchActiveChattersRef.current, now);
      setTwitchActiveChatterCount(activeChatterCount);
      twitchContextRef.current = [...twitchContextRef.current, turn].slice(
        -currentTwitchSettings.contextLimit,
      );

      if (activeChatterCount <= currentTwitchSettings.directChatterLimit) {
        if (
          currentTwitchSettings.mentionRequiredUnderThreshold &&
          !twitchMessageMentionsPersona(message.text, activePersona ?? DEFAULT_PERSONA)
        ) {
          return;
        }

        console.info(
          `[Twitch AI] Queued @${message.displayName}; ${activeChatterCount} active chatters, ${twitchAiQueueRef.current.length + 1} pending.`,
        );
        enqueueTwitchAiJob({
          id: `twitch-direct-${message.id}`,
          mode: 'direct',
          activeChatterCount,
          context: twitchContextRef.current.slice(-currentTwitchSettings.contextLimit),
          firstTimeChatter,
          messages: [turn],
        });
        return;
      }

      twitchBatchRef.current.push(turn);
      const batchSize = getTwitchBatchSize(activeChatterCount, currentTwitchSettings);
      if (twitchBatchRef.current.length >= batchSize) {
        flushTwitchBatch('count');
      } else {
        scheduleTwitchBatchFlush(activeChatterCount);
      }
    },
    [
      activePersona,
      appendSystemMessage,
      enqueueTwitchAiJob,
      flushTwitchBatch,
      scheduleTwitchBatchFlush,
      twitchChannel,
    ],
  );

  useEffect(() => {
    directTwitchCommandHandlerRef.current = handleDirectTwitchCommand;
  }, [handleDirectTwitchCommand]);

  useEffect(() => {
    directTwitchAiHandlerRef.current = handleDirectTwitchAiMessage;
  }, [handleDirectTwitchAiMessage]);

  useEffect(() => {
    return () => {
      if (twitchBatchTimerRef.current !== null) {
        window.clearTimeout(twitchBatchTimerRef.current);
      }
      twitchBatchTimerRef.current = null;
      twitchAiQueueRef.current = [];
      twitchBatchRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (!hydrated || !DIRECT_TWITCH_CHAT_ENABLED || !twitchSettings.streamModeEnabled) {
      if (hydrated && DIRECT_TWITCH_CHAT_ENABLED) {
        setTwitchConnectionLabel('Off');
      }
      return;
    }

    const client = new DirectTwitchIrcClient(twitchChannel || DIRECT_TWITCH_CHANNEL, {
      onMessage: (message) => {
        const displayTurn = createTwitchChatTurn(message, client.channel, false);
        const persona = activePersonaRef.current ?? DEFAULT_PERSONA;
        const settings = twitchSettingsRef.current;
        if (shouldIngestChatTurnToGrillo(displayTurn, persona, settings)) {
          recordRawChatMemoryTurns(getTwitchConversationStateKey(client.channel, persona), [
            displayTurn,
          ]);
        }
        setChatHistory((current) =>
          trimChatHistory([...current, chatTurnToChatMessage(displayTurn)]),
        );
        const handledCommand =
          twitchSettingsRef.current.commandsEnabled &&
          directTwitchCommandHandlerRef.current(message);
        if (!handledCommand) {
          directTwitchAiHandlerRef.current(message);
        }
      },
      onMembership: (event) => {
        setTwitchMembershipStatus(
          `${event.displayName} ${event.type === 'join' ? 'joined' : 'left'} #${event.channel}.`,
        );
      },
      onStatus: (message, level = 'info') => {
        if (message.includes('connected to #')) {
          setTwitchConnectionLabel('Live');
        } else if (message.includes('disconnected') || message.includes('reconnecting')) {
          setTwitchConnectionLabel('Reconnect');
        } else if (level === 'error') {
          setTwitchConnectionLabel('Offline');
        }
      },
    });

    directTwitchClientRef.current = client;
    setTwitchChannel(client.channel);
    client.start();

    return () => {
      client.stop();
      setTwitchConnectionLabel('Offline');
      if (directTwitchClientRef.current === client) {
        directTwitchClientRef.current = null;
      }
    };
  }, [hydrated, recordRawChatMemoryTurns, twitchChannel, twitchSettings.streamModeEnabled]);

  useEffect(() => {
    if (!STREAM_BOT_WS_ENABLED) {
      return;
    }

    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let closed = false;

    const clearReconnectTimer = () => {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const scheduleReconnect = () => {
      if (closed) {
        return;
      }

      clearReconnectTimer();
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, OVERLAY_RECONNECT_MS);
    };

    const connect = () => {
      if (closed) {
        return;
      }
      socket?.close();
      const protocols = getOverlaySocketProtocols();
      const nextSocket = protocols
        ? new WebSocket(getOverlaySocketUrl(), protocols)
        : new WebSocket(getOverlaySocketUrl());
      socket = nextSocket;

      nextSocket.addEventListener('open', () => {
        nextSocket.send(
          JSON.stringify({
            type: 'overlay:ready',
            payload: { page: window.location.pathname || '/' },
          }),
        );
      });

      nextSocket.addEventListener('message', (event) => {
        if (typeof event.data !== 'string') {
          return;
        }

        const parsed = parseOverlayServerEvent(event.data);
        if (!parsed) {
          return;
        }

        if (parsed.type === 'chat:message') {
          const content = `[Twitch] ${parsed.payload.displayName}: ${parsed.payload.text}`;
          setChatHistory((current) =>
            trimChatHistory([...current, createChatMessage('user', content)]),
          );
          return;
        }

        if (parsed.type === 'twitch:membership') {
          setTwitchMembershipStatus(
            `${parsed.payload.displayName} ${parsed.payload.type === 'join' ? 'joined' : 'left'} #${parsed.payload.channel}.`,
          );
          return;
        }

        if (parsed.type === 'ai:thinking') {
          const player = createStreamingSpeechPlayer(
            aiSettingsRef.current.ttsEnabled && aiSettingsRef.current.ttsAutoSpeak,
            `${activePersona?.name ?? DEFAULT_PERSONA.name} Twitch reply`,
          );
          overlayAiStreamsRef.current.set(parsed.payload.jobId, {
            player,
          });
          return;
        }

        if (parsed.type === 'ai:delta') {
          const stream = overlayAiStreamsRef.current.get(parsed.payload.jobId);
          if (stream) {
            stream.player.pushDelta(parsed.payload.delta);
          }
          return;
        }

        if (parsed.type === 'ai:reply') {
          const stream = overlayAiStreamsRef.current.get(parsed.payload.jobId);
          if (stream) {
            overlayAiStreamsRef.current.delete(parsed.payload.jobId);
            void stream.player
              .finish(parsed.payload.text)
              .then((assistantReply) => playAssistantMetadataAnimation(assistantReply.metadata));
          } else {
            const assistantReply = stripAssistantReplyMetadata(parsed.payload.text);
            playAssistantMetadataAnimation(assistantReply.metadata);
            const assistantMessage = createChatMessage('assistant', assistantReply.text);
            void playAssistantResponse(
              assistantMessage,
              aiSettingsRef.current.ttsEnabled && aiSettingsRef.current.ttsAutoSpeak,
              `${activePersona?.name ?? DEFAULT_PERSONA.name} Twitch reply`,
            );
          }
          return;
        }

        if (parsed.type === 'overlay:command') {
          handleOverlayCommand(parsed.payload);
          return;
        }

        if (parsed.type === 'command:response') {
          appendSystemMessage(`[Command] ${parsed.payload.text}`);
          return;
        }

        if (parsed.type === 'system:status') {
          const statusMessage = `[StreamBot] ${parsed.payload.message}`;
          if (parsed.payload.level === 'error') {
            console.error(statusMessage);
            setChatGenerating(false);
            overlayAiStreamsRef.current.clear();
            appendSystemMessage(statusMessage);
          } else if (parsed.payload.level === 'warning') {
            console.warn(statusMessage);
          } else {
            console.info(statusMessage);
          }
        }
      });

      nextSocket.addEventListener('close', () => {
        if (socket === nextSocket) {
          socket = null;
        }
        setChatGenerating(false);
        overlayAiStreamsRef.current.clear();
        scheduleReconnect();
      });
      nextSocket.addEventListener('error', () => {
        setChatGenerating(false);
        overlayAiStreamsRef.current.clear();
        nextSocket.close();
      });
    };

    connect();

    return () => {
      closed = true;
      clearReconnectTimer();
      socket?.close();
    };
  }, [
    activePersona?.name,
    appendSystemMessage,
    createStreamingSpeechPlayer,
    handleOverlayCommand,
    playAssistantMetadataAnimation,
    playAssistantResponse,
  ]);

  const productShellActive = false;
  const overlayPageActive = false;
  const overlayControlsActive = false;
  const persistedStateSnapshot = useMemo<PersistedChatState>(
    () => ({
      activePersonaId,
      activeTab,
      aiSettings,
      chatHistory,
      chatHistories: {
        ...chatHistories,
        [activeChatHistoryStateKeyRef.current || activeRelationshipStateKey]: chatHistory,
      },
      currentBundledModelId,
      currentCustomVrmModelId,
      emotionTelemetryEvents,
      personaVoiceBindings,
      personas,
      relationshipMemories,
      relationshipMemory,
      sequencerSettings,
      twitchChannel,
      twitchSettings,
      uiState: {
        chatDraft: chatInput,
        chatLogOpen,
        menuOpen,
      },
      visualSettings,
      voiceLabVoices,
    }),
    [
      activePersonaId,
      activeTab,
      aiSettings,
      activeRelationshipStateKey,
      chatHistories,
      chatHistory,
      chatInput,
      chatLogOpen,
      currentBundledModelId,
      currentCustomVrmModelId,
      emotionTelemetryEvents,
      menuOpen,
      personaVoiceBindings,
      personas,
      relationshipMemories,
      relationshipMemory,
      sequencerSettings,
      twitchChannel,
      twitchSettings,
      visualSettings,
      voiceLabVoices,
    ],
  );
  const handleExportLocalTransferBackup = useCallback(async () => {
    try {
      setLocalTransferStatus('Preparing local transfer backup...');
      const providerVault = createBrowserProviderKeyVault({
        mode: 'local-indexeddb',
        workspaceId: providerKeyVaultWorkspaceId,
      });
      const models = await listSavedVrmModels();
      const savedModelBackups = await Promise.all(
        models.map(async (model) => {
          const blob = await getSavedVrmModelBlob(model.id);
          return {
            ...model,
            dataBlob: blob,
          };
        }),
      );
      setLocalTransferStatus(
        `Exporting local transfer backup with ${savedModelBackups.length} saved VRMs...`,
      );
      const backup = await createLocalTransferBackupBlobInWorker({
        providerSecrets: await providerVault.exportSecrets(),
        savedVrmModels: savedModelBackups,
        state: persistedStateSnapshot,
      });
      const fileName = `web-waifu-4-local-backup-${backup.exportedAt
        .replace(/[:.]/g, '-')
        .slice(0, 19)}.json`;
      const url = URL.createObjectURL(backup.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setLocalTransferStatus(
        `Exported ${fileName} with ${backup.providerSecretCount} keys and ${backup.savedVrmModelCount} saved VRMs.`,
      );
    } catch (error) {
      setLocalTransferStatus(formatLocalTransferBackupError('export', error));
    }
  }, [persistedStateSnapshot, providerKeyVaultWorkspaceId]);

  const handleImportLocalTransferBackup = useCallback(
    async (file: File) => {
      try {
        setLocalTransferStatus(`Importing ${file.name}...`);
        const { backup, decodedSavedVrmModels } = await parseLocalTransferBackupInWorker(file);
        const providerVault = createBrowserProviderKeyVault({
          mode: 'local-indexeddb',
          workspaceId: providerKeyVaultWorkspaceId,
        });

        await providerVault.importSecrets(backup.providerSecrets);

        for (const model of decodedSavedVrmModels) {
          await saveVrmModelBlob({
            blob: model.blob,
            createdAt: model.createdAt,
            id: model.id,
            name: model.name,
            originalFileName: model.originalFileName,
            type: model.type,
            updatedAt: model.updatedAt,
          });
        }

        const next = backup.state;
        const nextActivePersona =
          next.personas.find((persona) => persona.id === next.activePersonaId) ??
          next.personas[0] ??
          DEFAULT_PERSONA;
        const nextActiveStateKey = getLocalConversationStateKey(nextActivePersona);
        const scopedSnapshot = resolveScopedConversationSnapshot({
          chatHistories: next.chatHistories,
          fallbackChatHistory: next.chatHistory,
          fallbackRelationshipMemory: next.relationshipMemory,
          relationshipMemories: next.relationshipMemories,
          stateKey: nextActiveStateKey,
        });
        activeChatHistoryStateKeyRef.current = nextActiveStateKey;
        activeRelationshipStateKeyRef.current = nextActiveStateKey;
        await savePersistedChatState(next);
        setPersonas(next.personas);
        setActivePersonaId(next.activePersonaId);
        setPersonaVoiceBindings(next.personaVoiceBindings);
        setVoiceLabVoices(next.voiceLabVoices);
        setAiSettings(next.aiSettings);
        setChatHistories(next.chatHistories);
        chatHistoriesRef.current = next.chatHistories;
        setChatHistory(scopedSnapshot.chatHistory);
        setRelationshipMemory(scopedSnapshot.relationshipMemory);
        relationshipMemoryRef.current = scopedSnapshot.relationshipMemory;
        setRelationshipMemories(next.relationshipMemories);
        relationshipMemoriesRef.current = next.relationshipMemories;
        setChatInput(next.uiState.chatDraft);
        setChatLogOpen(next.uiState.chatLogOpen);
        setActiveTab(next.activeTab);
        setCurrentBundledModelId(next.currentBundledModelId);
        setCurrentCustomVrmModelId(next.currentCustomVrmModelId);
        setTwitchChannel(next.twitchChannel);
        setTwitchSettings(next.twitchSettings);
        setSequencerSettings(next.sequencerSettings);
        setVisualSettings(next.visualSettings);

        const models = await refreshSavedVrmModels();
        if (
          next.currentCustomVrmModelId &&
          models.some((model) => model.id === next.currentCustomVrmModelId)
        ) {
          if (next.currentCustomVrmModelId !== currentCustomVrmModelId) {
            prepareForModelSwap();
            const blob = await getSavedVrmModelBlob(next.currentCustomVrmModelId);
            loadModelUrl(URL.createObjectURL(blob));
          }
          setCurrentBundledModelId('');
          setCurrentCustomVrmModelId(next.currentCustomVrmModelId);
        } else if (
          next.currentBundledModelId &&
          BUNDLED_VRM_MODELS.some((model) => model.id === next.currentBundledModelId)
        ) {
          if (currentCustomVrmModelId || next.currentBundledModelId !== currentBundledModelId) {
            await handleLoadBundledModel(next.currentBundledModelId);
          } else {
            setCurrentBundledModelId(next.currentBundledModelId);
            setCurrentCustomVrmModelId('');
          }
        }

        setSavedVrmStatus(
          backup.savedVrmModels.length
            ? `Imported ${backup.savedVrmModels.length} saved VRM model(s).`
            : savedVrmStatus,
        );
        setLocalTransferStatus(
          `Imported ${backup.providerSecrets.length} keys, ${backup.savedVrmModels.length} saved VRMs, and app settings from ${file.name}.`,
        );
      } catch (error) {
        setLocalTransferStatus(formatLocalTransferBackupError('import', error));
      }
    },
    [
      handleLoadBundledModel,
      currentBundledModelId,
      currentCustomVrmModelId,
      prepareForModelSwap,
      providerKeyVaultWorkspaceId,
      refreshSavedVrmModels,
      savedVrmStatus,
    ],
  );
  return (
    <div
      className={`shell ${productShellActive ? 'product-shell-mode' : ''} ${
        overlayPageActive ? 'overlay-shell-mode' : ''
      } ${renderedVisualSettings.sceneBackgroundMode === 'transparent' ? 'scene-background-transparent' : ''}`}
      onClick={(event) => {
        if (!menuOpen) {
          return;
        }
        if (isSettingsMenuInteraction(event)) {
          return;
        }
        setMenuOpen(false);
      }}
      style={shellStyle}
    >
      {desktopRuntime && desktopRuntime.mode !== 'editor' ? (
        <div aria-hidden="true" className="desktop-drag-frame">
          <div className="desktop-drag-frame__zone desktop-drag-frame__zone--top" />
          <div className="desktop-drag-frame__zone desktop-drag-frame__zone--left" />
          <div className="desktop-drag-frame__zone desktop-drag-frame__zone--right" />
          <div className="desktop-drag-frame__zone desktop-drag-frame__zone--bottom" />
        </div>
      ) : null}
      <VrmStage
        active={sceneActive}
        facialExpressionRequest={facialExpressionRequest}
        manualPlayRequest={manualPlayRequest}
        modelUrl={modelUrl}
        onAnimationTelemetry={patchEmotionTelemetryEvent}
        onFacialExpressionTelemetry={patchEmotionTelemetryEvent}
        onVrmTelemetry={setVrmTelemetry}
        sequencerSettings={sequencerSettings}
        setSequencerSettings={setSequencerSettings}
        setVisualSettings={setVisualSettings}
        visualSettings={renderedVisualSettings}
      />

      {!productShellActive && (!overlayPageActive || overlayControlsActive) ? (
        <div className="ui-layer">
          {desktopRuntime && desktopControlsVisible ? (
            <div
              className="desktop-control-strip"
              onClick={(event) => event.stopPropagation()}
              title="Use empty top/edge areas to drag the frameless transparent window."
            >
              <div className="desktop-control-strip__status">
                <span>Desktop</span>
                <strong>{desktopRuntime.mode}</strong>
                <span>BG</span>
                <strong>{visualSettings.sceneBackgroundMode}</strong>
              </div>
              <button
                className="desktop-control-strip__button"
                disabled={desktopRuntime.mode === 'editor'}
                onClick={() => handleDesktopWindowMode('editor')}
                type="button"
              >
                Editor
              </button>
              <button
                className="desktop-control-strip__button"
                disabled={desktopRuntime.mode === 'desktop'}
                onClick={() => handleDesktopWindowMode('desktop')}
                type="button"
              >
                Desktop
              </button>
              <button
                className="desktop-control-strip__button"
                disabled={desktopRuntime.mode === 'overlay'}
                onClick={() => handleDesktopWindowMode('overlay')}
                type="button"
              >
                Overlay
              </button>
              <button
                className="desktop-control-strip__button"
                onClick={() => handleDesktopSceneMode('transparent')}
                type="button"
              >
                Transparent
              </button>
              <button
                className="desktop-control-strip__button"
                onClick={() => handleDesktopSceneMode('chroma')}
                type="button"
              >
                Chroma
              </button>
              <button
                className="desktop-control-strip__button"
                onClick={() => handleDesktopSceneMode('persona')}
                type="button"
              >
                Painted
              </button>
              <button
                className="desktop-control-strip__button"
                disabled={desktopRuntime.mode === 'editor'}
                onClick={handleDesktopClickThrough}
                type="button"
              >
                Click {desktopRuntime.clickThrough ? 'On' : 'Off'}
              </button>
              <button
                className="desktop-control-strip__button desktop-control-strip__button--primary"
                onClick={handleOpenDesktopBackgroundSettings}
                type="button"
              >
                Background
              </button>
              <button
                className="desktop-control-strip__button"
                onClick={() => setDesktopControlsVisible(false)}
                type="button"
              >
                Hide
              </button>
            </div>
          ) : null}
          {desktopRuntime && !desktopControlsVisible ? (
            <button
              className="desktop-controls-reveal"
              onClick={(event) => {
                event.stopPropagation();
                setDesktopControlsVisible(true);
              }}
              title="Show desktop controls"
              type="button"
            >
              Controls
            </button>
          ) : null}
          <ChatLog
            activePersonaName={activePersona?.name ?? DEFAULT_PERSONA.name}
            botMentionTag={activePersonaMentionTag}
            channelName={twitchChannel}
            displayOverrides={chatDisplayOverrides}
            history={chatHistory}
            isGenerating={chatGenerating || assistantReplyLocked}
            modeLabel={twitchModeLabel}
            onClear={handleClearChat}
            onToggle={handleToggleChatLog}
            open={chatLogOpen}
          />

          <MenuFab onToggle={handleToggleMenu} open={menuOpen} />

          {menuOpen ? (
            <SettingsPanel
              activePersona={activePersona}
              activeTab={activeTab}
              activeTwitchChatters={twitchActiveChatterCount}
              aiProxyHealth={aiProxyHealth}
              aiProxyHealthError={aiProxyHealthError}
              aiSettings={aiSettings}
              availableModelMetadata={availableModelMetadata}
              availableModels={availableModels}
              batchPending={twitchBatchRef.current.length}
              botMentionTag={activePersonaMentionTag}
              bundledModels={BUNDLED_VRM_MODELS}
              chatDraftLength={chatInput.length}
              chatOverlayOpen={chatLogOpen}
              messageCount={chatHistory.length}
              currentBundledModelId={currentBundledModelId}
              currentCustomVrmModelId={currentCustomVrmModelId}
              emotionTelemetryEvents={emotionTelemetryEvents}
              vrmTelemetry={vrmTelemetry}
              localTransferStatus={localTransferStatus}
              onClearChat={handleClearChat}
              onClearDraft={handleClearDraft}
              onClearMemory={handleClearMemory}
              modelsError={modelsError}
              modelsLoading={modelsLoading}
              onCacheVoice={() => {
                void handleCacheTtsVoice();
              }}
              onActivatePersona={(personaId) => {
                setActivePersonaId(personaId);
              }}
              onClose={handleCloseMenu}
              onDeletePersona={handleDeletePersona}
              onImportAnimationFile={(file) => {
                const url = URL.createObjectURL(file);
                const format = getAnimationFormatFromFileName(file.name);
                setSequencerSettings((current) => ({
                  ...current,
                  playlist: [
                    ...current.playlist,
                    {
                      id: `custom-${Date.now()}`,
                      name: file.name.replace(/\.(fbx|glb|gltf|vrma|bvh)$/i, ''),
                      url,
                      format,
                      enabled: true,
                      experimental: false,
                      loopEligible: false,
                      purpose: 'gesture',
                      tags: ['custom'],
                    },
                  ],
                }));
              }}
              onDeleteSavedVrmModel={(modelId) => {
                void handleDeleteSavedVrmModel(modelId).catch((error) => {
                  const message = error instanceof Error ? error.message : 'Delete failed.';
                  console.error('[VRM] Failed to delete saved model:', error);
                  setSavedVrmStatus(message);
                });
              }}
              onLoadModelFile={(file) => {
                void handleSaveAndLoadVrmFile(file).catch((error) => {
                  const message = error instanceof Error ? error.message : 'VRM save failed.';
                  console.error('[VRM] Failed to save uploaded model:', error);
                  setSavedVrmStatus(message);
                });
              }}
              onLoadBundledModel={(modelId) => {
                void handleLoadBundledModel(modelId).catch(() => {});
              }}
              onLoadSavedVrmModel={(modelId) => {
                void handleLoadSavedVrmModel(modelId).catch((error) => {
                  const message = error instanceof Error ? error.message : 'Saved VRM load failed.';
                  console.error('[VRM] Failed to load saved model:', error);
                  setSavedVrmStatus(message);
                });
              }}
              onLoadSample={() => {
                void handleLoadBundledModel(DEFAULT_BUNDLED_MODEL_ID).catch(() => {});
              }}
              onExportLocalBackup={() => {
                void handleExportLocalTransferBackup().catch((error) => {
                  setLocalTransferStatus(
                    error instanceof Error ? error.message : 'Could not export local backup.',
                  );
                });
              }}
              onImportLocalBackup={(file) => {
                void handleImportLocalTransferBackup(file).catch((error) => {
                  setLocalTransferStatus(
                    error instanceof Error ? error.message : 'Could not import local backup.',
                  );
                });
              }}
              onPlayAnimation={(request) => {
                setManualPlayRequest(request);
              }}
              onRefreshModels={() => {
                void loadAvailableModels();
              }}
              onRefreshSavedVrmModels={() => {
                void refreshSavedVrmModels();
              }}
              onRefreshAiProxyHealth={() => {
                void refreshAiProxyHealth();
              }}
              onApplyPersonaVoice={handleApplyPersonaVoice}
              onCreateVoiceLabProviderVoice={handleCreateVoiceLabProviderVoice}
              onDeleteVoiceLabVoice={handleDeleteVoiceLabVoice}
              onRefreshRemoteVoices={(provider) => {
                for (const key of Array.from(remoteTtsVoiceFetchAttemptedRef.current)) {
                  if (key === provider || key.startsWith(`${provider}:`)) {
                    remoteTtsVoiceFetchAttemptedRef.current.delete(key);
                  }
                }
                void loadRemoteTtsVoices(provider, true);
              }}
              onRefreshVoices={() => {
                void loadTtsVoices();
              }}
              onResetContext={handleResetContext}
              onResetTwitchState={() => {
                if (twitchBatchTimerRef.current !== null) {
                  window.clearTimeout(twitchBatchTimerRef.current);
                  twitchBatchTimerRef.current = null;
                }
                twitchAiQueueRef.current = [];
                twitchBatchRef.current = [];
                twitchKnownUsersRef.current.clear();
                appendSystemMessage('Twitch AI queue reset.');
              }}
              onRunBackendGrilloBeat={handleRunBackendGrilloBeat}
              onRunBackendGrilloCompaction={handleRunBackendGrilloCompaction}
              onRunBackendGrilloConsolidation={handleRunBackendGrilloConsolidation}
              onRunBackendGrilloSemanticIndexing={handleRunBackendGrilloSemanticIndexing}
              onRunBackendGrilloTick={handleRunBackendGrilloTick}
              onRunMemoryAgent={handleRunMemoryAgentNow}
              onRunTtsBenchmark={handleRunTtsBenchmark}
              onSavePersona={handleSavePersona}
              onSaveVoiceLabVoice={handleSaveVoiceLabVoice}
              onSelectVoice={handleSelectTtsVoice}
              onSetTwitchChannel={(channel) => {
                const cleanChannel = channel.replace(/^#/, '').trim().toLowerCase();
                if (!cleanChannel) {
                  return;
                }
                directTwitchClientRef.current?.switchChannel(cleanChannel);
                setTwitchChannel(cleanChannel);
                setTwitchMembershipStatus('Membership events idle.');
                appendSystemMessage(`Twitch channel switched to #${cleanChannel}.`);
              }}
              onSpeakLastReply={handleSpeakLastReply}
              onStopTts={handleStopTts}
              onTabChange={setActiveTab}
              onTestVoice={handleTestTtsVoice}
              onToggleChatOverlay={setChatLogOpen}
              onUseCurrentVoiceAsPersonaDefault={handleUseCurrentVoiceAsPersonaDefault}
              open={menuOpen}
              personaVoiceBindings={personaVoiceBindings}
              personas={personas}
              savedVrmModels={savedVrmModels}
              savedVrmStatus={savedVrmStatus}
              backendGrilloTickBusy={backendGrilloTickBusy}
              grilloMemoryState={grilloMemoryState}
              grilloRuntimeStatus={grilloRuntimeStatus}
              relationshipMemory={relationshipMemory}
              memoryAgentBusy={memoryAgentBusy}
              memoryAgentStatus={memoryAgentStatus}
              memoryBackendStatus={memoryBackendStatus}
              memoryGraphSummary={memoryGraphSummary}
              memoryEmbeddingDebug={memoryEmbeddingDebug}
              memoryPromptDebug={memoryPromptDebug}
              memoryWorkerDebug={memoryWorkerDebug}
              memoryAgentPendingCounts={memoryAgentPendingCounts}
              sequencerSettings={sequencerSettings}
              setAiSettings={setAiSettings}
              setSequencerSettings={setSequencerSettings}
              setTwitchSettings={setTwitchSettings}
              setVisualSettings={setVisualSettings}
              ttsActiveVoice={activeTtsVoice}
              ttsBusy={ttsBusy}
              ttsCached={selectedTtsCached}
              ttsStatus={ttsStatus}
              ttsVoices={ttsVoices}
              remoteTtsVoiceCatalog={remoteTtsVoices}
              remoteTtsVoices={activeRemoteTtsVoices}
              remoteVoicesError={remoteTtsVoicesError}
              remoteVoicesLoading={remoteTtsVoicesLoading}
              voiceLabVoices={voiceLabVoices}
              twitchAiModeLabel={twitchModeLabel}
              twitchChannel={twitchChannel}
              twitchConnectionLabel={twitchConnectionLabel}
              twitchDirectChatEnabled={DIRECT_TWITCH_CHAT_ENABLED}
              twitchMembershipStatus={twitchMembershipStatus}
              twitchQueueLength={twitchAiQueueRef.current.length}
              twitchSettings={twitchSettings}
              twitchStreamTranscriptCount={twitchStreamTranscripts.length}
              twitchStreamTranscriptionStatus={twitchStreamTranscriptionStatus}
              twitchStreamVisionStatus={twitchStreamVisionStatus}
              visualSettings={visualSettings}
              voicesError={ttsVoicesError}
              voicesLoading={ttsVoicesLoading}
            />
          ) : null}

          {subtitleText ? (
            <div className="subtitle-overlay" aria-live="polite">
              {subtitleText}
            </div>
          ) : null}

          <button
            className={`chat-bar-toggle ${chatBarOpen ? 'active' : ''}`}
            onClick={(event) => {
              event.stopPropagation();
              setChatBarOpen((current) => !current);
            }}
            title={chatBarOpen ? 'Hide local chat bar' : 'Show local chat bar'}
            type="button"
          >
            <svg
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
            </svg>
          </button>

          {chatBarOpen ? (
            <ChatBar
              activePersonaName={activePersona?.name ?? DEFAULT_PERSONA.name}
              inputValue={chatInput}
              isGenerating={chatGenerating || assistantReplyLocked}
              messageCount={chatHistory.length}
              model={aiSettings.model}
              onInputChange={setChatInput}
              onSend={handleSendChatBarMessage}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default App;
