import type { TtsOutputMode } from '../chat/types';
import { getTtsProxyUrl } from './remote';

export type PiperOutputRouting = {
  discordToken: string;
  outputMode: TtsOutputMode;
  segmentIndex: number;
  ttsSessionId: string;
  utteranceId: string;
};

export function shouldUploadPiperOutput(mode: TtsOutputMode): boolean {
  return mode === 'discord-only' || mode === 'local+discord';
}

export async function uploadPiperWav(audio: Blob, routing: PiperOutputRouting): Promise<void> {
  if (!shouldUploadPiperOutput(routing.outputMode)) {
    return;
  }

  const url = new URL(getTtsProxyUrl('/tts/piper-output'), window.location.href);
  url.search = new URLSearchParams({
    outputMode: routing.outputMode,
    segmentIndex: String(routing.segmentIndex),
    ttsSessionId: routing.ttsSessionId,
    utteranceId: routing.utteranceId,
  }).toString();
  const response = await fetch(url, {
    body: audio,
    headers: {
      'content-type': 'audio/wav',
      'x-yourwifey-discord-token': routing.discordToken,
    },
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error(`Piper output fanout failed with HTTP ${response.status}.`);
  }
}
