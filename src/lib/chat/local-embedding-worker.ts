import { pipeline } from '@huggingface/transformers';

type LocalEmbeddingRequest = {
  id: number;
  model?: string;
  text: string;
};

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

const DEFAULT_LOCAL_EMBEDDING_MODEL = 'onnx-community/all-MiniLM-L6-v2-ONNX';

const extractorPromises = new Map<string, ReturnType<typeof pipeline<'feature-extraction'>>>();

function getExtractor(model = DEFAULT_LOCAL_EMBEDDING_MODEL) {
  const modelId = model.trim() || DEFAULT_LOCAL_EMBEDDING_MODEL;
  let extractorPromise = extractorPromises.get(modelId);
  if (!extractorPromise) {
    extractorPromise = pipeline('feature-extraction', modelId);
    extractorPromises.set(modelId, extractorPromise);
  }
  return extractorPromise;
}

async function createEmbedding(text: string, model?: string) {
  const extractor = await getExtractor(model);
  const output = await extractor(text, { normalize: true, pooling: 'mean' });
  return Array.from(output.data, (value) => Number(value));
}

self.onmessage = (event: MessageEvent<LocalEmbeddingRequest>) => {
  const { id, model, text } = event.data;
  void createEmbedding(text, model).then(
    (embedding) => {
      self.postMessage({ embedding, id, ok: true } satisfies LocalEmbeddingResponse);
    },
    (error) => {
      self.postMessage({
        error: error instanceof Error ? error.message : 'Local embedding failed.',
        id,
        ok: false,
      } satisfies LocalEmbeddingResponse);
    },
  );
};
