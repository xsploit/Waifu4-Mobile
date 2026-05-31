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
