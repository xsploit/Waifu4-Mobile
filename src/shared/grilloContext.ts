const GRILLO_CONTEXT_QUERY_MAX_CHARS = 4000;

export function normalizeGrilloContextQuery(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().slice(0, GRILLO_CONTEXT_QUERY_MAX_CHARS)
    : '';
}

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

export type GrilloProvenanceLaneName =
  | 'channel_history'
  | 'relationship_memory'
  | 'recalled_memories'
  | 'thoughts';

export type GrilloProvenanceDrop = {
  id: string;
  reason:
    | 'duplicate'
    | 'item_limit'
    | 'lane_limit'
    | 'participant_filter'
    | 'record_limit'
    | 'semantic_filter'
    | 'semantic_limit';
  stage: 'server_context_packet';
};

export type GrilloProvenanceLaneReceipt = GrilloLaneReceipt & {
  dropped: GrilloProvenanceDrop[];
  includedOccurrences: string[];
  requestedOccurrences: string[];
};

export type GrilloContextProvenanceReceipt = {
  lanes: Record<GrilloProvenanceLaneName, GrilloProvenanceLaneReceipt>;
  stage: 'server_context_packet';
  version: '1.0.0';
};

export type GrilloRetrievalIntent =
  | 'general'
  | 'correction'
  | 'temporal'
  | 'commitment'
  | 'relationship'
  | 'personal'
  | 'metacognitive';

export type GrilloMemorySufficiencyReceipt = {
  intents: GrilloRetrievalIntent[];
  probes: string[];
  requiredLanes: Array<'channel_history' | 'relationship_memory' | 'recalled_memories'>;
  missingLanes: Array<'channel_history' | 'relationship_memory' | 'recalled_memories'>;
  droppedRelevantIds: string[];
  reasons: string[];
  status: 'sufficient' | 'partial' | 'insufficient';
  version: '1.0.0';
};

export type GrilloContextPacket = {
  background_information: string[];
  channel_history: string[];
  generatedAt: number;
  output_description: string[];
  provenance_receipt?: GrilloContextProvenanceReceipt;
  recalled_memories: GrilloRecallItem[];
  relationship_memory: string[];
  retrieval_receipt: GrilloRetrievalReceipt;
  scopeKey: string;
  thoughts: string[];
};
