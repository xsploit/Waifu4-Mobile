import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_PERSONA,
  DEFAULT_OPENROUTER_MODEL,
  STORAGE_KEYS,
  createDefaultAiSettings,
  createDefaultDiscordSettings,
  createDefaultPersonaVoiceBindings,
  createDefaultPersonas,
  createDefaultRelationshipMemory,
  createDefaultUiState,
  createDefaultTwitchSettings,
} from './defaults';
import {
  loadPersistedChatState,
  normalizePersistedChatStateSnapshot,
  savePersistedChatState,
} from './storage';
import { createDefaultSequencerSettings, createDefaultVisualSettings } from '../menu/defaults';
import type { PersistedChatState } from './types';

function createStorage() {
  const values = new Map<string, string>();
  return {
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe('chat settings persistence', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      localStorage: createStorage(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('round-trips the current operator settings surface', async () => {
    const personas = createDefaultPersonas();
    const aiSettings = {
      ...createDefaultAiSettings(),
      aiTransportMode: 'http-stream',
      embeddingLocalModel: 'onnx-community/bge-small-en-v1.5-ONNX',
      embeddingMode: 'auto',
      embeddingModel: 'qwen/qwen3-embedding-0.6b',
      fishSpeechChunkLength: 220,
      fishSpeechConditionOnPreviousChunks: false,
      fishSpeechLatency: 'normal',
      fishSpeechLiveChunkingStrategy: 'eager',
      fishSpeechModel: 's2.1-pro-free',
      fishSpeechTransport: 'timestamp-sse',
      fishSpeechFormat: 'wav',
      fishSpeechSampleRate: 48000,
      fishSpeechVoiceId: 'fish-voice',
      fishSpeechVoiceScope: 'mine',
      inworldBufferCharThreshold: 140,
      inworldDeliveryMode: 'CREATIVE',
      inworldAutoMode: false,
      inworldMaxBufferDelayMs: 700,
      inworldModelId: 'inworld-tts-2',
      inworldSampleRate: 44100,
      inworldTimestampTransportStrategy: 'ASYNC',
      inworldTimestampType: 'CHARACTER',
      inworldTransport: 'websocket',
      inworldVoiceId: 'inworld-voice',
      llmProvider: 'openrouter-responses',
      lipSyncGain: 1.35,
      lipSyncMode: 'direct',
      lipSyncSmoothing: 0.25,
      lipSyncVolumeInfluence: 0.65,
      maxToolRounds: 18,
      maxTokens: 420,
      memoryAgentIntervalMessages: 13,
      memoryAgentModel: DEFAULT_OPENROUTER_MODEL,
      model: DEFAULT_OPENROUTER_MODEL,
      openAiStateMode: 'stateless',
      openRouterAllowFallbacks: false,
      openRouterProviderSlugs: 'fireworks',
      openRouterRoutingMode: 'pinned',
      replyLength: 'yap',
      remoteTtsMode: 'sentence-chunks',
      runtimeSituation: 'Recording a live product demo.',
      temperature: 1.1,
      toolChoiceMode: 'auto',
      ttsAutoSpeak: false,
      ttsEnabled: true,
      ttsExpressionTagsEnabled: true,
      ttsExternalOutputDeviceId: 'virtual-cable-output',
      ttsOutputMode: 'local+discord',
      ttsPlaybackRate: 1.15,
      ttsProvider: 'fish-speech',
      ttsSimulatedStreaming: false,
      ttsVoice: 'custom-voice',
      ttsVolume: 1.4,
      vercelAllowFallbacks: false,
      vercelProviderSlugs: 'vertex,bedrock',
      vercelRoutingMode: 'cost',
    } satisfies PersistedChatState['aiSettings'];
    const sequencerSettings = {
      ...createDefaultSequencerSettings(),
      currentIndex: 2,
      duration: 7,
      loop: false,
      playing: false,
      shuffle: true,
      speed: 1.4,
    };
    const visualSettings = {
      ...createDefaultVisualSettings(),
      ambientLight: 0.7,
      armClipGuard: false,
      armClipGuardStrength: 0.25,
      armClipTorsoRadius: 0.31,
      autoBlink: false,
      autoGaze: false,
      blinkIntensity: 0.55,
      blinkInterval: 6.5,
      cameraFov: 41,
      cameraOffsetX: 0.4,
      cameraOffsetY: -0.2,
      cameraOffsetZ: 0.9,
      cameraRigMode: 'custom',
      cameraTargetOffsetX: -0.15,
      cameraTargetOffsetY: 0.2,
      cameraTargetOffsetZ: -0.35,
      cameraVerticalOffset: 0.18,
      cameraViewMode: 'full-body',
      colorCorr: true,
      colorPowB: 1.75,
      colorPowG: 1.35,
      colorPowR: 1.2,
      crossfadeDuration: 1.7,
      fillLight: 0.8,
      gazeAudienceYOffset: -0.08,
      gazeEyeMotion: 0.7,
      gazeHeadDrift: 0.4,
      gazeHeadFollow: 0.5,
      gazeIntensity: 0.6,
      gazePointerFollow: true,
      hemiLight: 0.65,
      keyLight: 1.1,
      modelPositionX: 0.2,
      modelPositionZ: -0.5,
      modelRotationX: 4,
      modelRotationY: -12,
      modelRotationZ: 2,
      modelScale: 1.15,
      modelVerticalOffset: -0.4,
      outline: false,
      outlineAlpha: 0.65,
      outlineColor: '#334455',
      outlineThickness: 0.008,
      mtoonGiEqualization: 0.6,
      mtoonRimColor: '#ddeeff',
      mtoonRimFresnel: 7.2,
      mtoonRimLift: 0.35,
      mtoonRimLightingMix: 0.45,
      mtoonShadeColor: '#445566',
      mtoonShadeShift: -0.2,
      mtoonToony: 0.75,
      mtoonTuning: true,
      pbrClearcoat: 0.4,
      pbrClearcoatRoughness: 0.25,
      pbrEnvMapIntensity: 1.2,
      pbrMetalness: 0.15,
      pbrRoughness: 0.38,
      pbrSpecularIntensity: 0.7,
      realisticMode: true,
      rimLight: 0.9,
      sceneBackgroundFilter: 'brightness(0.8) contrast(1.1)',
      sceneBackgroundImage: 'https://example.test/background.png',
      sceneBackgroundMode: 'transparent',
      sceneBackgroundOverlay: 'linear-gradient(#00000011, #00000033)',
      sceneChromaColor: '#11ee22',
      sceneExposure: 1.25,
      toonShaderPreset: 'custom',
    } satisfies PersistedChatState['visualSettings'];
    const state: PersistedChatState = {
      activePersonaId: DEFAULT_PERSONA.id,
      activeTab: 'background',
      aiSettings,
      chatHistory: [
        {
          content: 'hello',
          createdAt: Date.parse('2026-05-14T08:00:00.000Z'),
          id: 'message-1',
          role: 'user',
        },
      ],
      chatHistories: {},
      currentBundledModelId: 'hikari-chan',
      currentCustomVrmModelId: 'custom-vrm-test-avatar',
      emotionTelemetryEvents: [
        {
          affectArousal: 0.6,
          affectDominance: 0.2,
          affectLabel: 'bright',
          affectValence: 0.5,
          animationAccepted: true,
          animationId: 'sachi-happy',
          animationIndex: 2,
          animationName: 'Sachi Happy',
          animationReason: 'applied',
          appliedIntensity: 0.74,
          createdAt: 1778889700000,
          emotion: 'amused',
          expressionAccepted: true,
          expressionReason: 'applied',
          id: 'emotion-test-1',
          metadataArousal: 0.7,
          metadataDominance: 0.3,
          metadataValence: 0.6,
          requestedDurationMs: 1400,
          requestedExpression: 'happy',
          requestedIntensity: 0.72,
          resolvedExpressionNames: ['happy', 'relaxed'],
        },
      ],
      personaVoiceBindings: {
        [DEFAULT_PERSONA.id]: {
          customVoiceId: 'voice-lab-1',
          label: 'Custom Neuro',
          modelId: 'inworld-tts-2',
          provider: 'inworld',
          updatedAt: 1778889600000,
          voiceId: 'inworld-custom-neuro',
        },
      },
      personas,
      relationshipMemories: {
        'local:persona:neuro-sama': {
          ...createDefaultRelationshipMemory(),
          summary: 'local scope summary',
        },
      },
      relationshipMemory: {
        ...createDefaultRelationshipMemory(),
        facts: ['likes saved settings'],
        summary: 'global summary',
      },
      twitchChannel: '#CohhCarnage',
      twitchSettings: {
        ...createDefaultTwitchSettings(),
        aiEnabled: false,
        batchFastWaitMs: 50000,
        batchHighSize: 60,
        batchLowSize: 7,
        batchMaxSize: 150,
        batchMidSize: 25,
        batchWaitMs: 35000,
        commandsEnabled: false,
        contextLimit: 120,
        directChatterLimit: 12,
        localDisplayName: 'Subby',
        localTrustedControls: false,
        maxBatchMessages: 150,
        maxPendingJobs: 5,
        mentionRequiredUnderThreshold: false,
        replyGapMs: 1500,
        streamTranscriptionContextLimit: 6,
        streamTranscriptionEnabled: true,
        streamTranscriptionIntervalSeconds: 120,
        streamTranscriptionModel: 'openai/whisper-large-v3',
        streamTranscriptionSampleSeconds: 20,
        streamModeEnabled: true,
        streamVisionContextEnabled: true,
        streamVisionDetail: 'auto',
        streamVisionIntervalSeconds: 150,
        streamVisionMaxAgeSeconds: 240,
      },
      sequencerSettings,
      uiState: {
        ...createDefaultUiState(),
        chatDraft: 'draft',
        chatLogOpen: false,
        menuOpen: true,
      },
      visualSettings,
      voiceLabVoices: [
        {
          accent: 'neutral',
          ageVibe: 'young adult',
          assignedPersonaIds: [DEFAULT_PERSONA.id],
          createdAt: 1778889500000,
          description: 'Dry streamer voice.',
          emotionalTone: 'sarcastic',
          expressiveness: 0.72,
          id: 'voice-lab-1',
          modelId: 'inworld-tts-2',
          name: 'Custom Neuro',
          provider: 'inworld',
          providerVoiceId: 'inworld-custom-neuro',
          sample: {
            fileName: 'sample.wav',
            lastModified: 1778889400000,
            mimeType: 'audio/wav',
            size: 12345,
          },
          speakingStyle: 'fast dry banter',
          stability: 0.58,
          status: 'ready',
          updatedAt: 1778889600000,
        },
      ],
    };

    await savePersistedChatState(state);
    const loaded = await loadPersistedChatState();

    expect(loaded.aiSettings).toEqual(aiSettings);
    expect(loaded.visualSettings).toEqual(visualSettings);
    expect(loaded.sequencerSettings).toMatchObject({
      currentIndex: sequencerSettings.currentIndex,
      duration: sequencerSettings.duration,
      loop: sequencerSettings.loop,
      playing: sequencerSettings.playing,
      shuffle: sequencerSettings.shuffle,
      speed: sequencerSettings.speed,
    });
    expect(loaded.sequencerSettings.playlist).toHaveLength(sequencerSettings.playlist.length);
    expect(loaded.activeTab).toBe('background');
    expect(loaded.currentBundledModelId).toBe('hikari-chan');
    expect(loaded.currentCustomVrmModelId).toBe('custom-vrm-test-avatar');
    expect(loaded.emotionTelemetryEvents[0]).toMatchObject({
      animationName: 'Sachi Happy',
      emotion: 'amused',
      expressionReason: 'applied',
      resolvedExpressionNames: ['happy', 'relaxed'],
    });
    expect(loaded.twitchChannel).toBe('cohhcarnage');
    expect(loaded.twitchSettings).toEqual(state.twitchSettings);
    expect(loaded.uiState).toEqual({
      ...state.uiState,
      menuOpen: false,
    });
    expect(loaded.relationshipMemory.summary).toBe('global summary');
    expect(loaded.relationshipMemories['local:persona:neuro-sama']?.summary).toBe(
      'local scope summary',
    );
    expect(loaded.personaVoiceBindings[DEFAULT_PERSONA.id]).toMatchObject({
      provider: 'inworld',
      voiceId: 'inworld-custom-neuro',
    });
    expect(loaded.voiceLabVoices[0]).toMatchObject({
      id: 'voice-lab-1',
      provider: 'inworld',
      providerVoiceId: 'inworld-custom-neuro',
    });
  });

  it('defaults new installs to lean chat with tools opt-in and a 15-round agentic loop', async () => {
    const defaults = createDefaultAiSettings();

    expect(defaults.toolChoiceMode).toBe('off');
    expect(defaults.maxToolRounds).toBe(15);
    expect(defaults.embeddingMode).toBe('browser');
    expect(defaults.embeddingLocalModel).toBe('onnx-community/all-MiniLM-L6-v2-ONNX');
    expect(defaults.embeddingModel).toBe('openai/text-embedding-3-small');
  });

  it('ignores retired post-processing settings from older saved state', async () => {
    window.localStorage.setItem(
      STORAGE_KEYS.visualSettings,
      JSON.stringify({
        ...createDefaultVisualSettings(),
        bloom: true,
        chroma: true,
        glitch: true,
        grain: true,
        mtoonRimColor: 'not-a-color',
        outlineThickness: 100,
        sceneExposure: 1.3,
      }),
    );

    const loaded = await loadPersistedChatState();

    expect(loaded.visualSettings.sceneExposure).toBe(1.3);
    expect(loaded.visualSettings.outlineThickness).toBe(0.02);
    expect(loaded.visualSettings.mtoonRimColor).toBe('#ffffff');
    expect('bloom' in loaded.visualSettings).toBe(false);
    expect('glitch' in loaded.visualSettings).toBe(false);
  });

  it('normalizes legacy OpenRouter settings to app-owned state and OpenRouter model ids', async () => {
    window.localStorage.setItem(
      STORAGE_KEYS.aiSettings,
      JSON.stringify({
        ...createDefaultAiSettings(),
        aiTransportMode: 'server-default',
        llmProvider: 'openrouter-responses',
        memoryAgentModel: 'gpt-5.4-mini',
        model: 'gpt-5.4-nano',
        openAiStateMode: 'conversation',
      }),
    );

    const loaded = await loadPersistedChatState();

    expect(loaded.aiSettings).toMatchObject({
      aiTransportMode: 'http-stream',
      llmProvider: 'openrouter-responses',
      memoryAgentModel: DEFAULT_OPENROUTER_MODEL,
      model: DEFAULT_OPENROUTER_MODEL,
      openAiStateMode: 'stateless',
    });
  });

  it('normalizes stream transcription away from chat and premium models', async () => {
    window.localStorage.setItem(
      STORAGE_KEYS.twitchSettings,
      JSON.stringify({
        ...createDefaultTwitchSettings(),
        streamTranscriptionModel: 'o1-pro-2025-03-19',
      }),
    );

    const loaded = await loadPersistedChatState();

    expect(loaded.twitchSettings.streamTranscriptionModel).toBe('openai/whisper-large-v3');
  });

  it('defaults invalid TTS output modes and migrates legacy Discord-only routing', async () => {
    window.localStorage.setItem(
      STORAGE_KEYS.aiSettings,
      JSON.stringify({
        ...createDefaultAiSettings(),
        ttsOutputMode: 'speaker-and-Discord',
      }),
    );

    const loaded = await loadPersistedChatState();
    const snapshot = normalizePersistedChatStateSnapshot({
      aiSettings: {
        ...createDefaultAiSettings(),
        ttsOutputMode: 'discord-only',
      },
    });

    expect(loaded.aiSettings.ttsOutputMode).toBe('local-only');
    expect(snapshot.aiSettings.ttsOutputMode).toBe('local+discord');
  });

  it('migrates a stored Discord-only route to additive browser and Discord output', async () => {
    window.localStorage.setItem(
      STORAGE_KEYS.aiSettings,
      JSON.stringify({
        ...createDefaultAiSettings(),
        ttsOutputMode: 'discord-only',
      }),
    );

    const loaded = await loadPersistedChatState();

    expect(loaded.aiSettings.ttsOutputMode).toBe('local+discord');
  });

  it('persists Discord settings and clamps imported voice controls defensively', async () => {
    window.localStorage.setItem(
      STORAGE_KEYS.discordSettings,
      JSON.stringify({
        ...createDefaultDiscordSettings(),
        asrProvider: 'fish',
        botToken: `  ${'a'.repeat(520)}  `,
        connectOnStart: true,
        enabled: true,
        guildId: '123456789012345678',
        interruptionPolicy: 'barge-in',
        languageHint: '  en-US  ',
        transcriptionModel: 'openai/gpt-4o-mini-transcribe',
        trustedControllerUserIds: [
          '987654321098765432',
          '987654321098765432',
          'not-a-discord-id',
        ],
        vadEndSilenceMs: 99999,
        vadMaxSpeechMs: 100,
        vadMinSpeechMs: 2000,
        vadThreshold: 2,
        voiceChannelId: '234567890123456789',
      }),
    );

    const loaded = await loadPersistedChatState();

    expect(loaded.discordSettings).toMatchObject({
      asrProvider: 'fish',
      botToken: 'a'.repeat(512),
      connectOnStart: true,
      enabled: true,
      guildId: '123456789012345678',
      interruptionPolicy: 'barge-in',
      languageHint: 'en-US',
      transcriptionModel: 'fish-audio/asr',
      trustedControllerUserIds: ['987654321098765432'],
      vadEndSilenceMs: 5000,
      vadMaxSpeechMs: 2000,
      vadMinSpeechMs: 2000,
      vadThreshold: 0.5,
      voiceChannelId: '234567890123456789',
    });
  });

  it('migrates Discord voice transcripts into the durable local typed-chat history', async () => {
    const localKey = 'local:persona:hikari-chan';
    const discordKey = 'discord:guild:123:voice:456:persona:hikari-chan';
    window.localStorage.setItem(
      STORAGE_KEYS.chatHistories,
      JSON.stringify({
        [localKey]: [
          { content: 'typed first', createdAt: 10, id: 'local-1', role: 'user' },
        ],
        [discordKey]: [
          { content: 'spoken next', createdAt: 20, id: 'discord-1', role: 'user' },
          { content: 'voice reply', createdAt: 30, id: 'discord-2', role: 'assistant' },
        ],
      }),
    );

    const loaded = await loadPersistedChatState();

    expect(loaded.chatHistories[discordKey]).toBeUndefined();
    expect(loaded.chatHistories[localKey]?.map((message) => message.content)).toEqual([
      'typed first',
      'spoken next',
      'voice reply',
    ]);
  });

  it('keeps Discord settings in normalized import and export snapshots', async () => {
    const discordSettings = {
      ...createDefaultDiscordSettings(),
      asrProvider: 'fish' as const,
      botToken: 'local-discord-token',
      connectOnStart: true,
      enabled: true,
      guildId: '123456789012345678',
      interruptionPolicy: 'barge-in' as const,
      languageHint: 'en-US',
      listenEnabled: false,
      sendReplyText: false,
      speakEnabled: false,
      transcriptionModel: 'fish-audio/asr',
      trustedControllerUserIds: ['987654321098765432'],
      vadEndSilenceMs: 1200,
      vadMaxSpeechMs: 20000,
      vadMinSpeechMs: 400,
      vadThreshold: 0.08,
      voiceChannelId: '234567890123456789',
    };
    const snapshot = normalizePersistedChatStateSnapshot({
      activeTab: 'discord',
      discordSettings,
    });

    expect(snapshot.activeTab).toBe('discord');
    expect(snapshot.discordSettings).toEqual(discordSettings);

    await savePersistedChatState(snapshot);
    const loaded = await loadPersistedChatState();

    expect(loaded.discordSettings).toEqual(snapshot.discordSettings);
  });

  it('normalizes stale Fish model ids to the active Fish TTS model choice', async () => {
    window.localStorage.setItem(
      STORAGE_KEYS.aiSettings,
      JSON.stringify({
        ...createDefaultAiSettings(),
        fishSpeechModel: 'speech-1.6',
      }),
    );

    const loaded = await loadPersistedChatState();

    expect(loaded.aiSettings.fishSpeechModel).toBe('s2');
  });

  it('preserves Piper as the selected TTS provider across reloads and imports', async () => {
    const snapshot = normalizePersistedChatStateSnapshot({
      aiSettings: {
        ...createDefaultAiSettings(),
        ttsProvider: 'piper',
        ttsVoice: 'hikari-en-us',
      },
    });

    expect(snapshot.aiSettings.ttsProvider).toBe('piper');
    await savePersistedChatState(snapshot);
    const loaded = await loadPersistedChatState();
    expect(loaded.aiSettings).toMatchObject({
      ttsProvider: 'piper',
      ttsVoice: 'hikari-en-us',
    });
  });

  it('keeps legacy Fish s2-pro saves compatible with the frontend s2 value', async () => {
    window.localStorage.setItem(
      STORAGE_KEYS.aiSettings,
      JSON.stringify({
        ...createDefaultAiSettings(),
        fishSpeechModel: 's2-pro',
      }),
    );

    const loaded = await loadPersistedChatState();

    expect(loaded.aiSettings.fishSpeechModel).toBe('s2');
  });

  it('preserves Fish s2.1-pro-free saves', async () => {
    window.localStorage.setItem(
      STORAGE_KEYS.aiSettings,
      JSON.stringify({
        ...createDefaultAiSettings(),
        fishSpeechModel: 's2.1-pro-free',
      }),
    );

    const loaded = await loadPersistedChatState();

    expect(loaded.aiSettings.fishSpeechModel).toBe('s2.1-pro-free');
  });

  it('normalizes copied Fish Voice Lab model ids before persona binding apply can use them', async () => {
    window.localStorage.setItem(
      STORAGE_KEYS.personaVoiceBindings,
      JSON.stringify({
        [DEFAULT_PERSONA.id]: {
          label: 'Legacy Fish clone',
          modelId: 'fish-speech-s2',
          provider: 'fish-speech',
          updatedAt: 1778889600000,
          voiceId: 'fish-voice-id',
        },
      }),
    );
    window.localStorage.setItem(
      STORAGE_KEYS.voiceLabVoices,
      JSON.stringify([
        {
          accent: '',
          ageVibe: '',
          assignedPersonaIds: [DEFAULT_PERSONA.id],
          createdAt: 1778889500000,
          description: '',
          emotionalTone: '',
          expressiveness: 0.7,
          id: 'voice-lab-fish',
          modelId: 'fish-speech-s2',
          name: 'Legacy Fish clone',
          provider: 'fish-speech',
          providerVoiceId: 'fish-voice-id',
          sample: null,
          speakingStyle: '',
          stability: 0.6,
          status: 'ready',
          updatedAt: 1778889600000,
        },
      ]),
    );

    const loaded = await loadPersistedChatState();

    expect(loaded.personaVoiceBindings[DEFAULT_PERSONA.id]?.modelId).toBe('s2');
    expect(loaded.voiceLabVoices[0]?.modelId).toBe('s2');
  });

  it('persists normalized provider tuning with persona voice presets', async () => {
    window.localStorage.setItem(
      STORAGE_KEYS.personaVoiceBindings,
      JSON.stringify({
        [DEFAULT_PERSONA.id]: {
          label: 'Hikari Fish',
          modelId: 's2.1-pro-free',
          provider: 'fish-speech',
          tuning: {
            fishSpeechChunkLength: 9999,
            fishSpeechTransport: 'timestamp-sse',
            inworldTransport: 'websocket',
            lipSyncGain: 1.4,
            ttsOutputMode: 'discord-only',
          },
          updatedAt: 1778889600000,
          voiceId: 'fish-hikari',
        },
      }),
    );

    const loaded = await loadPersistedChatState();
    const binding = loaded.personaVoiceBindings[DEFAULT_PERSONA.id];

    expect(binding).toMatchObject({
      modelId: 's2.1-pro-free',
      provider: 'fish-speech',
      tuning: {
        fishSpeechChunkLength: 300,
        fishSpeechTransport: 'timestamp-sse',
        lipSyncGain: 1.4,
      },
      voiceId: 'fish-hikari',
    });
    expect(binding?.tuning).not.toHaveProperty('inworldTransport');
    expect(binding?.tuning).not.toHaveProperty('ttsOutputMode');
  });

  it('normalizes copied chat model ids away from provider embedding settings', async () => {
    window.localStorage.setItem(
      STORAGE_KEYS.aiSettings,
      JSON.stringify({
        ...createDefaultAiSettings(),
        embeddingMode: 'provider',
        embeddingModel: 'openai/gpt-4o-mini',
      }),
    );

    const loaded = await loadPersistedChatState();

    expect(loaded.aiSettings.embeddingModel).toBe('openai/text-embedding-3-small');
  });

  it('normalizes malformed save input before writing persistence entries', async () => {
    await expect(
      savePersistedChatState({
        activePersonaId: DEFAULT_PERSONA.id,
        personas: createDefaultPersonas(),
        relationshipMemory: createDefaultRelationshipMemory(),
      } as PersistedChatState),
    ).resolves.toBeUndefined();

    const loaded = await loadPersistedChatState();

    expect(loaded.personaVoiceBindings[DEFAULT_PERSONA.id]).toBeDefined();
    expect(loaded.twitchSettings.directChatterLimit).toBe(
      createDefaultTwitchSettings().directChatterLimit,
    );
  });

  it('keeps edited built-in personas instead of replacing them with defaults', async () => {
    const personas = createDefaultPersonas();
    const editedPersonas = personas.map((persona) =>
      persona.id === DEFAULT_PERSONA.id
        ? {
            ...persona,
            description: 'A saved front-end personality edit.',
            name: 'Neuro Saved',
            systemPrompt:
              'You are Neuro Saved, a locally edited persona that must survive reloads.',
            userNickname: 'Subby',
          }
        : persona,
    );
    const state: PersistedChatState = {
      activePersonaId: DEFAULT_PERSONA.id,
      activeTab: 'character',
      aiSettings: createDefaultAiSettings(),
      chatHistory: [],
      chatHistories: {},
      currentBundledModelId: '',
      currentCustomVrmModelId: '',
      emotionTelemetryEvents: [],
      personaVoiceBindings: createDefaultPersonaVoiceBindings(),
      personas: editedPersonas,
      relationshipMemories: {},
      relationshipMemory: createDefaultRelationshipMemory(),
      twitchChannel: 'subsect',
      twitchSettings: createDefaultTwitchSettings(),
      sequencerSettings: createDefaultSequencerSettings(),
      uiState: createDefaultUiState(),
      visualSettings: createDefaultVisualSettings(),
      voiceLabVoices: [],
    };

    await savePersistedChatState(state);
    const loaded = await loadPersistedChatState();
    const editedDefaultPersona = loaded.personas.find(
      (persona) => persona.id === DEFAULT_PERSONA.id,
    );

    expect(loaded.activePersonaId).toBe(DEFAULT_PERSONA.id);
    expect(editedDefaultPersona).toMatchObject({
      description: 'A saved front-end personality edit.',
      name: 'Neuro Saved',
      systemPrompt: 'You are Neuro Saved, a locally edited persona that must survive reloads.',
      userNickname: 'Subby',
    });
  });

  it('repairs the old emotion classification for bundled neutral idle clips', async () => {
    window.localStorage.setItem(
      STORAGE_KEYS.sequencerSettings,
      JSON.stringify({
        playlist: [
          {
            enabled: true,
            experimental: true,
            format: 'bvh',
            id: 'silly-neutral-idle',
            loopEligible: true,
            name: 'Silly Neutral Idle 1',
            purpose: 'emotion',
            tags: ['neutral', 'idle'],
            url: '/assets/animations/silly-bvh/neutral_idle.bvh',
          },
        ],
      }),
    );

    const loaded = await loadPersistedChatState();
    const neutralIdle = loaded.sequencerSettings.playlist.find(
      (entry) => entry.id === 'silly-neutral-idle',
    );

    expect(neutralIdle?.purpose).toBe('ambient');
    expect(neutralIdle?.enabled).toBe(true);
  });
});
