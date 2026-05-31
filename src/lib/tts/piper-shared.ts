import type { Voice } from '@mintplex-labs/piper-tts-web';

export interface WordBoundary {
  word: string;
  offset: number;
  duration: number;
}

export interface LipSyncData {
  wordBoundaries: WordBoundary[];
  phonemes: string[] | null;
  text: string;
}

export type SynthesizedPiperChunkPayload = LipSyncData & {
  audioBuffer: ArrayBuffer;
  audioType: string;
  sampleRate?: number | null;
};

export type PiperVoiceProfile = Voice & {
  kind: 'builtin' | 'custom';
  source: string;
  remotePath?: string;
  onnxAssetPath?: string;
  configAssetPath?: string;
};

const RIKO_ENGLISH_LANGUAGE: Voice['language'] = {
  code: 'en_US',
  family: 'English',
  region: 'US',
  name_native: 'English (US)',
  name_english: 'English',
  country_english: 'United States',
};

function createCustomRikoPiperVoice(
  key: string,
  name: string,
  source: string,
  aliases: string[],
): PiperVoiceProfile {
  return {
    key,
    name,
    aliases,
    quality: 'medium',
    num_speakers: 1,
    speaker_id_map: {},
    files: {} as Voice['files'],
    kind: 'custom',
    source,
    remotePath: `custom/${key}.onnx`,
    onnxAssetPath: `piper/${key}.onnx`,
    configAssetPath: `piper/${key}.onnx.json`,
    language: RIKO_ENGLISH_LANGUAGE,
  };
}

export const CUSTOM_RIKO_PIPER_VOICES: PiperVoiceProfile[] = [
  createCustomRikoPiperVoice(
    'en_US-riko_fish_s2_200_32k_2259-medium',
    'Riko S2',
    'Fish Audio S2 teacher distilled into Piper',
    ['riko', 'riko-s2', 'waifu'],
  ),
  createCustomRikoPiperVoice(
    'en_US-riko_2399-medium',
    'Riko 2399',
    'Local ONNX export from TextyMcSpeechy',
    ['riko-2399'],
  ),
  createCustomRikoPiperVoice(
    'en_US-riko_2729-medium',
    'Riko 2729',
    'Local ONNX export from TextyMcSpeechy',
    ['riko-2729'],
  ),
  createCustomRikoPiperVoice(
    'en_US-neuro-sama-medium',
    'Neuro-sama',
    'Direct Azure Ashley clips segmented and distilled into Piper',
    ['neuro', 'neuro-sama', 'ashley', 'azure-neuro'],
  ),
  createCustomRikoPiperVoice(
    'en_US-neuro_100_32k_2259-medium',
    'Riko 32k HQ',
    '32 kHz Riko continuation from the neuro_100_32k_2259 Piper branch',
    [
      'riko-32k',
      'riko-hq',
      'riko-2259',
      'hikari',
      'hikari-chan',
      'hikarichan',
      'hikky-c',
      'hikkyc',
      'hikky c',
    ],
  ),
  createCustomRikoPiperVoice(
    'en_US-azuretts_fish_s2_200_32k_2259-medium',
    'Eddie',
    'AI2U Eddie voice distilled from the AzureTTS Fish S2 32 kHz branch',
    ['eddie', 'ai2u', 'azuretts', 'eddie-ai2u'],
  ),
];

export const CUSTOM_RIKO_PIPER_VOICE: PiperVoiceProfile = CUSTOM_RIKO_PIPER_VOICES[0]!;

export const RIKO_PIPER_VOICE_KEY = CUSTOM_RIKO_PIPER_VOICE.key;
export const NEURO_PIPER_VOICE_KEY = 'en_US-neuro-sama-medium';
export const HIKARI_PIPER_VOICE_KEY = 'en_US-neuro_100_32k_2259-medium';

export function sortPiperVoices(left: PiperVoiceProfile, right: PiperVoiceProfile) {
  const customVoiceOrder = new Map(
    CUSTOM_RIKO_PIPER_VOICES.map((voice, index) => [voice.key, index] as const),
  );
  const leftCustomOrder = customVoiceOrder.get(left.key);
  const rightCustomOrder = customVoiceOrder.get(right.key);

  if (leftCustomOrder !== undefined && rightCustomOrder !== undefined) {
    return leftCustomOrder - rightCustomOrder;
  }

  if (leftCustomOrder !== undefined) return -1;
  if (rightCustomOrder !== undefined) return 1;

  const leftEnglish = String(left.language?.code ?? '').startsWith('en_');
  const rightEnglish = String(right.language?.code ?? '').startsWith('en_');
  if (leftEnglish !== rightEnglish) {
    return leftEnglish ? -1 : 1;
  }

  return `${left.name} ${left.key}`.localeCompare(`${right.name} ${right.key}`);
}

type WorkerProgress = {
  loaded: number;
  total: number;
  url: string;
};

export type PiperWorkerRequest =
  | { type: 'list-voices'; requestId: number }
  | { type: 'stored-voices'; requestId: number }
  | { type: 'cache-voice'; requestId: number; voiceId: string }
  | { type: 'load-voice'; requestId: number; voiceId: string }
  | { type: 'synthesize'; requestId: number; text: string; voiceId: string }
  | {
      type: 'asset-response';
      assetRequestId: number;
      ok: boolean;
      buffer?: ArrayBuffer;
      mimeType?: string;
      error?: string;
    };

export type PiperWorkerMessage =
  | { type: 'response'; requestId: number; ok: true; result: unknown }
  | { type: 'response'; requestId: number; ok: false; error: string }
  | { type: 'progress'; requestId: number; progress: WorkerProgress }
  | { type: 'asset-request'; assetRequestId: number; assetPath: string };
