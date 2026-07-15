import { describe, expect, it } from 'vitest';
import { createDefaultAiSettings } from './defaults';
import {
  applyPersonaVoiceBindingToSettings,
  capturePersonaVoiceTuning,
  createPersonaVoiceBindingFromSettings,
} from './persona-voice';

describe('persona voice presets', () => {
  it('captures Fish identity and tuning without capturing session output routing', () => {
    const settings = {
      ...createDefaultAiSettings(),
      fishSpeechChunkLength: 220,
      fishSpeechModel: 's2.1-pro-free',
      fishSpeechTransport: 'timestamp-sse' as const,
      fishSpeechVoiceId: 'fish-hikari',
      lipSyncMode: 'direct' as const,
      ttsOutputMode: 'local+discord' as const,
      ttsPlaybackRate: 1.12,
      ttsProvider: 'fish-speech' as const,
    };

    const binding = createPersonaVoiceBindingFromSettings(settings, {
      label: 'Hikari Fish',
      updatedAt: 123,
    });

    expect(binding).toMatchObject({
      label: 'Hikari Fish',
      modelId: 's2.1-pro-free',
      provider: 'fish-speech',
      updatedAt: 123,
      voiceId: 'fish-hikari',
      tuning: {
        fishSpeechChunkLength: 220,
        fishSpeechTransport: 'timestamp-sse',
        lipSyncMode: 'direct',
        ttsPlaybackRate: 1.12,
      },
    });
    expect(binding?.tuning).not.toHaveProperty('inworldTransport');
    expect(binding?.tuning).not.toHaveProperty('ttsOutputMode');
  });

  it('applies the complete preset while preserving the active output route', () => {
    const current = {
      ...createDefaultAiSettings(),
      ttsOutputMode: 'discord-only' as const,
      ttsProvider: 'inworld' as const,
    };
    const next = applyPersonaVoiceBindingToSettings(current, {
      label: 'Hikari Fish',
      modelId: 's2.1-pro-free',
      provider: 'fish-speech',
      tuning: {
        fishSpeechTransport: 'timestamp-sse',
        lipSyncGain: 1.4,
        remoteTtsMode: 'early-chunks',
      },
      updatedAt: 123,
      voiceId: 'fish-hikari',
    });

    expect(next).toMatchObject({
      fishSpeechModel: 's2.1-pro-free',
      fishSpeechTransport: 'timestamp-sse',
      fishSpeechVoiceId: 'fish-hikari',
      lipSyncGain: 1.4,
      remoteTtsMode: 'early-chunks',
      ttsOutputMode: 'discord-only',
      ttsProvider: 'fish-speech',
    });
  });

  it('returns the existing settings object when a preset changes nothing', () => {
    const current = {
      ...createDefaultAiSettings(),
      fishSpeechVoiceId: 'fish-hikari',
    };
    const binding = createPersonaVoiceBindingFromSettings(current, { updatedAt: 123 });
    expect(binding).not.toBeNull();

    const next = applyPersonaVoiceBindingToSettings(current, binding!);

    expect(next).toBe(current);
  });

  it('captures only the selected provider tuning', () => {
    const settings = createDefaultAiSettings();

    expect(capturePersonaVoiceTuning('piper', settings)).not.toHaveProperty(
      'fishSpeechTransport',
    );
    expect(capturePersonaVoiceTuning('inworld', settings)).toHaveProperty(
      'inworldTransport',
    );
  });
});
