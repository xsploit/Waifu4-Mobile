import type {
  AiSettings,
  PersonaVoiceBinding,
  PersonaVoiceProvider,
  PersonaVoiceTuning,
} from './types';

const COMMON_TUNING_KEYS = [
  'remoteTtsMode',
  'ttsPlaybackRate',
  'ttsSimulatedStreaming',
  'ttsVolume',
  'lipSyncMode',
  'lipSyncSmoothing',
  'lipSyncGain',
  'lipSyncVolumeInfluence',
] as const satisfies ReadonlyArray<keyof PersonaVoiceTuning>;

const FISH_TUNING_KEYS = [
  'fishSpeechVoiceScope',
  'fishSpeechLatency',
  'fishSpeechTransport',
  'fishSpeechFormat',
  'fishSpeechSampleRate',
  'fishSpeechConditionOnPreviousChunks',
  'fishSpeechChunkLength',
  'fishSpeechLiveChunkingStrategy',
] as const satisfies ReadonlyArray<keyof PersonaVoiceTuning>;

const INWORLD_TUNING_KEYS = [
  'inworldTransport',
  'inworldSampleRate',
  'inworldTimestampType',
  'inworldTimestampTransportStrategy',
  'inworldDeliveryMode',
  'inworldBufferCharThreshold',
  'inworldMaxBufferDelayMs',
  'inworldAutoMode',
] as const satisfies ReadonlyArray<keyof PersonaVoiceTuning>;

function copyTuningKeys(
  target: PersonaVoiceTuning,
  settings: AiSettings,
  keys: ReadonlyArray<keyof PersonaVoiceTuning>,
) {
  const writableTarget = target as Record<string, unknown>;
  const source = settings as unknown as Record<string, unknown>;
  for (const key of keys) {
    writableTarget[key] = source[key];
  }
}

export function capturePersonaVoiceTuning(
  provider: PersonaVoiceProvider,
  settings: AiSettings,
): PersonaVoiceTuning {
  const tuning: PersonaVoiceTuning = {};
  copyTuningKeys(tuning, settings, COMMON_TUNING_KEYS);
  if (provider === 'fish-speech') {
    copyTuningKeys(tuning, settings, FISH_TUNING_KEYS);
  } else if (provider === 'inworld') {
    copyTuningKeys(tuning, settings, INWORLD_TUNING_KEYS);
  }
  return tuning;
}

export function createPersonaVoiceBindingFromSettings(
  settings: AiSettings,
  options: {
    label?: string;
    provider?: PersonaVoiceProvider;
    updatedAt?: number;
  } = {},
): PersonaVoiceBinding | null {
  const provider = options.provider ?? settings.ttsProvider;
  const updatedAt = options.updatedAt ?? Date.now();

  if (provider === 'piper') {
    const voiceId = settings.ttsVoice.trim();
    return voiceId
      ? {
          label: options.label?.trim() || voiceId,
          provider,
          tuning: capturePersonaVoiceTuning(provider, settings),
          updatedAt,
          voiceId,
        }
      : null;
  }

  if (provider === 'fish-speech') {
    const voiceId = settings.fishSpeechVoiceId.trim();
    return voiceId
      ? {
          label: options.label?.trim() || `Fish Speech ${voiceId}`,
          modelId: settings.fishSpeechModel,
          provider,
          tuning: capturePersonaVoiceTuning(provider, settings),
          updatedAt,
          voiceId,
        }
      : null;
  }

  const voiceId = settings.inworldVoiceId.trim();
  return voiceId
    ? {
        label: options.label?.trim() || `Inworld ${voiceId}`,
        modelId: settings.inworldModelId,
        provider,
        tuning: capturePersonaVoiceTuning(provider, settings),
        updatedAt,
        voiceId,
      }
    : null;
}

export function applyPersonaVoiceBindingToSettings(
  current: AiSettings,
  binding: PersonaVoiceBinding,
): AiSettings {
  const next: AiSettings = {
    ...current,
    ...(binding.tuning ?? {}),
    ttsProvider: binding.provider,
  };

  if (binding.provider === 'piper') {
    next.ttsVoice = binding.voiceId;
  } else if (binding.provider === 'fish-speech') {
    next.fishSpeechModel = binding.modelId || current.fishSpeechModel;
    next.fishSpeechVoiceId = binding.voiceId;
  } else {
    next.inworldModelId = binding.modelId || current.inworldModelId;
    next.inworldVoiceId = binding.voiceId;
  }

  for (const key of Object.keys(next) as Array<keyof AiSettings>) {
    if (!Object.is(next[key], current[key])) {
      return next;
    }
  }
  return current;
}
