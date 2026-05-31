import { DEFAULT_LOCAL_EMBEDDING_MODEL } from './defaults';

type LocalEmbeddingResponse =
  | {
      embedding: number[];
      id: number;
      ok: true;
    }
  | {
      error: string;
      id: number;
      ok: false;
    };

type PendingLocalEmbedding = {
  reject: (error: Error) => void;
  resolve: (embedding: number[]) => void;
  timer: ReturnType<typeof setTimeout>;
};

const pendingEmbeddings = new Map<number, PendingLocalEmbedding>();
const warmedModels = new Set<string>();
let nextEmbeddingId = 1;
let worker: Worker | null = null;
const FIRST_LOCAL_EMBEDDING_TIMEOUT_MS = 45000;

function normalizeLocalEmbeddingModel(model?: string) {
  return model?.trim() || DEFAULT_LOCAL_EMBEDDING_MODEL;
}

function getLocalEmbeddingWorker() {
  worker ??= new Worker(new URL('./local-embedding-worker.ts', import.meta.url), {
    name: 'web-waifu-local-embeddings',
    type: 'module',
  });
  worker.onmessage = (event: MessageEvent<LocalEmbeddingResponse>) => {
    const pending = pendingEmbeddings.get(event.data.id);
    if (!pending) {
      return;
    }
    pendingEmbeddings.delete(event.data.id);
    clearTimeout(pending.timer);
    if (event.data.ok) {
      pending.resolve(event.data.embedding);
    } else {
      pending.reject(new Error(event.data.error));
    }
  };
  worker.onerror = (event) => {
    const error = new Error(event.message || 'Local embedding worker failed.');
    for (const [id, pending] of pendingEmbeddings) {
      clearTimeout(pending.timer);
      pending.reject(error);
      pendingEmbeddings.delete(id);
    }
    worker?.terminate();
    worker = null;
  };
  return worker;
}

export function requestLocalTextEmbedding(text: string, timeoutMs: number, model?: string) {
  const normalizedText = text.trim().slice(0, 4000);
  if (!normalizedText) {
    return Promise.resolve<number[] | null>(null);
  }
  if (typeof Worker === 'undefined') {
    return Promise.resolve(null);
  }

  const id = nextEmbeddingId++;
  const modelId = normalizeLocalEmbeddingModel(model);
  const effectiveTimeoutMs = warmedModels.has(modelId)
    ? timeoutMs
    : Math.max(timeoutMs, FIRST_LOCAL_EMBEDDING_TIMEOUT_MS);
  return new Promise<number[]>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingEmbeddings.delete(id);
      reject(new Error(`Local embedding worker timed out after ${effectiveTimeoutMs}ms.`));
    }, effectiveTimeoutMs);
    pendingEmbeddings.set(id, {
      reject,
      resolve: (embedding) => {
        warmedModels.add(modelId);
        resolve(embedding);
      },
      timer,
    });
    getLocalEmbeddingWorker().postMessage({ id, model: modelId, text: normalizedText });
  });
}

export function warmLocalTextEmbeddingModel(model?: string, timeoutMs = FIRST_LOCAL_EMBEDDING_TIMEOUT_MS) {
  const modelId = normalizeLocalEmbeddingModel(model);
  if (warmedModels.has(modelId)) {
    return Promise.resolve(true);
  }
  return requestLocalTextEmbedding('warm up local semantic memory embeddings', timeoutMs, modelId)
    .then((embedding) => Boolean(embedding?.length))
    .catch(() => false);
}
