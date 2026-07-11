export type GrilloEmbeddingIdentity = {
  dimensions: number;
  generation: string;
  model: string;
  provider: string;
  version: string;
};

export type GrilloRecallItem = {
  createdAt: number;
  embedding?: GrilloEmbeddingIdentity;
  evidenceIds: string[];
  id: string;
  participantKey?: string;
  score?: number;
  scopeKey: string;
  source: 'candidate' | 'semantic';
  text: string;
};

export type GrilloLaneReceipt = {
  droppedIds: string[];
  duplicateIds: string[];
  includedIds: string[];
  requestedIds: string[];
};

export type GrilloRetrievalReceipt = {
  embedding: GrilloEmbeddingIdentity | null;
  lanes: {
    recalled_memories: GrilloLaneReceipt;
  };
  query: string;
  strategy: 'lexical_fallback' | 'none' | 'recent_fallback' | 'semantic_vector';
};

export type GrilloContextPacket = {
  background_information: string[];
  channel_history: string[];
  generatedAt: number;
  output_description: string[];
  recalled_memories: GrilloRecallItem[];
  relationship_memory: string[];
  retrieval_receipt: GrilloRetrievalReceipt;
  scopeKey: string;
  thoughts: string[];
};
