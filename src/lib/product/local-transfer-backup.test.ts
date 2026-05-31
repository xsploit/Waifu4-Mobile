import { describe, expect, it } from 'vitest';
import {
  createDefaultAiSettings,
  createDefaultPersonaVoiceBindings,
  createDefaultRelationshipMemory,
  createDefaultTwitchSettings,
} from '../chat/defaults';
import type { PersistedChatState } from '../chat/types';
import { createDefaultSequencerSettings, createDefaultVisualSettings } from '../menu/defaults';
import {
  base64ToBlob,
  blobToBase64,
  createLocalTransferBackup,
  formatLocalTransferBackupError,
  parseLocalTransferBackup,
  serializeLocalTransferBackup,
} from './local-transfer-backup';

function createState(): PersistedChatState {
  return {
    activePersonaId: 'hikari-chan',
    activeTab: 'background',
    aiSettings: createDefaultAiSettings(),
    chatHistory: [],
    chatHistories: {},
    currentBundledModelId: '',
    currentCustomVrmModelId: 'custom-vrm-test',
    emotionTelemetryEvents: [
      {
        affectArousal: 0.4,
        affectDominance: 0.1,
        affectLabel: 'steady',
        affectValence: 0.2,
        animationAccepted: true,
        animationId: 'sachi-happy',
        animationIndex: 1,
        animationName: 'Sachi Happy',
        animationReason: 'applied',
        appliedIntensity: 0.67,
        createdAt: 1778889700000,
        emotion: 'amused',
        expressionAccepted: true,
        expressionReason: 'applied',
        id: 'emotion-transfer-1',
        metadataArousal: 0.35,
        metadataDominance: 0.2,
        metadataValence: 0.4,
        requestedDurationMs: 1200,
        requestedExpression: 'happy',
        requestedIntensity: 0.67,
        resolvedExpressionNames: ['happy', 'relaxed'],
      },
    ],
    personaVoiceBindings: createDefaultPersonaVoiceBindings(),
    personas: [
      {
        id: 'hikari-chan',
        name: 'Hikari',
        description: '',
        systemPrompt: 'test persona',
        userNickname: '',
      },
    ],
    relationshipMemories: {},
    relationshipMemory: createDefaultRelationshipMemory(),
    sequencerSettings: {
      ...createDefaultSequencerSettings(),
      duration: 9,
      speed: 1.25,
    },
    twitchChannel: 'subsect',
    twitchSettings: createDefaultTwitchSettings(),
    uiState: {
      chatDraft: '',
      chatLogOpen: true,
      menuOpen: false,
    },
    visualSettings: {
      ...createDefaultVisualSettings(),
      sceneBackgroundMode: 'transparent',
      sceneExposure: 1.2,
    },
    voiceLabVoices: [],
  };
}

