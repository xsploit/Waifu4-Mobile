/// <reference lib="webworker" />

import * as piper from '@mintplex-labs/piper-tts-web';
import type { ProgressCallback } from '@mintplex-labs/piper-tts-web';
import {
  CUSTOM_RIKO_PIPER_VOICES,
  sortPiperVoices,
  type LipSyncData,
  type PiperVoiceProfile,
  type PiperWorkerMessage,
  type PiperWorkerRequest,
  type SynthesizedPiperChunkPayload,
  type WordBoundary,
} from './piper-shared';

type PiperRuntime = typeof piper & {
  HF_BASE: string;
  PATH_MAP: Record<string, string>;
};

type PendingAssetRequest = {
  resolve: (response: Response) => void;
  reject: (error: Error) => void;
};

type PiperSessionApi = typeof piper & {
  TtsSession: {
    _instance: unknown | null;
    create: (options: {
      voiceId: string;
      progress?: ProgressCallback;
      wasmPaths?: {
        onnxWasm: string;
        piperData: string;
        piperWasm: string;
      };
    }) => Promise<{
      predict: (text: string) => Promise<Blob>;
    }>;
  };
};

const runtime = piper as PiperRuntime;
const sessionApi = piper as PiperSessionApi;
const pendingAssetRequests = new Map<number, PendingAssetRequest>();
const DUMMY_SAMPLE_RATE = null;
let fetchPatched = false;
let wasmRuntimeTuned = false;
let assetRequestId = 0;
let phonemizerPromise:
  | Promise<{ phonemize: (text: string, language?: string) => Promise<string[]> } | null>
  | null = null;
let activeSessionVoiceId: string | null = null;

const LOCAL_PIPER_WASM_PATHS = {
  onnxWasm: 'https://cdnjs.cloudflare.com/ajax/libs/onnxruntime-web/1.18.0/',
  piperData: 'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize.data',
  piperWasm: 'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize.wasm',
} as const;

function postResponse(requestId: number, result: unknown, transfers: Transferable[] = []) {
  const message: PiperWorkerMessage = {
    type: 'response',
    requestId,
    ok: true,
    result,
  };
  self.postMessage(message, transfers);
}

function postError(requestId: number, error: unknown) {
  const message: PiperWorkerMessage = {
    type: 'response',
    requestId,
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  };
  self.postMessage(message);
}

function postProgress(requestId: number, progress: { loaded: number; total: number; url: string }) {
  const message: PiperWorkerMessage = {
    type: 'progress',
    requestId,
    progress,
  };
  self.postMessage(message);
}

function getRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }

  if (input instanceof URL) {
    return input.href;
  }

  return input.url;
}

function clampWasmThreadingForRunHost() {
  if (wasmRuntimeTuned || self.crossOriginIsolated || typeof navigator === 'undefined') {
    wasmRuntimeTuned = true;
    return;
  }

  try {
    const navigatorPrototype = Object.getPrototypeOf(navigator) as object | null;
    const descriptor =
      Object.getOwnPropertyDescriptor(navigator, 'hardwareConcurrency') ??
      (navigatorPrototype
        ? Object.getOwnPropertyDescriptor(navigatorPrototype, 'hardwareConcurrency')
        : undefined);

    if (!descriptor || descriptor.configurable === false) {
      wasmRuntimeTuned = true;
      return;
    }

    Object.defineProperty(navigator, 'hardwareConcurrency', {
      configurable: true,
      get: () => 1,
    });
  } catch (error) {
    console.warn('[TTS Worker] Could not clamp WASM threads for non-isolated host:', error);
  } finally {
    wasmRuntimeTuned = true;
  }
}

function requestCustomAsset(assetPath: string): Promise<Response> {
  const nextAssetRequestId = ++assetRequestId;
  return new Promise((resolve, reject) => {
    pendingAssetRequests.set(nextAssetRequestId, { resolve, reject });
    const message: PiperWorkerMessage = {
      type: 'asset-request',
      assetRequestId: nextAssetRequestId,
      assetPath,
    };
    self.postMessage(message);
  });
}

function ensureWorkerPiperPatched() {
  if (fetchPatched) {
    return;
  }

  clampWasmThreadingForRunHost();
  CUSTOM_RIKO_PIPER_VOICES.forEach((voice) => {
    runtime.PATH_MAP[voice.key] = voice.remotePath!;
  });
  const originalFetch = self.fetch.bind(self);

  self.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = getRequestUrl(input);
    for (const voice of CUSTOM_RIKO_PIPER_VOICES) {
      const modelUrl = `${runtime.HF_BASE}/${voice.remotePath}`;
      const configUrl = `${modelUrl}.json`;

      if (url === modelUrl) {
        return requestCustomAsset(voice.onnxAssetPath!);
      }

      if (url === configUrl) {
        return requestCustomAsset(voice.configAssetPath!);
      }
    }

    return originalFetch(input, init);
  };

  fetchPatched = true;
}

