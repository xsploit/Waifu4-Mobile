import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { SettingsTabId } from '../../lib/menu/types';
import {
  DEFAULT_PERSONA,
  createDefaultAiSettings,
  createDefaultPersonaVoiceBindings,
  createDefaultPersonas,
  createDefaultRelationshipMemory,
  createDefaultTwitchSettings,
} from '../../lib/chat/defaults';
import { createDefaultGrilloMemoryState } from '../../lib/chat/grillo-memory';
import { createDefaultSequencerSettings, createDefaultVisualSettings } from '../../lib/menu/defaults';
import { SettingsPanel } from './SettingsPanel';

type SettingsPanelProps = ComponentProps<typeof SettingsPanel>;

const noop = () => {};

function createProps(activeTab: SettingsTabId): SettingsPanelProps {
  const personas = createDefaultPersonas();
  return {
    activePersona: personas[0] ?? DEFAULT_PERSONA,
    activeTab,
    activeTwitchChatters: 0,
    aiProxyHealth: null,
    aiProxyHealthError: null,
    aiSettings: createDefaultAiSettings(),
    availableModelMetadata: new Map(),
    availableModels: [],
    backendGrilloTickBusy: false,
    batchPending: 0,
    botMentionTag: '@hikari',
    bundledModels: [{ assetPath: '/models/default.vrm', id: 'default', label: 'Default' }],
    chatDraftLength: 0,
    chatOverlayOpen: true,
    currentBundledModelId: 'default',
    currentCustomVrmModelId: '',
    emotionTelemetryEvents: [],
    grilloMemoryState: createDefaultGrilloMemoryState('test-scope'),
    grilloRuntimeStatus: null,
    localTransferStatus: 'Ready',
    memoryAgentBusy: false,
    memoryAgentPendingCounts: {},
    memoryAgentStatus: 'Idle',
    memoryBackendStatus: null,
    memoryEmbeddingDebug: null,
    memoryGraphSummary: null,
    memoryPromptDebug: null,
    memoryWorkerDebug: null,
    messageCount: 0,
    modelsError: null,
    modelsLoading: false,
    onActivatePersona: noop,
    onApplyPersonaVoice: noop,
    onCacheVoice: noop,
    onClearChat: noop,
    onClearDraft: noop,
    onClearMemory: noop,
    onClose: noop,
    onCreateVoiceLabProviderVoice: async () => ({
      id: 'created-voice',
      name: 'Created Voice',
      provider: 'fish-speech',
      providerVoiceId: 'provider-voice',
    }),
    onDeletePersona: noop,
    onDeleteSavedVrmModel: noop,
    onDeleteVoiceLabVoice: noop,
    onExportLocalBackup: noop,
    onImportAnimationFile: noop,
    onImportLocalBackup: noop,
    onLoadBundledModel: noop,
    onLoadModelFile: noop,
    onLoadSample: noop,
    onLoadSavedVrmModel: noop,
    onPlayAnimation: noop,
    onRefreshAiProxyHealth: noop,
    onRefreshModels: noop,
    onRefreshRemoteVoices: noop,
    onRefreshSavedVrmModels: noop,
    onRefreshVoices: noop,
    onResetContext: noop,
    onResetTwitchState: noop,
    onRunBackendGrilloBeat: noop,
    onRunBackendGrilloCompaction: noop,
    onRunBackendGrilloConsolidation: noop,
    onRunBackendGrilloSemanticIndexing: noop,
    onRunBackendGrilloTick: noop,
    onRunMemoryAgent: noop,
    onRunTtsBenchmark: async () => [],
    onSavePersona: noop,
    onSaveVoiceLabVoice: noop,
    onSelectVoice: noop,
    onSetTwitchChannel: noop,
    onSpeakLastReply: noop,
    onStopTts: noop,
    onTabChange: noop,
    onTestVoice: noop,
    onToggleChatOverlay: noop,
    onUseCurrentVoiceAsPersonaDefault: noop,
    open: true,
    personaVoiceBindings: createDefaultPersonaVoiceBindings(),
    personas,
    relationshipMemory: createDefaultRelationshipMemory(),
    remoteTtsVoices: [],
    remoteVoicesError: null,
    remoteVoicesLoading: false,
    savedVrmModels: [],
    savedVrmStatus: 'Ready',
    sequencerSettings: createDefaultSequencerSettings(),
    setAiSettings: noop,
    setSequencerSettings: noop,
    setTwitchSettings: noop,
    setVisualSettings: noop,
    ttsActiveVoice: null,
    ttsBusy: false,
    ttsCached: false,
    ttsStatus: 'Idle',
    ttsVoices: [],
    twitchAiModeLabel: 'Local',
    twitchChannel: 'subsect',
    twitchConnectionLabel: 'Disconnected',
    twitchDirectChatEnabled: true,
    twitchMembershipStatus: 'Unknown',
    twitchQueueLength: 0,
    twitchSettings: createDefaultTwitchSettings(),
    twitchStreamTranscriptCount: 0,
    twitchStreamTranscriptionStatus: 'Idle',
    twitchStreamVisionStatus: 'Idle',
    visualSettings: createDefaultVisualSettings(),
    voiceLabVoices: [],
    voicesError: null,
    voicesLoading: false,
    vrmTelemetry: null,
  };
}

describe('SettingsPanel tab smoke', () => {
  const tabMarkers: Array<[SettingsTabId, string]> = [
    ['account', 'Browser Provider Keys'],
    ['vrm', 'Avatar Source'],
    ['background', 'Scene Background'],
    ['anim', 'Now Playing'],
    ['emotion-telemetry', 'Emotion Telemetry'],
    ['character', 'Default Character'],
    ['voice-lab', 'Persona Voice Defaults'],
    ['ai', 'LLM Provider'],
    ['twitch', 'Twitch Connection'],
    ['context', 'G.R.I.L.L.O.'],
    ['tts', 'Speech Output'],
  ];

  it.each(tabMarkers)('renders the %s tab without blanking the panel', (activeTab, marker) => {
    const html = renderToStaticMarkup(<SettingsPanel {...createProps(activeTab)} />);

    expect(html).toContain('settings-panel open');
    expect(html).toContain(marker);
  });
});
