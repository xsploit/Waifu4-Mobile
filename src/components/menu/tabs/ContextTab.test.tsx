import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createDefaultAiSettings, createDefaultRelationshipMemory } from '../../../lib/chat/defaults';
import { createDefaultGrilloMemoryState } from '../../../lib/chat/grillo-memory';
import { ContextTab } from './ContextTab';

describe('ContextTab', () => {
  it('renders Ladybug backend database, vector, graph, and prompt-inspection state', () => {
    const html = renderToStaticMarkup(
      <ContextTab
        aiSettings={createDefaultAiSettings()}
        availableModels={['gpt-5-nano']}
        backendGrilloTickBusy={false}
        chatDraftLength={0}
        currentModeLabel="Local"
        grilloRuntimeStatus={{
          enabled: false,
          intervalMs: 60000,
          lastBeatType: 'reflection',
          lastNoOpReason: 'worker_tasks_not_wired',
          lastTickAt: Date.parse('2026-05-25T12:00:06.000Z'),
          lastTickDurationMs: 0,
          lastTickId: 'tick-1',
          lastTickReason: 'manual_ui',
          lastToolCalls: 2,
          running: false,
          started: true,
          startedAt: Date.parse('2026-05-25T12:00:00.000Z'),
        }}
        grilloMemoryState={createDefaultGrilloMemoryState('local:persona:hikari-context')}
        memoryAgentBusy={false}
        memoryAgentPendingCounts={{ 'local:persona:hikari-context': 2 }}
        memoryAgentStatus="Memory worker ready."
        memoryBackendStatus={{
          backend: 'ladybug',
          candidates: 3,
          dbDir: 'C:/tmp/webwaifu4-memory.db',
          diaryEntries: 1,
          emotionIntensities: 2,
          emotionStates: 1,
          grilloActivities: 1,
          grilloScopes: 1,
          memoryBlocks: 1,
          memorySlotPatches: 1,
          memorySlots: 1,
          ok: true,
          participants: 2,
          personas: 1,
          relationshipEdges: 12,
          relationshipFacts: 1,
          relationshipProfiles: 1,
          scopes: 2,
          semanticRecords: 2,
          semanticScopes: 1,
          semanticVectors: 2,
          snapshots: 3,
          turnEvents: 1,
          workerContextTraces: 1,
        }}
        memoryEmbeddingDebug={{
          inputChars: 42,
          operation: 'prompt-recall',
          provider: 'vercel-gateway',
          status: 'ok',
          updatedAt: Date.parse('2026-05-25T12:00:00.000Z'),
          vectorDims: 1536,
        }}
        memoryGraphSummary={{
          edges: [{ count: 2, relation: 'HAS_VECTOR' }],
          participants: [
            { channel: 'local', displayName: 'Subby', id: 'local:local:subby', source: 'local' },
          ],
          personas: [{ id: 'hikari-context', name: 'Hikari' }],
          recent: {
            activities: [
              {
                beatType: 'relationship',
                createdAt: Date.parse('2026-05-25T12:00:03.000Z'),
                id: 'activity-1',
                promptText: 'Reflect on the latest memory turn.',
                responseText: 'Wrote a relationship reflection.',
                scopeKey: 'local:persona:hikari-context',
              },
            ],
            blocks: [
              {
                blockName: 'preferences',
                id: 'block-1',
                itemCount: 1,
                items: ['Subby prefers Ladybug memory first.'],
                participantKey: 'local:local:subby',
                scopeKey: 'local:persona:hikari-context',
              },
            ],
            candidates: [
              {
                id: 'candidate-1',
                participantKey: 'local:local:subby',
                summary: 'Subby asked me to remember Ladybug.',
                type: 'fact',
              },
            ],
            diary: [
              {
                beatType: 'relationship',
                id: 'diary-1',
                participantKey: 'local:local:subby',
                summary: 'Subby verified memory.',
              },
            ],
            turns: [
              {
                authorName: 'Subby',
                createdAt: Date.parse('2026-05-25T12:00:01.000Z'),
                id: 'turn-1',
                role: 'user',
                scopeKey: 'local:persona:hikari-context',
                text: 'Please remember Ladybug memory.',
              },
            ],
            emotionIntensities: [
              {
                emotionStateId: 'emotion:local:persona:hikari-context',
                id: 'emotion-focused',
                intensity: 6,
                name: 'focused',
                scopeKey: 'local:persona:hikari-context',
                updatedAt: Date.parse('2026-05-25T12:00:00.000Z'),
              },
            ],
            emotions: [
              {
                id: 'emotion:local:persona:hikari-context',
                lastSignalSource: 'diary:diary-1',
                scopeKey: 'local:persona:hikari-context',
                updatedAt: Date.parse('2026-05-25T12:00:00.000Z'),
              },
            ],
            relationshipFacts: [
              {
                id: 'fact-1',
                scopeKey: 'local:persona:hikari-context',
                text: 'Subby prefers Ladybug memory first.',
              },
            ],
            relationships: [
              {
                id: 'relationship-1',
                mood: 'focused',
                relationshipStage: 'familiar',
                scopeKey: 'local:persona:hikari-context',
                summary: 'Local chat is auditing Ladybug memory.',
              },
            ],
            semantic: [
              {
                id: 'semantic-1',
                personaId: 'hikari-context',
                text: 'User: remember Ladybug semantic memory.',
              },
            ],
            slotPatches: [
              {
                createdAt: Date.parse('2026-05-25T12:00:04.000Z'),
                id: 'patch-1',
                operation: 'merge',
                participantKey: 'local:local:subby',
                scopeKey: 'local:persona:hikari-context',
                slotId: 'slot-1',
                slotName: 'preferences',
              },
            ],
            slots: [
              {
                id: 'slot-1',
                itemCount: 1,
                items: ['Subby prefers Ladybug memory first.'],
                participantKey: 'local:local:subby',
                slotName: 'preferences',
                scopeKey: 'local:persona:hikari-context',
                updatedAt: Date.parse('2026-05-25T12:00:02.000Z'),
              },
            ],
            traces: [
              {
                beatType: 'relationship',
                createdAt: Date.parse('2026-05-25T12:00:05.000Z'),
                id: 'trace-1',
                model: 'gpt-5-nano',
                prompt: 'New messages to process for Hikari.',
                provider: 'vercel-gateway',
                scopeKey: 'local:persona:hikari-context',
                systemPrompt: 'You are the background sleep-time memory agent.',
                taskType: 'extraction',
              },
            ],
            vectors: [
              {
                id: 'vector-1',
                personaId: 'hikari-context',
                text: 'User: remember Ladybug vector memory.',
              },
            ],
          },
          scopes: [
            {
              channel: 'local',
              id: 'local:persona:hikari-context',
              personaId: 'hikari-context',
              source: 'local',
            },
          ],
        }}
        memoryPromptDebug={{
          grilloContextPacket: {
            background_information: ['scope_key: local:persona:hikari-context'],
            channel_history: ['Subby: Do you remember Ladybug?'],
            output_description: ['Use native GRILLO packet context.'],
            recalled_memories: ['[candidate:fact] Subby asked me to remember Ladybug.'],
            relationship_memory: ['[slot:preferences] Subby prefers Ladybug memory first.'],
            thoughts: ['[diary:relationship] I should keep this memory visible.'],
          },
          grilloDiaryThoughts: ['I should keep this memory visible.'],
          grilloRecalledMemories: ['Subby asked me to remember Ladybug.'],
          grilloRelationshipMemory: ['Subby prefers Ladybug memory first.'],
          semanticMemoryContext: '1. User: remember Ladybug vector memory.',
          source: 'local',
          stateKey: 'local:persona:hikari-context',
          turnText: 'Do you remember Ladybug?',
          updatedAt: Date.parse('2026-05-25T12:00:00.000Z'),
        }}
        memoryWorkerDebug={{
          model: 'gpt-5-nano',
          processedChatTurnCount: 1,
          reason: 'chat-cadence',
          stateKey: 'local:persona:hikari-context',
          status: 'updated',
          toolCalls: 2,
          updatedAt: Date.parse('2026-05-25T12:00:00.000Z'),
        }}
        messageCount={1}
        modelsError={null}
        modelsLoading={false}
        onClearChat={vi.fn()}
        onClearDraft={vi.fn()}
        onClearMemory={vi.fn()}
        onRefreshModels={vi.fn()}
        onResetContext={vi.fn()}
        onRunBackendGrilloBeat={vi.fn()}
        onRunBackendGrilloCompaction={vi.fn()}
        onRunBackendGrilloConsolidation={vi.fn()}
        onRunBackendGrilloSemanticIndexing={vi.fn()}
        onRunBackendGrilloTick={vi.fn()}
        onRunMemoryAgent={vi.fn()}
        relationshipMemory={{
          ...createDefaultRelationshipMemory(),
          facts: ['Subby prefers Ladybug memory first.'],
          mood: 'curious',
          relationshipStage: 'familiar',
          summary: 'Local chat is auditing Ladybug memory.',
          trust: 8,
          turnCount: 1,
        }}
        setAiSettings={vi.fn()}
      />,
    );

    expect(html).toContain('Backend:');
    expect(html).toContain('ladybug');
    expect(html).toContain('Database path:');
    expect(html).toContain('C:/tmp/webwaifu4-memory.db');
    expect(html).toContain('Backend GRILLO runtime');
    expect(html).toContain('Run Consolidation');
    expect(html).toContain('Run Compaction');
    expect(html).toContain('manual only');
    expect(html).toContain('worker_tasks_not_wired');
    expect(html).toContain('/ reflection / tools 2');
    expect(html).toContain('G.R.I.L.L.O.');
    expect(html).toContain('G.R.I.L.L.O. lane snapshot');
    expect(html).toContain('Local');
    expect(html).toContain('Chat lane: vercel-gateway / openai/gpt-5-nano');
    expect(html).toContain('GRILLO lane: vercel-gateway / openai/gpt-5-nano / max tool rounds 15');
    expect(html).toContain('Embedding lane: browser');
    expect(html).toContain('Turn cadence: 2/7 current scope / 2 all scopes / 1 chat messages');
    expect(html).toContain('GRILLO Trace Inspector');
    expect(html).toContain('Last worker prompt');
    expect(html).toContain('New messages to process for Hikari.');
    expect(html).toContain('Last worker output');
    expect(html).toContain('Reflect on the latest memory turn.');
    expect(html).toContain('Clear GRILLO Memory');
    expect(html).toContain('Reset Chat Context');
    expect(html).toContain('current scope&#x27;s durable relationship');
    expect(html).toContain('Grillo scopes:');
    expect(html).toContain('Semantic scopes:');
    expect(html).toContain('Turn events:');
    expect(html).toContain('Memory slots:');
    expect(html).toContain('Slot patches:');
    expect(html).toContain('GRILLO activities:');
    expect(html).toContain('Worker traces:');
    expect(html).toContain('Vector records:');
    expect(html).toContain('Relationship facts:');
    expect(html).toContain('Graph relations');
    expect(html).toContain('HAS_VECTOR: 2');
    expect(html).toContain('Subby');
    expect(html).toContain('Persona');
    expect(html).toContain('Graph turn');
    expect(html).toContain('Please remember Ladybug memory.');
    expect(html).toContain('Graph candidate');
    expect(html).toContain('Subby asked me to remember Ladybug.');
    expect(html).toContain('preferences');
    expect(html).toContain('Slot patch');
    expect(html).toContain('Graph diary');
    expect(html).toContain('Subby verified memory.');
    expect(html).toContain('GRILLO activity');
    expect(html).toContain('Wrote a relationship reflection.');
    expect(html).toContain('Worker trace');
    expect(html).toContain('vercel-gateway / gpt-5-nano / relationship');
    expect(html).toContain('Semantic record');
    expect(html).toContain('Vector record');
    expect(html).toContain('Last Prompt Injection');
    expect(html).toContain('native_grillo_context_packet');
    expect(html).toContain('scope_key: local:persona:hikari-context');
    expect(html).toContain('[slot:preferences] Subby prefers Ladybug memory first.');
    expect(html).toContain('relationship_memory');
    expect(html).toContain('semantic_memory');
    expect(html).toContain('semantic recall');
  });

  it('keeps the selected safe memory worker model visible when it is missing from the refreshed provider list', () => {
    const html = renderToStaticMarkup(
      <ContextTab
        aiSettings={{
          ...createDefaultAiSettings(),
          memoryAgentModel: 'gpt-5-nano',
        }}
        availableModels={['gpt-5-mini', 'o1-pro-2025-03-19']}
        backendGrilloTickBusy={false}
        chatDraftLength={0}
        currentModeLabel="Queue"
        grilloRuntimeStatus={null}
        grilloMemoryState={createDefaultGrilloMemoryState('local:persona:hikari-context')}
        memoryAgentBusy={false}
        memoryAgentPendingCounts={{}}
        memoryAgentStatus="Memory worker ready."
        memoryBackendStatus={null}
        memoryEmbeddingDebug={null}
        memoryGraphSummary={null}
        memoryPromptDebug={null}
        memoryWorkerDebug={null}
        messageCount={0}
        modelsError={null}
        modelsLoading={false}
        onClearChat={vi.fn()}
        onClearDraft={vi.fn()}
        onClearMemory={vi.fn()}
        onRefreshModels={vi.fn()}
        onResetContext={vi.fn()}
        onRunBackendGrilloBeat={vi.fn()}
        onRunBackendGrilloCompaction={vi.fn()}
        onRunBackendGrilloConsolidation={vi.fn()}
        onRunBackendGrilloSemanticIndexing={vi.fn()}
        onRunBackendGrilloTick={vi.fn()}
        onRunMemoryAgent={vi.fn()}
        relationshipMemory={createDefaultRelationshipMemory()}
        setAiSettings={vi.fn()}
      />,
    );

    expect(html).toContain('gpt-5-nano');
    expect(html).toContain('gpt-5-mini');
    expect(html).not.toContain('o1-pro-2025-03-19');
  });
});
