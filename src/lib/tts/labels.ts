import type { AiSettings } from '../chat/types';
import type { RemoteTtsProvider } from './remote';

export function getRemoteTtsProviderLabel(provider: RemoteTtsProvider) {
  switch (provider) {
    case 'fish-speech':
      return 'Fish Speech';
    case 'inworld':
      return 'Inworld';
  }
}

export function getTtsProviderLabel(provider: AiSettings['ttsProvider']) {
  switch (provider) {
    case 'fish-speech':
      return 'Fish Speech Live';
    case 'inworld':
      return 'Inworld Stream';
    case 'piper':
      return 'Piper Web';
  }
}

export type RemoteVoiceStatusInput = {
  error: string | null;
  listedVoiceCount: number;
  loading: boolean;
  provider: RemoteTtsProvider;
  selectedVoiceId: string;
  selectedVoiceListed: boolean;
};

export function getRemoteVoiceStatus({
  error,
  listedVoiceCount,
  loading,
  provider,
  selectedVoiceId,
  selectedVoiceListed,
}: RemoteVoiceStatusInput) {
  const providerLabel = getRemoteTtsProviderLabel(provider);
  if (loading) {
    return `Voice list: fetching ${providerLabel} voices.`;
  }
  if (error) {
    return `Voice list error: ${error}`;
  }

  const hasManualVoiceId = selectedVoiceId.trim().length > 0 && !selectedVoiceListed;
  if (listedVoiceCount > 0) {
    const voiceWord = listedVoiceCount === 1 ? 'voice' : 'voices';
    const manualSuffix = hasManualVoiceId ? '; manual voice id selected' : '';
    return `Voice list: ${listedVoiceCount} ${providerLabel} ${voiceWord} listed${manualSuffix}.`;
  }

  if (hasManualVoiceId) {
    return `Voice list: manual ${providerLabel} voice id selected.`;
  }

  return 'Voice list: none loaded; blank voice uses server default.';
}
