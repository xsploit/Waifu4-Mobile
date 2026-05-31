export interface EmbedResult {
  embeddings: number[][];
}

export interface IndexDocumentInput {
  id: string;
  text: string;
  user_id: string;
  metadata?: Record<string, unknown>;
}

export interface SearchResult {
  id: string;
  text: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface SearchResponse {
  results: SearchResult[];
}

export interface HealthResponse {
  status: string;
  indexed: number;
  model: string;
}

export interface EmbeddingClient {
  embed(texts: string[]): Promise<EmbedResult>;
  indexDocument(
    doc: IndexDocumentInput,
  ): Promise<{ ok: boolean; total_indexed: number }>;
  search(
    query: string,
    userId: string,
    limit: number,
    excludeIds?: string[],
  ): Promise<SearchResponse>;
  health(): Promise<HealthResponse>;
}

export function createEmbeddingClient(
  baseUrl = "http://127.0.0.1:9400",
): EmbeddingClient {
  const base = baseUrl.replace(/\/+$/, "");

  async function post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(
        `Embedding sidecar ${path} returned ${response.status}: ${await response.text()}`,
      );
    }
    return response.json() as Promise<T>;
  }

  return {
    async embed(texts: string[]): Promise<EmbedResult> {
      return post<EmbedResult>("/embed", { texts });
    },

    async indexDocument(
      doc: IndexDocumentInput,
    ): Promise<{ ok: boolean; total_indexed: number }> {
      return post("/index", doc);
    },

    async search(
      query: string,
      userId: string,
      limit: number,
      excludeIds?: string[],
    ): Promise<SearchResponse> {
      return post<SearchResponse>("/search", {
        query,
        user_id: userId,
        limit,
        exclude_ids: excludeIds ?? [],
      });
    },

    async health(): Promise<HealthResponse> {
      return post<HealthResponse>("/health", {});
    },
  };
}