describe('local transfer backup', () => {
  it('round-trips settings, provider secrets, and saved VRM metadata', () => {
    const backup = createLocalTransferBackup({
      exportedAt: '2026-05-17T12:00:00.000Z',
      providerSecrets: [
        {
          id: 'old:openai:openai.apiKey',
          workspaceId: 'old',
          provider: 'openai',
          keyName: 'openai.apiKey',
          mode: 'local-indexeddb',
          redactedLabel: 'sk-tes...1234',
          createdAt: '2026-05-17T11:00:00.000Z',
          updatedAt: '2026-05-17T11:00:00.000Z',
          secret: 'sk-test-1234',
        },
      ],
      savedVrmModels: [
        {
          id: 'custom-vrm-test',
          name: 'Hikari Custom',
          originalFileName: 'hikari.vrm',
          size: 3,
          type: 'model/vrm',
          createdAt: 1,
          updatedAt: 2,
          dataBase64: 'AQID',
        },
      ],
      state: createState(),
    });

    const parsed = parseLocalTransferBackup(serializeLocalTransferBackup(backup));

    expect(parsed.state.activePersonaId).toBe('hikari-chan');
    expect(parsed.state.activeTab).toBe('background');
    expect(parsed.state.sequencerSettings.duration).toBe(9);
    expect(parsed.state.sequencerSettings.speed).toBe(1.25);
    expect(parsed.state.emotionTelemetryEvents[0]?.emotion).toBe('amused');
    expect(parsed.state.visualSettings.sceneBackgroundMode).toBe('transparent');
    expect(parsed.state.visualSettings.sceneExposure).toBe(1.2);
    expect(parsed.providerSecrets[0]?.secret).toBe('sk-test-1234');
    expect(parsed.savedVrmModels[0]?.id).toBe('custom-vrm-test');
    expect(parsed.includes.providerSecrets).toBe(true);
    expect(parsed.includes.savedVrmModels).toBe(true);
  });

  it('rejects unrelated JSON files', () => {
    expect(() => parseLocalTransferBackup('{"app":"other"}')).toThrow(
      'Choose a Web Waifu 4 local transfer backup JSON file.',
    );
  });

  it('derives include flags for legacy backups missing the includes block', () => {
    const backup = createLocalTransferBackup({
      exportedAt: '2026-05-17T12:00:00.000Z',
      providerSecrets: [
        {
          id: 'old:openrouter:openrouter.apiKey',
          workspaceId: 'old',
          provider: 'openrouter',
          keyName: 'openrouter.apiKey',
          mode: 'local-indexeddb',
          redactedLabel: 'sk-or...1234',
          createdAt: '2026-05-17T11:00:00.000Z',
          updatedAt: '2026-05-17T11:00:00.000Z',
          secret: 'sk-or-test-1234',
        },
      ],
      savedVrmModels: [
        {
          id: 'custom-vrm-test',
          name: 'Hikari Custom',
          originalFileName: 'hikari.vrm',
          size: 3,
          type: 'model/vrm',
          createdAt: 1,
          updatedAt: 2,
          dataBase64: 'AQID',
        },
      ],
      state: {
        ...createState(),
        chatHistory: [
          {
            content: 'hello',
            createdAt: 1,
            id: 'msg-1',
            role: 'user',
          },
        ],
        relationshipMemory: {
          ...createDefaultRelationshipMemory(),
          facts: ['likes durable imports'],
        },
      },
    });
    const legacyBackup = { ...backup, app: 'yourwifey-local' };
    delete (legacyBackup as Partial<typeof backup>).includes;

    const parsed = parseLocalTransferBackup(JSON.stringify(legacyBackup));

    expect(parsed.app).toBe('web-waifu-4-local');
    expect(parsed.includes).toEqual({
      chatHistory: true,
      providerSecrets: true,
      relationshipMemory: true,
      savedVrmModels: true,
    });
    expect(parsed.providerSecrets[0]?.secret).toBe('sk-or-test-1234');
    expect(parsed.savedVrmModels[0]?.id).toBe('custom-vrm-test');
  });

  it('accepts the redacted real local-backup shape with global chat and scoped relationship memory', () => {
    const backup = {
      app: 'web-waifu-4-local',
      exportedAt: '2026-05-30T03:03:43.560Z',
      formatVersion: 1,
      includes: {
        chatHistory: true,
        providerSecrets: true,
        relationshipMemory: true,
        savedVrmModels: true,
      },
      kind: 'local-transfer-backup',
      providerSecrets: [
        {
          id: 'local-browser:custom:aiGateway.apiKey',
          workspaceId: 'local-browser',
          provider: 'custom',
          keyName: 'aiGateway.apiKey',
          mode: 'local-indexeddb',
          redactedLabel: 'vgw...test',
          createdAt: '2026-05-30T00:00:00.000Z',
          updatedAt: '2026-05-30T00:00:00.000Z',
          secret: 'redacted-ai-gateway-key',
        },
        {
          id: 'local-browser:fish_speech:fishSpeech.apiKey',
          workspaceId: 'local-browser',
          provider: 'fish_speech',
          keyName: 'fishSpeech.apiKey',
          mode: 'local-indexeddb',
          redactedLabel: 'fish...test',
          createdAt: '2026-05-30T00:00:00.000Z',
          updatedAt: '2026-05-30T00:00:00.000Z',
          secret: 'redacted-fish-key',
        },
        {
          id: 'local-browser:inworld:inworld.apiKey',
          workspaceId: 'local-browser',
          provider: 'inworld',
          keyName: 'inworld.apiKey',
          mode: 'local-indexeddb',
          redactedLabel: 'iw...test',
          createdAt: '2026-05-30T00:00:00.000Z',
          updatedAt: '2026-05-30T00:00:00.000Z',
          secret: 'redacted-inworld-key',
        },
        {
          id: 'local-browser:openai:openai.apiKey',
          workspaceId: 'local-browser',
          provider: 'openai',
          keyName: 'openai.apiKey',
          mode: 'local-indexeddb',
          redactedLabel: 'sk...test',
          createdAt: '2026-05-30T00:00:00.000Z',
          updatedAt: '2026-05-30T00:00:00.000Z',
          secret: 'redacted-openai-key',
        },
        {
          id: 'local-browser:openrouter:openrouter.apiKey',
          workspaceId: 'local-browser',
          provider: 'openrouter',
          keyName: 'openrouter.apiKey',
          mode: 'local-indexeddb',
          redactedLabel: 'sk-or...test',
          createdAt: '2026-05-30T00:00:00.000Z',
          updatedAt: '2026-05-30T00:00:00.000Z',
          secret: 'redacted-openrouter-key',
        },
        {
          id: 'local-browser:tavily:tavily.apiKey',
          workspaceId: 'local-browser',
          provider: 'tavily',
          keyName: 'tavily.apiKey',
          mode: 'local-indexeddb',
          redactedLabel: 'tvly...test',
          createdAt: '2026-05-30T00:00:00.000Z',
          updatedAt: '2026-05-30T00:00:00.000Z',
          secret: 'redacted-tavily-key',
        },
      ],
      savedVrmModels: Array.from({ length: 4 }, (_, index) => ({
        id: `custom-vrm-${index + 1}`,
        name: `Saved VRM ${index + 1}`,
        originalFileName: `saved-${index + 1}.vrm`,
        size: 3,
        type: 'model/vrm',
        createdAt: index + 1,
        updatedAt: index + 1,
        dataBase64: 'AQID',
      })),
      state: {
        ...createState(),
        activePersonaId: 'hikari-chan',
        activeTab: 'account',
        chatHistory: Array.from({ length: 36 }, (_, index) => ({
          content: index % 2 === 0 ? 'hello' : 'hi there',
          createdAt: index + 1,
          id: `msg-${index + 1}`,
          role: index % 2 === 0 ? 'user' : 'assistant',
        })),
        chatHistories: {},
        relationshipMemories: {
          'local:hikari-chan': {
            ...createDefaultRelationshipMemory(),
            facts: ['likes fast TTS'],
            summary: 'Hikari scoped memory',
          },
          'local:neuro-sama': {
            ...createDefaultRelationshipMemory(),
            facts: ['likes testing'],
            summary: 'Neuro scoped memory',
          },
          'local:default-waifu': {
            ...createDefaultRelationshipMemory(),
            facts: ['likes imports'],
            summary: 'Riko scoped memory',
          },
        },
        personaVoiceBindings: createDefaultPersonaVoiceBindings(1778889700000),
        voiceLabVoices: [
          {
            accent: '',
            ageVibe: '',
            assignedPersonaIds: ['hikari-chan'],
            createdAt: 1778889700000,
            description: 'Redacted provider voice',
            emotionalTone: '',
            expressiveness: 0.65,
            id: 'voice-lab-redacted',
            modelId: 's2',
            name: 'Redacted Voice',
            provider: 'fish-speech',
            providerVoiceId: 'redacted-provider-voice',
            sample: null,
            speakingStyle: '',
            stability: 0.5,
            status: 'ready',
            updatedAt: 1778889700000,
          },
        ],
      },
    };

    const parsed = parseLocalTransferBackup(JSON.stringify(backup));

    expect(parsed.state.activePersonaId).toBe('hikari-chan');
    expect(parsed.state.activeTab).toBe('account');
    expect(parsed.providerSecrets.map((secret) => secret.keyName).sort()).toEqual([
      'aiGateway.apiKey',
      'fishSpeech.apiKey',
      'inworld.apiKey',
      'openai.apiKey',
      'openrouter.apiKey',
      'tavily.apiKey',
    ]);
    expect(parsed.savedVrmModels).toHaveLength(4);
    expect(parsed.state.chatHistory).toHaveLength(36);
    expect(Object.keys(parsed.state.chatHistories)).toHaveLength(0);
    expect(Object.keys(parsed.state.relationshipMemories)).toHaveLength(3);
    expect(Object.keys(parsed.state.personaVoiceBindings)).toHaveLength(3);
    expect(parsed.state.voiceLabVoices).toHaveLength(1);
    expect(parsed.includes).toEqual({
      chatHistory: true,
      providerSecrets: true,
      relationshipMemory: true,
      savedVrmModels: true,
    });
  });

  it('formats import/export failures for account tab status text', () => {
    expect(formatLocalTransferBackupError('import', new Error('bad file'))).toBe(
      'Local transfer backup import failed: bad file',
    );
    expect(formatLocalTransferBackupError('export', '')).toBe(
      'Local transfer backup export failed: unknown error',
    );
  });

  it('converts VRM blobs to backup-safe base64 and back', async () => {
    const original = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'model/vrm' });
    const encoded = await blobToBase64(original);
    const restored = base64ToBlob(encoded, 'model/vrm');

    expect(Array.from(new Uint8Array(await restored.arrayBuffer()))).toEqual([1, 2, 3, 4]);
    expect(restored.type).toBe('model/vrm');
  });
});
