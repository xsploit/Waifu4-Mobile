export type PiperVoiceProfile = {
  aliases?: string[];
  configAssetPath?: string;
  key: string;
  kind: 'builtin' | 'custom';
  name: string;
  onnxAssetPath?: string;
  remotePath?: string;
  source: string;
};

export const CUSTOM_RIKO_PIPER_VOICE: PiperVoiceProfile = {
  aliases: ['riko', 'riko-s2', 'waifu'],
  configAssetPath: 'piper/en_US-riko_fish_s2_200_32k_2259-medium.onnx.json',
  key: 'en_US-riko_fish_s2_200_32k_2259-medium',
  kind: 'custom',
  name: 'Riko S2',
  onnxAssetPath: 'piper/en_US-riko_fish_s2_200_32k_2259-medium.onnx',
  remotePath: 'custom/en_US-riko_fish_s2_200_32k_2259-medium.onnx',
  source: 'Fish Audio S2 teacher distilled into Piper',
};

export const CUSTOM_RIKO_PIPER_VOICES: PiperVoiceProfile[] = [CUSTOM_RIKO_PIPER_VOICE];
export const RIKO_PIPER_VOICE_KEY = CUSTOM_RIKO_PIPER_VOICE.key;
export const NEURO_PIPER_VOICE_KEY = 'en_US-neuro-sama-medium';
export const HIKARI_PIPER_VOICE_KEY = 'en_US-neuro_100_32k_2259-medium';
