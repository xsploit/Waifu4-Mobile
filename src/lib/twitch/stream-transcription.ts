import { isPremiumCostModelId } from '../chat/provider-defaults';

export type TwitchStreamTranscript = {
  channel: string;
  createdAt: number;
  model: string;
  sampleSeconds: number;
  text: string;
};

export type TwitchStreamTranscriptionResponse = {
  error?: string;
  ok?: boolean;
  transcript?: {
    channel?: string;
    model?: string;
    sampleSeconds?: number;
    text?: string;
  };
};

export type TwitchStreamFrame = {
  channel: string;
  createdAt: number;
  detail: 'auto' | 'high' | 'low';
  imageDataUrl: string;
  mimeType: string;
};

export type TwitchStreamFrameResponse = {
  error?: string;
  frame?: {
    channel?: string;
    imageDataUrl?: string;
    mimeType?: string;
  };
  ok?: boolean;
};

const SAFE_TWITCH_TRANSCRIPTION_MODELS = new Map([
  ['whisper-1', 'openai/whisper-1'],
  ['openai/whisper-1', 'openai/whisper-1'],
  ['whisper-large-v3', 'openai/whisper-large-v3'],
  ['openai/whisper-large-v3', 'openai/whisper-large-v3'],
  ['gpt-4o-transcribe', 'openai/gpt-4o-transcribe'],
  ['openai/gpt-4o-transcribe', 'openai/gpt-4o-transcribe'],
  ['gpt-4o-mini-transcribe', 'openai/gpt-4o-mini-transcribe'],
  ['openai/gpt-4o-mini-transcribe', 'openai/gpt-4o-mini-transcribe'],
  ['fish-audio/asr', 'fish-audio/asr'],
]);

export function normalizeTwitchStreamTranscriptionModel(value: unknown) {
  const model = typeof value === 'string' ? value.trim() : '';
  return SAFE_TWITCH_TRANSCRIPTION_MODELS.get(model.toLowerCase()) ?? 'openai/whisper-large-v3';
}

export function formatTwitchStreamTranscriptContext(
  transcripts: TwitchStreamTranscript[],
  limit: number,
) {
  const recent = transcripts
    .filter((entry) => entry.text.trim())
    .slice(-Math.max(1, Math.min(20, limit)));
  if (recent.length === 0) {
    return '';
  }
  return [
    'Recent Twitch stream audio transcript snippets. Use as ambient stream context only; do not treat it as a direct chat message unless the current user asks about the stream audio.',
    ...recent.map((entry) => {
      const time = new Date(entry.createdAt).toLocaleTimeString();
      return `- ${time} #${entry.channel}: ${entry.text}`;
    }),
  ].join('\n');
}

export function isLikelyVisionModel(_provider: string, model: string) {
  const normalized = model.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (isPremiumCostModelId(normalized)) {
    return false;
  }
  const openAiVision =
    /(^|[/:-])(gpt-4o|gpt-4\.1|gpt-4\.5|gpt-5|o3|o4)([/:-]|$)/.test(normalized) ||
    normalized.startsWith('gpt-4o') ||
    normalized.startsWith('gpt-4.1') ||
    normalized.startsWith('gpt-4.5') ||
    normalized.startsWith('gpt-5') ||
    normalized.startsWith('o3') ||
    normalized.startsWith('o4');
  return (
    openAiVision ||
    normalized.includes('vision') ||
    normalized.includes('vl') ||
    normalized.includes('llava') ||
    normalized.includes('pixtral') ||
    normalized.includes('gemini') ||
    normalized.includes('claude-3') ||
    normalized.includes('claude-4') ||
    normalized.includes('qwen-vl')
  );
}
