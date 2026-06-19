import type { FishBackend, FishStreamRequest, FishTextStream } from '../tts/FishTtsStream';
import { clampInteger } from '../../src/shared/number';

export const LIVE_TTS_BRIDGE_FINAL_WAIT_MS = 15_000;

export type LiveTtsBridgeRequest = {
  backend?: FishBackend;
  chunkingStrategy?: 'app' | 'python-safe' | 'eager' | 'fast-phrase' | 'safe-phrase';
  chunkLength?: number;
  conditionOnPreviousChunks?: boolean;
  latency?: FishStreamRequest['latency'];
  maxBufferChars?: number;
  minBufferChars?: number;
  sampleRate?: number;
  softBufferChars?: number;
  voiceId?: string;
};

type TextQueue = {
  close: () => void;
  fail: (error: Error) => void;
  push: (chunk: string) => void;
  pushRaw: (chunk: string) => void;
  stream: () => FishTextStream;
};

function normalizeTtsLatency(value: unknown): FishStreamRequest['latency'] | undefined {
  return value === 'balanced' || value === 'normal' ? value : undefined;
}

function normalizeBridgeChunkingStrategy(
  value: unknown,
): 'app' | 'python-safe' | 'eager' | undefined {
  if (value === 'fast-phrase') {
    return 'app';
  }
  if (value === 'safe-phrase') {
    return 'python-safe';
  }
  return value === 'python-safe' || value === 'eager' || value === 'app' ? value : undefined;
}

function normalizeFishBackend(value: unknown): FishBackend | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const model = value.trim().toLowerCase();
  if (model === 's1') {
    return 's1';
  }
  if (model === 's2' || model === 's2-pro') {
    return 's2-pro';
  }
  return undefined;
}

export function normalizeLiveTtsBridge(value: unknown): LiveTtsBridgeRequest | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const source = value as Record<string, unknown>;
  const provider = source['provider'];
  if (
    (provider !== 'fish-speech' && provider !== 'fish') ||
    source['streamingMode'] !== 'live-bridge'
  ) {
    return null;
  }

  return {
    backend: normalizeFishBackend(source['modelId'] ?? source['backend']),
    chunkingStrategy: normalizeBridgeChunkingStrategy(source['chunkingStrategy']),
    chunkLength: clampInteger(source['chunkLength'], 100, 300),
    conditionOnPreviousChunks:
      typeof source['conditionOnPreviousChunks'] === 'boolean'
        ? source['conditionOnPreviousChunks']
        : undefined,
    latency: normalizeTtsLatency(source['latency']),
    maxBufferChars: clampInteger(source['maxBufferChars'], 16, 1000),
    minBufferChars: clampInteger(source['minBufferChars'], 1, 500),
    sampleRate: clampInteger(source['sampleRate'], 8000, 96000),
    softBufferChars: clampInteger(source['softBufferChars'], 8, 1000),
    voiceId: typeof source['voiceId'] === 'string' ? source['voiceId'] : undefined,
  };
}

function createAsyncTextQueue(): TextQueue {
  const chunks: string[] = [];
  const waiters: Array<() => void> = [];
  let closed = false;
  let failure: Error | null = null;

  const wake = () => {
    while (waiters.length > 0) {
      waiters.shift()?.();
    }
  };

  return {
    push(chunk: string) {
      if (closed || failure) {
        return;
      }
      const text = chunk.trim();
      if (!text) {
        return;
      }
      chunks.push(text.endsWith(' ') ? text : `${text} `);
      wake();
    },
    pushRaw(chunk: string) {
      if (closed || failure || !chunk) {
        return;
      }
      chunks.push(chunk);
      wake();
    },
    close() {
      closed = true;
      wake();
    },
    fail(error: Error) {
      failure = error;
      closed = true;
      wake();
    },
    async *stream() {
      while (true) {
        if (failure) {
          throw failure;
        }
        const next = chunks.shift();
        if (next) {
          yield next;
          continue;
        }
        if (closed) {
          return;
        }
        await new Promise<void>((resolve) => waiters.push(resolve));
      }
    },
  };
}

