import type { ProgressCallback } from '@mintplex-labs/piper-tts-web';
import { fetchGameAssetBlob } from '../cdn/assets';
import {
  CUSTOM_RIKO_PIPER_VOICE,
  CUSTOM_RIKO_PIPER_VOICES,
  HIKARI_PIPER_VOICE_KEY,
  NEURO_PIPER_VOICE_KEY,
  RIKO_PIPER_VOICE_KEY,
  type PiperVoiceProfile,
  type PiperWorkerMessage,
  type PiperWorkerRequest,
  type SynthesizedPiperChunkPayload,
} from './piper-shared';

type PendingRequest = {
  callback?: ProgressCallback;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

type WorkerCommand =
  | { type: 'list-voices' }
  | { type: 'stored-voices' }
  | { type: 'cache-voice'; voiceId: string }
  | { type: 'load-voice'; voiceId: string }
  | { type: 'synthesize'; text: string; voiceId: string };

class PiperWorkerClient {
  private worker: Worker | null = null;
  private requestId = 0;
  private pendingRequests = new Map<number, PendingRequest>();

  private readonly handleWorkerMessage = (event: MessageEvent<PiperWorkerMessage>) => {
    const message = event.data;

    if (message.type === 'asset-request') {
      void this.handleAssetRequest(message.assetRequestId, message.assetPath);
      return;
    }

    const pending = this.pendingRequests.get(message.requestId);
    if (!pending) {
      return;
    }

    if (message.type === 'progress') {
      pending.callback?.(message.progress);
      return;
    }

    this.pendingRequests.delete(message.requestId);
    if (message.ok) {
      pending.resolve(message.result);
    } else {
      pending.reject(new Error(message.error));
    }
  };

  private ensureWorker() {
    if (this.worker) {
      return this.worker;
    }

    this.worker = new Worker(new URL('./tts-worker.ts', import.meta.url), { type: 'module' });
    this.worker.addEventListener('message', this.handleWorkerMessage);

    return this.worker;
  }

  private async handleAssetRequest(assetRequestId: number, assetPath: string) {
    const worker = this.ensureWorker();

    try {
      const blob = await fetchGameAssetBlob(assetPath);
      const buffer = await blob.arrayBuffer();
      const response: PiperWorkerRequest = {
        type: 'asset-response',
        assetRequestId,
        ok: true,
        buffer,
        mimeType: blob.type,
      };
      worker.postMessage(response, [buffer]);
    } catch (error) {
      const response: PiperWorkerRequest = {
        type: 'asset-response',
        assetRequestId,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
      worker.postMessage(response);
    }
  }

  private request<T>(payload: WorkerCommand, callback?: ProgressCallback) {
    const worker = this.ensureWorker();
    const requestId = ++this.requestId;

    return new Promise<T>((resolve, reject) => {
      this.pendingRequests.set(requestId, {
        callback,
        resolve: (value) => resolve(value as T),
        reject,
      });

      worker.postMessage({
        ...payload,
        requestId,
      } as PiperWorkerRequest);
    });
  }

  listVoices() {
    return this.request<PiperVoiceProfile[]>({ type: 'list-voices' });
  }

  storedVoiceKeys() {
    return this.request<string[]>({ type: 'stored-voices' });
  }

  cacheVoice(voiceId: string, callback?: ProgressCallback) {
    return this.request<boolean>({ type: 'cache-voice', voiceId }, callback);
  }

  loadVoice(voiceId: string, callback?: ProgressCallback) {
    return this.request<boolean>({ type: 'load-voice', voiceId }, callback);
  }

  synthesize(text: string, voiceId: string) {
    return this.request<SynthesizedPiperChunkPayload>({ type: 'synthesize', text, voiceId });
  }

  dispose() {
    if (this.worker) {
      this.worker.removeEventListener('message', this.handleWorkerMessage);
      this.worker.terminate();
      this.worker = null;
    }
    for (const pending of this.pendingRequests.values()) {
      pending.reject(new Error('Piper worker disposed.'));
    }
    this.pendingRequests.clear();
  }
}

const workerClient = new PiperWorkerClient();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    workerClient.dispose();
  });
}

export type {
  LipSyncData,
  PiperVoiceProfile,
  SynthesizedPiperChunkPayload,
  WordBoundary,
} from './piper-shared';
export {
  CUSTOM_RIKO_PIPER_VOICE,
  CUSTOM_RIKO_PIPER_VOICES,
  HIKARI_PIPER_VOICE_KEY,
  NEURO_PIPER_VOICE_KEY,
  RIKO_PIPER_VOICE_KEY,
};

export async function listPiperVoices(): Promise<PiperVoiceProfile[]> {
  return workerClient.listVoices();
}

export async function getStoredPiperVoiceKeys(): Promise<string[]> {
  return workerClient.storedVoiceKeys();
}

export async function cachePiperVoice(voiceId: string, callback?: ProgressCallback): Promise<void> {
  await workerClient.cacheVoice(voiceId, callback);
}

export async function loadPiperVoiceSession(
  voiceId: string,
  callback?: ProgressCallback,
): Promise<void> {
  await workerClient.loadVoice(voiceId, callback);
}

export async function synthesizePiperChunk(
  text: string,
  voiceId: string,
): Promise<{
  audioBlob: Blob;
  wordBoundaries: SynthesizedPiperChunkPayload['wordBoundaries'];
  phonemes: SynthesizedPiperChunkPayload['phonemes'];
  text: string;
  sampleRate?: number | null;
}> {
  const result = await workerClient.synthesize(text, voiceId);
  return {
    audioBlob: new Blob([result.audioBuffer], { type: result.audioType || 'audio/wav' }),
    wordBoundaries: result.wordBoundaries,
    phonemes: result.phonemes,
    text: result.text,
    sampleRate: result.sampleRate,
  };
}

export async function synthesizePiperText(text: string, voiceId: string): Promise<Blob> {
  return (await synthesizePiperChunk(text, voiceId)).audioBlob;
}
