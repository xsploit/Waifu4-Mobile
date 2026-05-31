import { describe, expect, it } from 'vitest';
import {
  BYOK_STACK_DECISION,
  classifyLocalSetting,
  createProviderSecretDescriptor,
  isValidTwitchChannelName,
  redactProviderSecret,
} from './byok';

describe('local product contracts', () => {
  it('locks the fork to local storage without auth, payments, or hosted database state', () => {
    expect(BYOK_STACK_DECISION).toEqual({
      authProvider: 'local',
      databaseProvider: 'indexeddb',
      assetStorageProvider: 'indexeddb',
      defaultStorageMode: 'local-only',
      defaultProviderKeyMode: 'local-indexeddb',
      localOnlySupported: true,
      paymentsInScope: false,
    });
  });

  it('keeps provider keys classified as local secrets', () => {
    expect(classifyLocalSetting('openai.apiKey')).toBe('local-secret');
    expect(classifyLocalSetting('openrouter.apiKey')).toBe('local-secret');
    expect(classifyLocalSetting('aiGateway.apiKey')).toBe('local-secret');
    expect(classifyLocalSetting('fishSpeech.apiKey')).toBe('local-secret');
    expect(classifyLocalSetting('inworld.apiKey')).toBe('local-secret');
    expect(classifyLocalSetting('tavily.apiKey')).toBe('local-secret');
    expect(classifyLocalSetting('visualSettings')).toBe('public-overlay');
    expect(classifyLocalSetting('aiSettings.model')).toBe('local-setting');
    expect(classifyLocalSetting('overlay.signingSecret')).toBe('server-only');
  });

  it('redacts provider secrets and stores only descriptors', () => {
    expect(redactProviderSecret('sk-proj-1234567890')).toBe('sk-pro...7890');
    expect(
      createProviderSecretDescriptor({
        id: 'secret_1',
        workspaceId: 'local-browser',
        provider: 'openai',
        keyName: ' openai.apiKey ',
        mode: 'local-indexeddb',
        secretPreview: 'sk-proj-1234567890',
        createdAt: '2026-05-15T12:00:00.000Z',
      }),
    ).toMatchObject({
      keyName: 'openai.apiKey',
      redactedLabel: 'sk-pro...7890',
    });
  });

  it('validates Twitch channel names for local scene settings', () => {
    expect(isValidTwitchChannelName('#subsect')).toBe(true);
    expect(isValidTwitchChannelName('bad channel')).toBe(false);
  });
});