const LIVE_BRIDGE_ABBREVIATIONS = new Set([
  'dr.',
  'mr.',
  'mrs.',
  'ms.',
  'prof.',
  'sr.',
  'jr.',
  'vs.',
  'etc.',
]);

function normalizeLiveSpeechChunk(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function getLastWordFragment(text: string) {
  return (text.match(/[A-Za-z]+\.$/)?.[0] ?? '').toLowerCase();
}

function isDecimalPoint(text: string, index: number) {
  return /\d/.test(text[index - 1] ?? '') && /\d/.test(text[index + 1] ?? '');
}

function findSentenceBoundary(text: string) {
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (!char || !'.?!'.includes(char)) {
      continue;
    }
    if (
      char === '.' &&
      (isDecimalPoint(text, index) ||
        LIVE_BRIDGE_ABBREVIATIONS.has(getLastWordFragment(text.slice(0, index + 1))))
    ) {
      continue;
    }
    const next = text[index + 1] ?? '';
    if (!next || (!/\s/.test(next) && !`"')]} `.includes(next))) {
      continue;
    }
    return index + 1;
  }
  return -1;
}

function findSoftBoundary(text: string, softLength: number, maxLength: number) {
  if (text.length < maxLength) {
    return -1;
  }
  const region = text.slice(0, maxLength);
  for (const delimiter of [', ', '; ', ': ', ' - ', ' ']) {
    const index = region.lastIndexOf(delimiter);
    if (index >= softLength) {
      return index + delimiter.length;
    }
  }
  return maxLength;
}

export function createLiveSpeechTextBridge(options: LiveTtsBridgeRequest | null = null) {
  const queue = createAsyncTextQueue();
  let pending = '';
  const strategy = normalizeBridgeChunkingStrategy(options?.chunkingStrategy) ?? 'app';
  const minLength = options?.minBufferChars ?? (strategy === 'python-safe' ? 160 : 28);
  const maxLength = options?.maxBufferChars ?? (strategy === 'python-safe' ? 240 : 180);
  const softLength = options?.softBufferChars ?? (strategy === 'python-safe' ? 160 : minLength);

  const pushSpeechChunk = (chunk: string) => {
    const text = normalizeLiveSpeechChunk(chunk);
    if (text) {
      queue.push(text);
    }
  };

  const flush = (force = false) => {
    while (pending.trim()) {
      if (!force && pending.length < minLength) {
        return;
      }
      let splitAt = -1;
      if (strategy === 'python-safe') {
        splitAt = findSentenceBoundary(pending);
        if (splitAt === -1) {
          splitAt = findSoftBoundary(pending, softLength, maxLength);
        }
      } else {
        const windowText = pending.slice(0, maxLength);
        const matches = Array.from(windowText.matchAll(/[.!?]["')\]]?\s+|[,;:]\s+|\n+/g));
        const boundary = [...matches].reverse().find((match) => (match.index ?? 0) >= minLength);
        splitAt = boundary ? (boundary.index ?? 0) + boundary[0].length : -1;
        if (splitAt === -1 && pending.length >= maxLength) {
          splitAt = Math.max(windowText.lastIndexOf(' '), minLength);
        }
      }
      if (splitAt === -1) {
        if (!force) {
          return;
        }
        splitAt = pending.length;
      }
      const chunk = pending.slice(0, splitAt).trim();
      pending = pending.slice(splitAt).trimStart();
      pushSpeechChunk(chunk);
    }
  };

  return {
    push(delta: string) {
      if (!delta) {
        return;
      }
      if (strategy === 'eager') {
        queue.pushRaw(delta);
        return;
      }
      pending += delta;
      flush(false);
    },
    close() {
      flush(true);
      queue.close();
    },
    fail(error: Error) {
      queue.fail(error);
    },
    stream: queue.stream(),
  };
}

export function waitForLiveTtsBridge(
  done: Promise<void>,
  onTimeout: () => void,
  timeoutMs = LIVE_TTS_BRIDGE_FINAL_WAIT_MS,
) {
  return new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => {
      onTimeout();
      resolve(false);
    }, timeoutMs);
    done.then(
      () => {
        clearTimeout(timeout);
        resolve(true);
      },
      () => {
        clearTimeout(timeout);
        resolve(false);
      },
    );
  });
}
