export type MemoryPromptDebugSnapshot = {
  grilloContextPacket?: {
    background_information: string[];
    channel_history: string[];
    output_description: string[];
    recalled_memories: string[];
    relationship_memory: string[];
    thoughts: string[];
  } | null;
  grilloDiaryThoughts: string[];
  grilloRecalledMemories: string[];
  grilloRelationshipMemory: string[];
  semanticMemoryContext: string;
  source: string;
  stateKey: string;
  turnText: string;
  updatedAt: number;
};

export type MemoryEmbeddingDebugSnapshot = {
  error?: string;
  inputChars: number;
  model?: string;
  operation: 'prompt-recall' | 'semantic-save' | 'worker-search' | 'worker-insert';
  provider: string;
  status: 'ok' | 'failed' | 'skipped-empty' | 'warming' | 'ready';
  updatedAt: number;
  vectorDims?: number;
};

export type MemoryWorkerDebugSnapshot = {
  error?: string;
  model?: string;
  processedChatTurnCount: number;
  reason: 'chat-cadence' | 'manual' | 'scheduled';
  rounds?: number;
  stateKey: string;
  status: 'running' | 'updated' | 'no-json' | 'failed';
  toolCalls?: number;
  updatedAt: number;
};
