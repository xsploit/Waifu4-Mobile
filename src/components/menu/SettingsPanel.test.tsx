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
    remoteTtsVoiceCatalog: {
      'fish-speech': [],
      inworld: [],
    },
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

  it('keeps AI model metadata, tool, cache, and transport controls mounted', () => {
    const props = createProps('ai');
    props.aiSettings = {
      ...props.aiSettings,
      llmProvider: 'openrouter-responses',
      model: 'provider/chat-vision-tools',
    };
    props.availableModels = ['provider/chat-vision-tools'];
    props.availableModelMetadata = new Map([
      [
        'provider/chat-vision-tools',
        {
          contextWindow: 128000,
          id: 'provider/chat-vision-tools',
          inputModalities: ['text', 'image'],
          supportedParameters: ['structured_outputs', 'tools', 'tool_choice'],
          supportsImplicitCaching: true,
          supportsStructuredOutputs: true,
          tags: ['vision', 'cache'],
          type: 'language',
        },
      ],
    ]);
    props.aiProxyHealth = {
      aiProvider: 'openrouter-responses',
      providerState: {
        cachedTokens: 42,
        promptCacheKey: 'cache-key',
        toolNames: ['tavily_search'],
        toolsAvailable: true,
        toolsSource: 'account',
      },
    };

    const html = renderToStaticMarkup(<SettingsPanel {...props} />);

    expect(html).toContain('Capabilities:');
    expect(html).toContain('json, vision, tools, cache, 128K ctx');
    expect(html).toContain('Tool Calls: Auto');
    expect(html).toContain('Max tool rounds');
    expect(html).toContain('Prompt cache:');
    expect(html).toContain('tavily_search');
  });

  it('keeps Twitch direct IRC, ASR, queue, and stream vision controls mounted', () => {
    const props = createProps('twitch');
    props.twitchSettings = {
      ...props.twitchSettings,
      streamTranscriptionEnabled: true,
      streamVisionContextEnabled: true,
    };

    const html = renderToStaticMarkup(<SettingsPanel {...props} />);

    expect(html).toContain('Twitch Connection');
    expect(html).toContain('Direct queue:');
    expect(html).toContain('ASR:');
    expect(html).toContain('ASR model');
    expect(html).toContain('Fish ASR');
    expect(html).toContain('OpenRouter ASR uses the Account-tab OpenRouter key');
    expect(html).toContain('Attach Twitch stream frame to vision models');
    expect(html).toContain('Captures one JPEG frame from the Twitch stream');
  });

  it('keeps provider embedding picker filtered by metadata while allowing custom IDs', () => {
    const props = createProps('context');
    props.aiSettings = {
      ...props.aiSettings,
      embeddingModel: 'custom/embed-model',
    };
    props.availableModels = ['provider/chat-model', 'provider/embed-model'];
    props.availableModelMetadata = new Map([
      [
        'provider/chat-model',
        {
          id: 'provider/chat-model',
          inputModalities: ['text'],
          supportedParameters: ['structured_outputs'],
          supportsStructuredOutputs: true,
          type: 'language',
        },
      ],
      [
        'provider/embed-model',
        {
          id: 'provider/embed-model',
          inputModalities: ['text'],
          supportedParameters: [],
          supportsStructuredOutputs: false,
          type: 'embedding',
        },
      ],
    ]);

    const html = renderToStaticMarkup(<SettingsPanel {...props} />);
    const embeddingDatalist =
      html.match(/<datalist id="provider-embedding-model-options">.*?<\/datalist>/)?.[0] ?? '';

    expect(html).toContain('Embedding source');
    expect(html).toContain('Embedding model (provider)');
    expect(embeddingDatalist).toContain('value="provider/embed-model"');
    expect(embeddingDatalist).toContain('value="custom/embed-model"');
    expect(embeddingDatalist).not.toContain('value="provider/chat-model"');
    expect(html).toContain('Provider embedding catalog:');
    expect(html).toContain('1 embedding model');
  });

  it('keeps Voice Lab provider creation, catalog, and persona binding controls mounted', () => {
    const props = createProps('voice-lab');
    props.remoteTtsVoices = [
      {
        description: 'Saved provider voice',
        id: 'fish-voice-1',
        name: 'Fish Catalog Voice',
        provider: 'fish-speech',
      },
    ];
    props.remoteTtsVoiceCatalog = {
      'fish-speech': props.remoteTtsVoices,
      inworld: [
        {
          description: 'Inworld provider voice',
          id: 'inworld-voice-1',
          name: 'Inworld Catalog Voice',
          provider: 'inworld',
        },
      ],
    };
    const html = renderToStaticMarkup(<SettingsPanel {...props} />);

    expect(html).toContain('Persona Voice Defaults');
    expect(html).toContain('Fish Speech zero-shot / custom voice');
    expect(html).toContain('Inworld custom voice');
    expect(html).toContain('Provider Voice Catalog');
    expect(html).toContain('Fetch Fish Voices');
    expect(html).toContain('Fish Catalog Voice');
    expect(html).toContain('Inworld Catalog Voice');
    expect(html).toContain('Use In Voice Draft');
    expect(html).toContain('Provider voice id after creation');
    expect(html).toContain('Fish Speech and Inworld can create provider voices');
    expect(html).toContain('Save Current As Default');
  });

  it('keeps packaged Emotion Telemetry fields and adds raw model VAD debug', () => {
    const props = createProps('emotion-telemetry');
    props.emotionTelemetryEvents = [
      {
        affectArousal: 0.44,
        affectDominance: 0.12,
        affectLabel: 'warm',
        affectValence: 0.66,
        animationAccepted: true,
        animationId: 'wave',
        animationIndex: 0,
        animationName: 'Wave',
        animationReason: 'requested',
        appliedIntensity: 0.7,
        createdAt: 1710000000000,
        emotion: 'happy',
        expressionAccepted: true,
        expressionReason: 'applied',
        id: 'emotion-test',
        metadataArousal: 0.3,
        metadataDominance: 0.1,
        metadataValence: 0.8,
        requestedDurationMs: 1400,
        requestedExpression: 'happy',
        requestedIntensity: 0.6,
        resolvedExpressionNames: ['happy'],
      },
    ];

    const html = renderToStaticMarkup(<SettingsPanel {...props} />);

    expect(html).toContain('affect warm V 0.66 / A 0.44 / D 0.12');
    expect(html).toContain('face happy - happy');
    expect(html).toContain('Expression');
    expect(html).toContain('applied');
    expect(html).toContain('Peak');
    expect(html).toContain('requested 0.60');
    expect(html).toContain('Animation');
    expect(html).toContain('Wave');
    expect(html).toContain('Model VAD');
    expect(html).toContain('raw reply metadata');
    expect(html).toContain('Affect VAD');
    expect(html).toContain('model V 0.80 / A 0.30 / D 0.10');
  });

  it('keeps Fish TTS provider transports, benchmark, and timing controls mounted by default', () => {
    const html = renderToStaticMarkup(<SettingsPanel {...createProps('tts')} />);

    expect(html).toContain('Speech Output');
    expect(html).toContain('Fish Speech Live Bridge');
    expect(html).toContain('Fish Speech Live');
    expect(html).toContain('WebSocket realtime');
    expect(html).toContain('Timestamp SSE (HTTP)');
    expect(html).toContain('Condition Previous Chunks');
    expect(html).toContain('Fish Chunk');
    expect(html).toContain('Benchmark');
    expect(html).toContain('Copy Results');
  });

  it('keeps Inworld TTS provider transports, timestamps, and buffer controls mounted when selected', () => {
    const props = createProps('tts');
    props.aiSettings = {
      ...props.aiSettings,
      ttsProvider: 'inworld',
    };
    const html = renderToStaticMarkup(<SettingsPanel {...props} />);

    expect(html).toContain('Inworld Stream');
    expect(html).toContain('HTTP stream');
    expect(html).toContain('WebSocket stream');
    expect(html).toContain('Word timestamps');
    expect(html).toContain('Character timestamps');
    expect(html).toContain('Timestamp sync');
    expect(html).toContain('Buffer');
    expect(html).toContain('Max Buffer Delay');
    expect(html).toContain('Auto Mode');
  });
});
