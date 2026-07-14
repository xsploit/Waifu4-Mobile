export type LadybugMemoryGraphSummary = {
  edges: Array<{ count: number; relation: string }>;
  participants: Array<{ channel: string; displayName: string; id: string; source: string }>;
  personas: Array<{ id: string; name: string }>;
  recent: {
    activities: Array<{
      beatType: string;
      createdAt: number;
      id: string;
      promptText: string;
      responseText: string;
      scopeKey: string;
    }>;
    blocks: Array<{
      blockName: string;
      id: string;
      itemCount: number;
      items: string[];
      participantKey: string;
      scopeKey: string;
    }>;
    candidates: Array<{
      confidence: number;
      createdAt: number;
      id: string;
      participantKey: string;
      scopeKey: string;
      source: string;
      summary: string;
      type: string;
    }>;
    diary: Array<{
      beatType: string;
      createdAt: number;
      emotions: Array<{ intensity: number; name: string }>;
      id: string;
      interactionSummary: string;
      participantKey: string;
      personalThought: string;
      scopeKey: string;
      summary: string;
      tags: string[];
    }>;
    emotions: Array<{
      id: string;
      lastSignalSource: string;
      scopeKey: string;
      updatedAt: number;
    }>;
    emotionIntensities: Array<{
      emotionStateId: string;
      id: string;
      intensity: number;
      name: string;
      scopeKey: string;
      updatedAt: number;
    }>;
    relationships: Array<{
      id: string;
      mood: string;
      relationshipStage: string;
      scopeKey: string;
      summary: string;
    }>;
    relationshipFacts: Array<{ id: string; scopeKey: string; text: string }>;
    semantic: Array<{ id: string; personaId: string; text: string }>;
    slotPatches: Array<{
      createdAt: number;
      id: string;
      operation: string;
      participantKey: string;
      scopeKey: string;
      slotId: string;
      slotName: string;
    }>;
    slots: Array<{
      id: string;
      itemCount: number;
      items: string[];
      participantKey: string;
      slotName: string;
      scopeKey: string;
      updatedAt: number;
    }>;
    traces: Array<{
      beatType: string;
      createdAt: number;
      id: string;
      model: string;
      prompt: string;
      provider: string;
      scopeKey: string;
      systemPrompt: string;
      taskType: string;
    }>;
    turns: Array<{
      authorName: string;
      createdAt: number;
      id: string;
      role: string;
      scopeKey: string;
      text: string;
    }>;
    vectors: Array<{ id: string; personaId: string; text: string }>;
  };
  scopes: Array<{ channel: string; id: string; personaId: string; source: string }>;
};
