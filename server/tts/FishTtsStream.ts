import { FishAudioClient, RealtimeEvents } from 'fish-audio';
import { createLogger } from '../../src/shared/logger';

const log = createLogger('tts');

export type FishBackend = 's1' | 's2-pro';
export type FishFormat = 'pcm' | 'mp3' | 'wav' | 'opus';

export type FishStreamRequest = {
  apiKey: string;
  text: string;
  voiceId?: string; // reference_id
  backend?: FishBackend; // default s2-pro (D9)
  format?: FishFormat; // default pcm (low-latency playback)
  sampleRate?: number; // pcm only, default 44100
  chunkLength?: number; // default 200
  latency?: 'normal' | 'balanced'; // default balanced (D10)
  conditionOnPreviousChunks?: boolean; // default true (D9/D10)
  signal?: AbortSignal;
};

export type FishStreamStats = {
  firstAudioMs: number | null;
  chunks: number;
  bytes: number;
  totalMs: number;
};

/**
 * Stream TTS audio from Fish via the official SDK's realtime WebSocket.
 * `onAudio` receives raw audio chunks as they arrive (streaming-first, D10).
 * Resolves with latency/throughput stats, or rejects on error/abort.
 */
export async function streamFishTts(
  req: FishStreamRequest,
  onAudio: (chunk: Uint8Array) => void,
): Promise<FishStreamStats> {
  const format: FishFormat = req.format ?? 'pcm';
  const started = Date.now();
  let firstAudioAt: number | null = null;
  let chunks = 0;
  let bytes = 0;

  const client = new FishAudioClient({ apiKey: req.apiKey });

  // This slice speaks a given string; the LLM->TTS delta bridge is a later slice.
  async function* textStream(): AsyncIterable<string> {
    yield req.text;
  }

  // condition_on_previous_chunks isn't in the 0.1.0 TTSRequest type but the wire
  // protocol forwards it (prosody continuity across chunks — keep true).
  const request = {
    text: '',
    reference_id: req.voiceId,
    format,
    sample_rate: format === 'pcm' ? (req.sampleRate ?? 44100) : undefined,
    chunk_length: req.chunkLength ?? 200,
    latency: req.latency ?? 'balanced',
    normalize: true,
    condition_on_previous_chunks: req.conditionOnPreviousChunks ?? true,
  };

  // The 0.1.0 SDK's Backends type lags the API (no 's2-pro' yet), but the wire
  // 'model' header accepts it — cast so S2 (our default, D9) works.
  const connection = await client.textToSpeech.convertRealtime(
    request as Parameters<typeof client.textToSpeech.convertRealtime>[0],
    textStream(),
    (req.backend ?? 's2-pro') as unknown as Parameters<
      typeof client.textToSpeech.convertRealtime
    >[2],
  );

  return await new Promise<FishStreamStats>((resolve, reject) => {
    const finishStats = (): FishStreamStats => ({
      firstAudioMs: firstAudioAt === null ? null : firstAudioAt - started,
      chunks,
      bytes,
      totalMs: Date.now() - started,
    });

    const onAbort = () => {
      try {
        connection.close();
      } catch {
        /* already closing */
      }
      reject(new Error('TTS stream aborted'));
    };
    req.signal?.addEventListener('abort', onAbort, { once: true });

    connection.on(RealtimeEvents.AUDIO_CHUNK, (audio: unknown) => {
      const buf =
        audio instanceof Uint8Array
          ? audio
          : Buffer.isBuffer(audio)
            ? new Uint8Array(audio)
            : null;
      if (!buf || buf.length === 0) {
        return;
      }
      firstAudioAt ??= Date.now();
      chunks += 1;
      bytes += buf.length;
      onAudio(buf);
    });

    connection.on(RealtimeEvents.ERROR, (err: unknown) => {
      req.signal?.removeEventListener('abort', onAbort);
      const message = err instanceof Error ? err.message : String(err);
      log.error('tts stream error', { backend: req.backend ?? 's2-pro', error: message });
      reject(new Error(message));
    });

    connection.on(RealtimeEvents.CLOSE, () => {
      req.signal?.removeEventListener('abort', onAbort);
      const stats = finishStats();
      log.info('tts done', { ...stats, backend: req.backend ?? 's2-pro', format });
      resolve(stats);
    });
  });
}
