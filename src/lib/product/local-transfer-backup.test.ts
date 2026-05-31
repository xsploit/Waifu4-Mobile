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

  it('converts VRM blobs to backup-safe base64 and back', async () => {
    const original = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'model/vrm' });
    const encoded = await blobToBase64(original);
    const restored = base64ToBlob(encoded, 'model/vrm');

    expect(Array.from(new Uint8Array(await restored.arrayBuffer()))).toEqual([1, 2, 3, 4]);
    expect(restored.type).toBe('model/vrm');
  });
});
