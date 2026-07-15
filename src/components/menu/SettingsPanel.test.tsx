import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { SettingsTabId } from '../../lib/menu/types';
import {
  DEFAULT_PERSONA,
  createDefaultAiSettings,
  createDefaultDiscordSettings,
  createDefaultPersonaVoiceBindings,
  createDefaultPersonas,
  createDefaultRelationshipMemory,
  createDefaultTwitchSettings,
} from '../../lib/chat/defaults';
import { createDefaultSequencerSettings, createDefaultVisualSettings } from '../../lib/menu/defaults';
import { SettingsPanel } from './SettingsPanel';

type SettingsPanelProps = ComponentProps<typeof SettingsPanel>;

const noop = () => {};

function createProps(activeTab: SettingsTabId): SettingsPanelProps {
  const personas = createDefaultPersonas();
  return {
    activeMemoryScopeKey: 'local:persona:test',
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
    onClearRuntimeErrors: noop,
    onClose: noop,
    onCreateVoiceLabProviderVoice: async () => ({
      id: 'created-voice',
      name: 'Created Voice',
      provider: 'fish-speech',
      providerVoiceId: 'provider-voice',
    }),
    onDesignVoiceLabProviderVoice: async () => ({
      candidates: [],
      provider: 'fish-speech',
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
    onPublishDesignedVoiceLabProviderVoice: async () => ({
      id: 'published-voice',
      name: 'Published Voice',
      provider: 'inworld',
      providerVoiceId: 'provider-voice',
    }),
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
    runtimeErrors: [],
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
    vercelProviderSlugs: [],
    vercelProviderEndpoints: [],
    vercelProvidersError: null,
    vercelProvidersLoading: false,
    vrmTelemetry: null,
  };
}

describe('SettingsPanel tab smoke', () => {
  const tabMarkers: Array<[SettingsTabId, string]> = [
    ['account', 'Provider Access'],
    ['vrm', 'Avatar Source'],
    ['background', 'Scene Background'],
    ['anim', 'Now Playing'],
    ['emotion-telemetry', 'Emotion Telemetry'],
    ['character', 'Default Character'],
    ['voice-lab', 'Persona Voice Defaults'],
    ['ai', 'LLM Provider'],
    ['twitch', 'Twitch Connection'],
    ['discord', 'Discord Voice Bridge'],
    ['context', 'G.R.I.L.L.O.'],
    ['tts', 'Speech Output'],
  ];

  it('renders character voice preset controls in the Character tab', () => {
    const markup = renderToStaticMarkup(<SettingsPanel {...createProps('character')} />);

    expect(markup).toContain('Character Voice');
    expect(markup).toContain('Use Current TTS Setup');
    expect(markup).toContain('Piper Local');
    expect(markup).toContain('Fish Speech');
    expect(markup).toContain('Inworld');
  });

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
      toolChoiceMode: 'auto',
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

  it('keeps runtime failures in the AI diagnostics surface', () => {
    const props = createProps('ai');
    props.runtimeErrors = [{
      createdAt: 1,
      id: 'runtime-error-1',
      message: 'Provider request timed out.',
      scope: 'Chat',
    }];

    const html = renderToStaticMarkup(<SettingsPanel {...props} />);

    expect(html).toContain('Chat Runtime');
    expect(html).toContain('Provider request timed out.');
    expect(html).toContain('Clear Runtime Errors');
  });

  it('shows configured AI truth instead of fabricated health defaults', () => {
    const props = createProps('ai');
    props.aiSettings = {
      ...props.aiSettings,
      llmProvider: 'vercel-gateway',
      model: 'deepseek/deepseek-v4-pro',
      toolChoiceMode: 'auto',
    };
    props.aiProxyHealth = null;

    const html = renderToStaticMarkup(<SettingsPanel {...props} />);

    expect(html).toContain('vercel-gateway');
    expect(html).toContain('Streaming text + hidden emotion metadata');
    expect(html).toContain('live chat uses streaming text metadata');
    expect(html).toContain('AI SDK HTTP stream');
    expect(html).toContain('enabled; provider usage not reported yet');
    expect(html).toContain('availability reported after the next reply');
    expect(html).not.toContain('Provider: <strong>unknown</strong>');
    expect(html).not.toContain('Active state:');
  });

  it('renders Vercel provider routing and pinned provider controls', () => {
    const props = createProps('ai');
    props.aiSettings = {
      ...props.aiSettings,
      llmProvider: 'vercel-gateway',
      vercelRoutingMode: 'pinned',
      vercelProviderSlugs: 'baseten,deepseek',
    };
    props.vercelProviderSlugs = ['baseten', 'deepseek'];
    props.vercelProviderEndpoints = [
      {
        contextLength: 1048600,
        latencyP50Ms: 1219,
        latencyP95Ms: 2754,
        providerName: 'baseten',
        status: 0,
        supportedParameters: ['tools', 'tool_choice', 'reasoning'],
        supportsImplicitCaching: true,
        uptimeLastHour: 100,
      },
      {
        contextLength: 1000000,
        latencyP50Ms: 1813,
        providerName: 'deepseek',
        status: 0,
        supportedParameters: ['tools', 'tool_choice'],
        supportsImplicitCaching: true,
      },
    ];

    const html = renderToStaticMarkup(<SettingsPanel {...props} />);

    expect(html).toContain('Vercel Provider Routing');
    expect(html).toContain('Pinned provider order');
    expect(html).toContain('baseten,deepseek');
    expect(html).toContain('Allow other providers after this order');
    expect(html).toContain("selected model&#x27;s live Vercel endpoint catalog");
    expect(html).toContain('baseten [tools, reasoning, cache, 1M ctx, 1219ms]');
  });

  it('keeps toon shader presets mounted on the avatar tab', () => {
    const html = renderToStaticMarkup(<SettingsPanel {...createProps('vrm')} />);

    expect(html).toContain('Model Shading');
    expect(html).toContain('Original VRM');
    expect(html).toContain('Soft MToon');
    expect(html).toContain('Hard Anime');
    expect(html).toContain('Nilo / URP-ish');
    expect(html).toContain('Pastel VTuber');
    expect(html).toContain('High Contrast Cel');
    expect(html).toContain('Presets retune MToon');
  });

  it('keeps animation catalog curator controls mounted', () => {
    const html = renderToStaticMarkup(<SettingsPanel {...createProps('anim')} />);

    expect(html).toContain('Filter');
    expect(html).toContain('Copy Catalog JSON');
    expect(html).toContain('AI-visible');
    expect(html).toContain('idle');
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
    expect(html).toContain('OpenRouter ASR uses the OpenRouter key in Keys &amp; Data');
    expect(html).toContain('Attach Twitch stream frame to vision models');
    expect(html).toContain('Captures one JPEG frame from the Twitch stream');
  });

  it('keeps Discord voice, provider, VAD, and controller controls mounted', () => {
    const props = createProps('discord');
    props.discordConnectionStatus = 'connected';
    props.discordSettings = {
      ...createDefaultDiscordSettings(),
      asrProvider: 'vercel',
      botToken: 'discord-test-token',
      guildId: '123456789012345678',
      transcriptionModel: 'openai/whisper-1',
      trustedControllerUserIds: ['987654321098765432'],
      voiceChannelId: '234567890123456789',
    };
    props.discordRuntimeStatus = {
      asrProvider: 'fish',
      detail: 'Fish Speech transcription failed with HTTP 400.',
      status: 'error',
      transcriptionModel: 'fish-audio/asr',
    };
    props.discordStatusDetail = 'Connected to a test voice channel.';
    props.onConnectDiscord = noop;
    props.onDisconnectDiscord = noop;
    props.setDiscordSettings = noop;

    const html = renderToStaticMarkup(<SettingsPanel {...props} />);

    expect(html).toContain('Discord Voice Bridge');
    expect(html).toContain('Connected to a test voice channel.');
    expect(html).toContain('Paste Discord bot token');
    expect(html).toContain('ASR provider');
    expect(html).toContain('Vercel AI Gateway');
    expect(html).toContain('VAD threshold');
    expect(html).toContain('Trusted controller user IDs');
    expect(html).toContain('987654321098765432');
    expect(html).toContain('Live ASR:');
    expect(html).toContain('fish / fish-audio/asr');
    expect(html).toContain('Saved ASR settings differ from the live bridge');
    expect(html).toContain('Reconnect / Apply');
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

  it('renders object-shaped diary snapshots as readable text', () => {
    const props = createProps('context');
    props.relationshipMemory = {
      ...props.relationshipMemory,
      diaryEntry: {
        personal_thought: 'This pattern should affect future replies.',
        summary: 'Subsect iterated until the welcome message was clean.',
      } as unknown as string,
    };

    const html = renderToStaticMarkup(<SettingsPanel {...props} />);

    expect(html).toContain('Subsect iterated until the welcome message was clean.');
    expect(html).toContain('This pattern should affect future replies.');
    expect(html).not.toContain('[object Object]');
  });

  it('does not render stale object-object diary snapshots', () => {
    const props = createProps('context');
    props.relationshipMemory = {
      ...props.relationshipMemory,
      diaryEntry: '[object Object]',
    };

    const html = renderToStaticMarkup(<SettingsPanel {...props} />);

    expect(html).toContain('No diary entry written yet.');
    expect(html).not.toContain('[object Object]');
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
    expect(html).toContain('Voice Design');
    expect(html).toContain('Design Voice');
    expect(html).toContain('Warm expressive streamer voice');
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
    expect(html).toContain('Output Mode');
    expect(html).toContain('Browser / Electron + Discord (collab)');
    expect(html).toContain('Browser / Electron + external device');
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