function cleanForSpeech(text: string) {
  return text
    .replace(/\*[^*]*\*/g, '')
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '')
    .replace(/([.!?,;:—])\1+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

async function getPhonemizer() {
  if (!phonemizerPromise) {
    phonemizerPromise = import('phonemizer')
      .then((mod) => ({ phonemize: mod.phonemize }))
      .catch((error) => {
        console.warn('[TTS Worker] Phonemizer unavailable, using fallback visemes:', error);
        return null;
      });
  }

  return phonemizerPromise;
}

async function createApproxLipSyncData(text: string): Promise<LipSyncData> {
  const cleaned = cleanForSpeech(text);
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return {
      text: cleaned,
      wordBoundaries: [],
      phonemes: null,
    };
  }

  let phonemeWords: string[] = [];
  const phonemizer = await getPhonemizer();
  if (phonemizer) {
    try {
      const result = await phonemizer.phonemize(cleaned, 'en-us');
      const line = Array.isArray(result) ? (result[0] ?? '') : '';
      phonemeWords = line.split(/\s+/).filter(Boolean);
    } catch {
      phonemeWords = [];
    }
  }

  if (phonemeWords.length === 0) {
    phonemeWords = words.map((word) => word.toLowerCase());
  }
  if (phonemeWords.length < words.length) {
    const filled = [...phonemeWords];
    while (filled.length < words.length) {
      filled.push(words[filled.length]?.toLowerCase() ?? '');
    }
    phonemeWords = filled;
  } else if (phonemeWords.length > words.length) {
    phonemeWords = phonemeWords.slice(0, words.length);
  }

  let cursorSeconds = 0;
  const wordBoundaries: WordBoundary[] = [];
  for (const word of words) {
    const sanitizedWord = word.replace(/^[^A-Za-z0-9']+|[^A-Za-z0-9']+$/g, '') || word;
    let durationSeconds = 0.09 + Math.min(sanitizedWord.length, 14) * 0.027;
    if (/[,.!?;:]$/.test(word)) {
      durationSeconds += 0.07;
    }
    durationSeconds = Math.max(0.1, Math.min(durationSeconds, 0.5));

    wordBoundaries.push({
      word: sanitizedWord,
      offset: Math.round(cursorSeconds * 10000000),
      duration: Math.round(durationSeconds * 10000000),
    });
    cursorSeconds += durationSeconds;
  }

  return {
    text: cleaned,
    wordBoundaries,
    phonemes: phonemeWords,
  };
}

async function listVoicesInternal(): Promise<PiperVoiceProfile[]> {
  ensureWorkerPiperPatched();

  const voices = await piper.voices();
  const merged = new Map<string, PiperVoiceProfile>();
  CUSTOM_RIKO_PIPER_VOICES.forEach((voice) => {
    merged.set(voice.key, voice);
  });

  voices.forEach((voice) => {
    if (!merged.has(String(voice.key))) {
      merged.set(String(voice.key), {
        ...voice,
        kind: 'builtin',
        source: 'Stock Piper voice',
      });
    }
  });

  return Array.from(merged.values()).sort(sortPiperVoices);
}

async function getStoredVoiceKeysInternal() {
  ensureWorkerPiperPatched();
  return (await piper.stored()).map(String);
}

async function cacheVoiceInternal(requestId: number, voiceId: string) {
  ensureWorkerPiperPatched();
  const callback: ProgressCallback = (progress) => {
    postProgress(requestId, {
      loaded: progress.loaded,
      total: progress.total,
      url: progress.url,
    });
  };

  await piper.download(voiceId, callback);
}

function resetSessionIfVoiceChanged(voiceId: string) {
  if (activeSessionVoiceId === voiceId) {
    return;
  }

  sessionApi.TtsSession._instance = null;
  activeSessionVoiceId = null;
}

async function createSessionForVoice(voiceId: string, progress?: ProgressCallback) {
  ensureWorkerPiperPatched();
  resetSessionIfVoiceChanged(voiceId);

  const session = await sessionApi.TtsSession.create({
    voiceId,
    progress,
    wasmPaths: LOCAL_PIPER_WASM_PATHS,
  });
  activeSessionVoiceId = voiceId;
  return session;
}

async function loadVoiceInternal(requestId: number, voiceId: string) {
  const callback: ProgressCallback = (progress) => {
    postProgress(requestId, {
      loaded: progress.loaded,
      total: progress.total,
      url: progress.url,
    });
  };

  await createSessionForVoice(voiceId, callback);
}

async function synthesizeInternal(text: string, voiceId: string): Promise<SynthesizedPiperChunkPayload> {
  const cleaned = cleanForSpeech(text);
  const session = await createSessionForVoice(voiceId);
  const [audioBlob, lipSyncData] = await Promise.all([
    session.predict(cleaned),
    createApproxLipSyncData(cleaned),
  ]);
  const audioBuffer = await audioBlob.arrayBuffer();

  return {
    ...lipSyncData,
    audioBuffer,
    audioType: audioBlob.type || 'audio/wav',
    sampleRate: DUMMY_SAMPLE_RATE,
  };
}

self.addEventListener('message', async (event: MessageEvent<PiperWorkerRequest>) => {
  const message = event.data;

  if (message.type === 'asset-response') {
    const pending = pendingAssetRequests.get(message.assetRequestId);
    if (!pending) {
      return;
    }

    pendingAssetRequests.delete(message.assetRequestId);

    if (!message.ok || !message.buffer) {
      pending.reject(new Error(message.error ?? 'Asset bridge failed'));
      return;
    }

    pending.resolve(
      new Response(message.buffer, {
        status: 200,
        headers: message.mimeType ? { 'Content-Type': message.mimeType } : undefined,
      }),
    );
    return;
  }

  try {
    switch (message.type) {
      case 'list-voices':
        postResponse(message.requestId, await listVoicesInternal());
        break;
      case 'stored-voices':
        postResponse(message.requestId, await getStoredVoiceKeysInternal());
        break;
      case 'cache-voice':
        await cacheVoiceInternal(message.requestId, message.voiceId);
        postResponse(message.requestId, true);
        break;
      case 'load-voice':
        await loadVoiceInternal(message.requestId, message.voiceId);
        postResponse(message.requestId, true);
        break;
      case 'synthesize': {
        const result = await synthesizeInternal(message.text, message.voiceId);
        postResponse(message.requestId, result, [result.audioBuffer]);
        break;
      }
    }
  } catch (error) {
    postError(message.requestId, error);
  }
});
