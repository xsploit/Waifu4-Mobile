import { rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { GrilloWorkerService, type GrilloWorkerCompletionRequest } from './GrilloWorkerService';
import { LadybugMemoryService } from './LadybugMemoryService';

const dbPaths: string[] = [];

function createServices() {
  const dbPath = join(tmpdir(), `webwaifu4-grillo-worker-test-${process.pid}-${randomUUID()}.db`);
  dbPaths.push(dbPath);
  const memory = new LadybugMemoryService(dbPath);
  let id = 0;
  const grillo = new GrilloWorkerService(
    memory,
    () => 1770000000000,
    () => `id-${++id}`,
  );
  return { grillo, memory };
}

afterEach(async () => {
  await Promise.all(
    dbPaths.splice(0).map(async (dbPath) => {
      await rm(dbPath, { force: true }).catch(() => undefined);
      await rm(`${dbPath}.wal`, { force: true }).catch(() => undefined);
      await rm(`${dbPath}.json`, { force: true }).catch(() => undefined);
    }),
  );
});

describe('GrilloWorkerService', () => {
  it('ingests a local turn pair as native Ladybug GRILLO turn events', async () => {
    const { grillo, memory } = createServices();
    try {
      const result = await grillo.ingestTurnPair({
        assistantName: 'Hikari-chan',
        assistantText: 'I will remember that clean memory matters.',
        authorName: 'Subsect',
        channelId: 'local',
        createdAt: 1770000001000,
        participantKey: 'local:local:subsect',
        scopeKey: 'local:persona:hikari-chan',
        source: 'local',
        userText: 'remember that clean memory matters',
      });

      const graph = await memory.getGraphSummary();
      const ledger = await grillo.getEvidenceLedgerReplay('local:persona:hikari-chan');
      const projection = await grillo.getEvidenceLedgerProjection('local:persona:hikari-chan');

      expect(result.turnIds).toEqual(['id-1', 'id-2']);
      expect(ledger.evidence).toEqual([
        expect.objectContaining({
          content: 'remember that clean memory matters',
          id: 'id-1',
          role: 'user',
          scopeKey: 'local:persona:hikari-chan',
        }),
        expect.objectContaining({
          content: 'I will remember that clean memory matters.',
          id: 'id-2',
          role: 'assistant',
          scopeKey: 'local:persona:hikari-chan',
        }),
      ]);
      expect(projection.beliefs).toEqual([]);
      expect(projection.provenance.evidenceIds).toEqual(['id-1', 'id-2']);
      expect(graph.recent.turns).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            authorName: 'Subsect',
            role: 'user',
            text: 'remember that clean memory matters',
          }),
          expect.objectContaining({
            authorName: 'Hikari-chan',
            role: 'assistant',
            text: 'I will remember that clean memory matters.',
          }),
        ]),
      );
      expect(graph.edges.map((edge) => edge.relation)).toContain('HAS_TURN');
    } finally {
      await memory.close();
    }
  });

  it('runs a manual extraction pass through Ladybug candidates, diary, slots, activity, and traces', async () => {
    const { grillo, memory } = createServices();
    try {
      const result = await grillo.runManualExtraction({
        beatType: 'relationship',
        candidate: {
          confidence: 0.88,
          content: 'Subsect wants backend-owned GRILLO memory.',
          summary: 'Subsect wants GRILLO owned by the backend.',
          type: 'goal',
        },
        diary: {
          personalThought: 'I should treat backend GRILLO as the source of durable memory.',
          summary: 'Subsect clarified GRILLO ownership.',
          tags: ['grillo', 'backend'],
        },
        participantKey: 'local:local:subsect',
        responseText: 'Manual extraction wrote the backend ownership memory.',
        scopeKey: 'local:persona:hikari-chan',
        slot: {
          items: ['Subsect wants backend-owned GRILLO memory.'],
          operation: 'merge',
          slotName: 'ongoing_threads',
          sourceCandidateIds: ['id-2'],
        },
        trace: {
          model: 'gpt-5-nano',
          prompt: 'New messages to process...',
          provider: 'vercel-gateway',
          systemPrompt: 'You are the background sleep-time memory agent.',
        },
      });

      const graph = await memory.getGraphSummary();

      expect(result).toMatchObject({
        activityId: 'id-5',
        beatType: 'relationship',
        candidateIds: ['id-2'],
        diaryIds: ['id-3'],
        slotIds: ['local:persona:hikari-chan:ongoing_threads'],
        traceId: 'id-1',
        writes: 3,
      });
      expect(graph.recent.candidates[0]?.summary).toBe(
        'Subsect wants GRILLO owned by the backend.',
      );
      expect(graph.recent.diary[0]?.summary).toBe('Subsect clarified GRILLO ownership.');
      expect(graph.recent.slots[0]).toMatchObject({
        itemCount: 1,
        slotName: 'ongoing_threads',
      });
      expect(graph.recent.activities[0]).toMatchObject({
        responseText: 'Manual extraction wrote the backend ownership memory.',
      });
      expect(graph.recent.traces[0]).toMatchObject({
        model: 'gpt-5-nano',
        provider: 'vercel-gateway',
        taskType: 'manual_extraction',
      });

      await memory.saveRelationshipProfiles({
        'local:persona:hikari-chan': {
          facts: ['Subsect wants backend-owned GRILLO memory.'],
          mood: 'focused',
          relationshipStage: 'familiar',
          summary: 'Subsect is verifying native GRILLO context packets.',
        },
      });
      await memory.saveSemanticRecords('local:persona:hikari-chan', [
        {
          assistantText: 'Native context packet acknowledged.',
          createdAt: 1770000002000,
          embedding: [1, 0, 0],
          id: 'semantic-1',
          personaId: 'hikari-chan',
          scopeKey: 'local:persona:hikari-chan',
          text: 'User: native GRILLO packet\nHikari: Native context packet acknowledged.',
          userText: 'native GRILLO packet',
        },
      ]);

      const packet = await grillo.buildContextPacket({
        includeProvenanceReceipt: true,
        participantKeys: ['local:local:subsect'],
        query: 'native GRILLO packet',
        scopeKey: 'local:persona:hikari-chan',
      });
      const defaultPacket = await grillo.buildContextPacket({
        participantKeys: ['local:local:subsect'],
        query: 'native GRILLO packet',
        scopeKey: 'local:persona:hikari-chan',
      });

      expect(packet.background_information).toContain('scope_key: local:persona:hikari-chan');
      expect(packet.relationship_memory.join('\n')).toContain(
        'Subsect is verifying native GRILLO context packets.',
      );
      expect(packet.relationship_memory.join('\n')).toContain(
        '[slot:ongoing_threads local:local:subsect] Subsect wants backend-owned GRILLO memory.',
      );
      expect(packet.recalled_memories.map((item) => item.text).join('\n')).toContain(
        'Subsect wants GRILLO owned by the backend.',
      );
      expect(packet.recalled_memories.map((item) => item.text).join('\n')).toContain(
        'Native context packet acknowledged.',
      );
      expect(packet.thoughts.join('\n')).toContain(
        'I should treat backend GRILLO as the source of durable memory.',
      );
      expect(packet.provenance_receipt).toMatchObject({
        stage: 'server_context_packet',
        version: '1.0.0',
      });
      const diagnosis = await grillo.diagnoseContextPacket({
        participantKeys: ['local:local:subsect'],
        query: 'native GRILLO packet',
        scopeKey: 'local:persona:hikari-chan',
      });
      expect(diagnosis.receipt).toMatchObject({
        intents: ['general'],
        status: 'sufficient',
        version: '1.0.0',
      });
      expect(packet.provenance_receipt?.lanes.channel_history.includedOccurrences).toHaveLength(
        packet.channel_history.length,
      );
      expect(packet.provenance_receipt?.lanes.relationship_memory.includedIds).toEqual(
        expect.arrayContaining([
          'profile:local:persona:hikari-chan:state',
          'profile:local:persona:hikari-chan:summary',
          'profile:local:persona:hikari-chan:facts',
        ]),
      );
      expect(packet.provenance_receipt?.lanes.recalled_memories.includedIds).toEqual(
        packet.recalled_memories.map((item) => item.id),
      );
      expect(packet.provenance_receipt?.lanes.thoughts.includedOccurrences).toHaveLength(
        packet.thoughts.length,
      );
      expect(defaultPacket.provenance_receipt).toBeUndefined();
      expect('memory_sufficiency_receipt' in packet).toBe(false);
      expect('memory_sufficiency_receipt' in defaultPacket).toBe(false);
      expect({
        channel_history: packet.channel_history,
        recalled_memories: packet.recalled_memories,
        relationship_memory: packet.relationship_memory,
        thoughts: packet.thoughts,
      }).toEqual({
        channel_history: defaultPacket.channel_history,
        recalled_memories: defaultPacket.recalled_memories,
        relationship_memory: defaultPacket.relationship_memory,
        thoughts: defaultPacket.thoughts,
      });
    } finally {
      await memory.close();
    }
  });

  it('reports server lane filtering and caps without changing rendered packet text', async () => {
    const { grillo, memory } = createServices();
    const scopeKey = 'local:persona:provenance-caps';
    const participantKey = 'local:local:subsect';
    try {
      for (let index = 0; index < 16; index += 1) {
        await memory.appendGrilloRecord('turn_events', {
          content: `turn ${index}`,
          created_at: index + 1,
          role: 'user',
          scope_key: scopeKey,
          turn_id: `turn-${index}`,
        });
      }
      for (let index = 0; index < 10; index += 1) {
        await memory.appendGrilloRecord('memory_blocks', {
          block_id: `block-${index}`,
          block_name: 'preferences',
          items: Array.from({ length: 7 }, (_, itemIndex) => `item ${index}-${itemIndex}`),
          participant_key: participantKey,
          scope_key: scopeKey,
          updated_at: 100 - index,
        });
      }
      await memory.appendGrilloRecord('memory_blocks', {
        block_id: 'block-other',
        block_name: 'preferences',
        items: ['other participant'],
        participant_key: 'local:local:other',
        scope_key: scopeKey,
        updated_at: 200,
      });
      for (let index = 0; index < 10; index += 1) {
        await memory.appendGrilloRecord('memory_candidates', {
          candidate_id: `candidate-${index}`,
          confidence: 1 - index * 0.01,
          created_at: 100 - index,
          participant_key: participantKey,
          scope_key: scopeKey,
          summary: `candidate ${index}`,
          type: 'fact',
        });
      }
      await memory.appendGrilloRecord('memory_candidates', {
        candidate_id: 'candidate-other',
        confidence: 1,
        created_at: 200,
        participant_key: 'local:local:other',
        scope_key: scopeKey,
        summary: 'other participant candidate',
        type: 'fact',
      });
      for (let index = 0; index < 7; index += 1) {
        await memory.appendGrilloRecord('diary_entries', {
          created_at: 100 - index,
          diary_id: `diary-${index}`,
          participant_key: participantKey,
          personal_thought: `thought ${index}`,
          scope_key: scopeKey,
        });
      }
      await memory.appendGrilloRecord('diary_entries', {
        created_at: 200,
        diary_id: 'diary-other',
        participant_key: 'local:local:other',
        personal_thought: 'other participant thought',
        scope_key: scopeKey,
      });

      const packet = await grillo.buildContextPacket({
        includeProvenanceReceipt: true,
        participantKeys: [participantKey],
        scopeKey,
      });
      const receipt = packet.provenance_receipt!;

      expect(packet.channel_history).toHaveLength(14);
      expect(receipt.lanes.channel_history.dropped).toEqual([
        expect.objectContaining({ id: 'turn:turn-0', reason: 'lane_limit' }),
        expect.objectContaining({ id: 'turn:turn-1', reason: 'lane_limit' }),
      ]);
      expect(packet.relationship_memory).toHaveLength(16);
      expect(receipt.lanes.relationship_memory.dropped).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'block:block-other:item:0', reason: 'participant_filter' }),
          expect.objectContaining({ id: 'block:block-8:item:0', reason: 'record_limit' }),
          expect.objectContaining({ id: 'block:block-9:item:0', reason: 'record_limit' }),
          expect.objectContaining({ id: 'block:block-0:item:5', reason: 'item_limit' }),
          expect.objectContaining({ id: 'block:block-3:item:1', reason: 'lane_limit' }),
        ]),
      );
      expect(packet.thoughts).toHaveLength(5);
      expect(receipt.lanes.thoughts.dropped).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'diary:diary-other', reason: 'participant_filter' }),
          expect.objectContaining({ id: 'diary:diary-5', reason: 'record_limit' }),
          expect.objectContaining({ id: 'diary:diary-6', reason: 'record_limit' }),
        ]),
      );
      expect(receipt.lanes.relationship_memory.includedOccurrences).toHaveLength(
        packet.relationship_memory.length,
      );
      expect(receipt.lanes.recalled_memories.dropped).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'candidate-other', reason: 'participant_filter' }),
          expect.objectContaining({ id: 'candidate-8', reason: 'record_limit' }),
          expect.objectContaining({ id: 'candidate-9', reason: 'record_limit' }),
        ]),
      );
    } finally {
      await memory.close();
    }
  });

  it('uses deterministic collision-resistant provenance IDs for legacy records without IDs', async () => {
    const { grillo, memory } = createServices();
    const scopeKey = 'local:persona:legacy-provenance';
    try {
      await memory.appendGrilloRecord('turn_events', {
        content: 'first legacy turn',
        created_at: 100,
        role: 'user',
        scope_key: scopeKey,
      });
      await memory.appendGrilloRecord('turn_events', {
        content: 'second legacy turn',
        created_at: 100,
        role: 'user',
        scope_key: scopeKey,
      });

      const first = await grillo.buildContextPacket({ includeProvenanceReceipt: true, scopeKey });
      const second = await grillo.buildContextPacket({ includeProvenanceReceipt: true, scopeKey });
      const firstIds = first.provenance_receipt!.lanes.channel_history.includedOccurrences;
      const secondIds = second.provenance_receipt!.lanes.channel_history.includedOccurrences;

      expect(firstIds).toHaveLength(2);
      expect(new Set(firstIds).size).toBe(2);
      expect(firstIds.every((id) => id.startsWith('turn:fallback:'))).toBe(true);
      expect(secondIds).toEqual(firstIds);
    } finally {
      await memory.close();
    }
  });

  it('runs core worker tools against Ladybug and records tool telemetry', async () => {
    const { grillo, memory } = createServices();
    try {
      const scopeKey = 'local:persona:hikari-chan';
      const participantKey = 'local:local:subsect';

      const ingested = await grillo.ingestTurnPair({
        assistantText: 'I will keep the worker tools inspectable.',
        participantKey,
        scopeKey,
        source: 'local',
        userText: 'I prefer direct technical memory checks.',
      });
      const claimWrite = await grillo.runWorkerTool({
        args: {
          confidence: 0.95,
          evidence_turn_ids: [ingested.turnIds[0]],
          kind: 'preference',
          predicate: 'memory_check_style',
          subject: participantKey,
          value: 'Subsect likes direct technical memory checks.',
        },
        name: 'core.worker_claim_propose',
        participantKey,
        scopeKey,
      });

      const memoryWrite = await grillo.runWorkerTool({
        args: {
          block_name: 'preferences',
          items: ['Subsect likes direct technical memory checks.'],
          operation: 'merge',
          source_candidate_ids: ['cand-existing'],
        },
        name: 'core.worker_memory_write',
        participantKey,
        scopeKey,
      });
      const candidateWrite = await grillo.runWorkerTool({
        args: {
          confidence: 0.91,
          content: 'Subsect wants GRILLO worker tools backed by Ladybug.',
          summary: 'Subsect wants native Ladybug worker tools.',
          type: 'goal',
        },
        name: 'core.worker_candidate_write',
        participantKey,
        scopeKey,
      });
      const diaryWrite = await grillo.runWorkerTool({
        args: {
          beat_type: 'reflection',
          personal_thought: 'I should keep GRILLO tool writes visible and inspectable.',
          summary: 'GRILLO tool writes should be inspectable.',
          tags: ['grillo', 'tools'],
        },
        name: 'core.worker_diary_write',
        participantKey,
        scopeKey,
      });
      const profilePatch = await grillo.runWorkerTool({
        args: {
          field: 'active_threads',
          operation: 'add',
          value: 'native GRILLO worker tools',
        },
        name: 'core.worker_profile_patch',
        participantKey,
        scopeKey,
      });
      const archivalWrite = await grillo.runWorkerTool({
        args: {
          text: 'Native GRILLO worker tools use Ladybug records.',
        },
        name: 'core.worker_memory_insert_archival',
        participantKey,
        scopeKey,
      });
      const memoryRead = await grillo.runWorkerTool({
        args: { block_name: 'preferences' },
        name: 'core.worker_memory_read',
        participantKey,
        scopeKey,
      });
      const search = await grillo.runWorkerTool({
        args: { limit: 10, query: 'technical memory checks Ladybug worker tools' },
        name: 'core.worker_memory_search',
        participantKey,
        scopeKey,
      });
      const candidateList = await grillo.runWorkerTool({
        args: { type_filter: 'goal' },
        name: 'core.worker_candidate_list',
        participantKey,
        scopeKey,
      });

      expect(memoryWrite.ok).toBe(true);
      expect(claimWrite).toMatchObject({
        ok: true,
        result: { operation: 'ADD', outcome: 'applied' },
      });
      expect(candidateWrite.ok).toBe(true);
      expect(diaryWrite.ok).toBe(true);
      expect(profilePatch.ok).toBe(true);
      expect(archivalWrite.ok).toBe(true);
      expect(memoryRead.result).toMatchObject({
        claims: [
          expect.objectContaining({
            effectiveValue: 'Subsect likes direct technical memory checks.',
            predicate: 'memory_check_style',
          }),
        ],
        slots: [
          expect.objectContaining({
            items: ['Subsect likes direct technical memory checks.'],
            slot_name: 'preferences',
          }),
        ],
      });
      expect(String(JSON.stringify(search.result))).toContain('native Ladybug worker tools');
      expect(String(JSON.stringify(search.result))).toContain('Native GRILLO worker tools use Ladybug records');
      expect(String(JSON.stringify(search.result))).toContain('direct technical memory checks');
      expect(candidateList.result).toMatchObject({
        candidates: [expect.objectContaining({ summary: 'Subsect wants native Ladybug worker tools.' })],
      });
      const coverage = await grillo.getEvidenceProjectionCoverage(scopeKey);
      expect(coverage).toMatchObject({
        ready: false,
        coverage: { exact: 0, total: 3, valueOnly: 2 },
        legacyDrift: [],
      });

      const graph = await memory.getGraphSummary();
      const activities = await memory.readGrilloRecords<Record<string, unknown>>(
        'grillo_activity_log',
      );
      expect(
        activities.filter((row) => row['beat_type'] === 'worker_tool'),
      ).toHaveLength(9);
      expect(graph.recent.activities.filter((row) => row.beatType === 'worker_tool')).toHaveLength(8);
      expect(graph.edges.map((edge) => edge.relation)).toEqual(
        expect.arrayContaining(['HAS_BLOCK', 'HAS_SLOT', 'HAS_SLOT_PATCH', 'HAS_ACTIVITY']),
      );

      const packet = await grillo.buildContextPacket({
        participantKeys: [participantKey],
        query: 'Ladybug worker tools',
        scopeKey,
      });
      expect(packet.relationship_memory.join('\n')).toContain(
        'Subsect likes direct technical memory checks.',
      );
      expect(packet.recalled_memories.map((item) => item.text).join('\n')).toContain(
        'Subsect wants native Ladybug worker tools.',
      );
      expect(packet.thoughts.join('\n')).toContain(
        'I should keep GRILLO tool writes visible and inspectable.',
      );
    } finally {
      await memory.close();
    }
  });

  it('lets GRILLO worker tools read and update canonical emotion state', async () => {
    const { grillo, memory } = createServices();
    try {
      const scopeKey = 'local:persona:hikari-chan';
      const participantKey = 'local:local:subsect';

      const firstUpdate = await grillo.runWorkerTool({
        args: {
          intensities: { guarded: 2, happy: 3 },
          last_signal_source: 'tool-test-first',
          operation: 'replace',
        },
        name: 'core.worker_emotion_update',
        participantKey,
        scopeKey,
      });
      const firstRead = await grillo.runWorkerTool({
        args: {},
        name: 'core.worker_emotion_read',
        participantKey,
        scopeKey,
      });
      const secondUpdate = await grillo.runWorkerTool({
        args: {
          intensities: { curious: 4, happy: 6 },
          last_signal_source: 'tool-test-second',
          operation: 'merge',
        },
        name: 'core.worker_emotion_update',
        participantKey,
        scopeKey,
      });
      const secondRead = await grillo.runWorkerTool({
        args: {},
        name: 'core.worker_emotion_read',
        participantKey,
        scopeKey,
      });

      expect(firstUpdate.ok).toBe(true);
      expect(firstRead.result).toMatchObject({
        emotion_state: {
          intensities: { guarded: 2, happy: 3 },
          last_signal_source: 'tool-test-first',
          scope_key: scopeKey,
        },
      });
      expect(secondUpdate.result).toMatchObject({
        emotion_state: {
          intensities: { curious: 4, guarded: 2, happy: 6 },
          last_signal_source: 'tool-test-second',
          scope_key: scopeKey,
        },
      });
      expect(secondRead.result).toMatchObject({
        emotion_state: {
          intensities: { curious: 4, guarded: 2, happy: 6 },
          last_signal_source: 'tool-test-second',
          scope_key: scopeKey,
        },
      });

      const records = await memory.readGrilloRecords<Record<string, unknown>>('emotion_states');
      const graph = await memory.getGraphSummary();
      const status = await memory.getStatus();

      expect(records).toHaveLength(1);
      expect(status.emotionStates).toBe(1);
      expect(status.emotionIntensities).toBe(3);
      expect(graph.recent.emotions[0]).toMatchObject({
        id: `emotion:${scopeKey}`,
        lastSignalSource: 'tool-test-second',
        scopeKey,
      });
      expect(graph.recent.emotionIntensities.map((row) => row.name).sort()).toEqual([
        'curious',
        'guarded',
        'happy',
      ]);
      expect(graph.recent.activities.filter((row) => row.beatType === 'worker_tool')).toHaveLength(4);
    } finally {
      await memory.close();
    }
  });

  it('runs backend extraction ticks from native turn pairs into context-visible memory', async () => {
    const { grillo, memory } = createServices();
    try {
      const scopeKey = 'local:persona:hikari-chan';
      const participantKey = 'local:local:subsect';

      await grillo.ingestTurnPair({
        assistantName: 'Hikari-chan',
        assistantText: 'I will keep the GRILLO backend thread visible.',
        authorName: 'Subsect',
        channelId: 'local',
        createdAt: 1770000001000,
        participantKey,
        scopeKey,
        source: 'local',
        userText: 'backend grillo extraction should remember this thread',
      });

      const firstTick = await grillo.runTick({
        reason: 'manual_test',
        scopeKey,
      });

      expect(firstTick).toMatchObject({
        noOpReason: '',
        ok: true,
        reason: 'manual_test',
        writes: 3,
      });

      const graph = await memory.getGraphSummary();
      expect(graph.recent.traces[0]).toMatchObject({
        model: 'native-extraction',
        provider: 'backend',
        taskType: 'extraction',
      });
      expect(graph.recent.candidates[0]?.summary).toContain(
        'backend grillo extraction should remember this thread',
      );
      expect(graph.recent.diary[0]?.summary).toBe('Processed a recent exchange with Subsect.');
      expect(graph.recent.slots[0]).toMatchObject({
        itemCount: 1,
        slotName: 'open_threads',
      });
      expect(graph.recent.activities.some((row) => row.beatType === 'worker_tick')).toBe(true);
      expect(graph.recent.activities.filter((row) => row.beatType === 'worker_tool')).toHaveLength(
        3,
      );

      const packet = await grillo.buildContextPacket({
        participantKeys: [participantKey],
        query: 'backend grillo extraction',
        scopeKey,
      });
      expect(packet.recalled_memories.map((item) => item.text).join('\n')).toContain(
        'backend grillo extraction should remember this thread',
      );
      expect(packet.relationship_memory.join('\n')).toContain('[slot:open_threads');
      expect(packet.thoughts.join('\n')).toContain(
        'I should remember this recent exchange with Subsect',
      );

      await expect(grillo.runTick({ reason: 'manual_test', scopeKey })).resolves.toMatchObject({
        noOpReason: 'no_new_turn_pairs',
        writes: 0,
      });
    } finally {
      await memory.close();
    }
  });

  it('runs LLM-guided backend extraction ticks through the memory lane tool loop', async () => {
    const { grillo, memory } = createServices();
    const requests: Array<{
      maxToolRounds: number;
      messages: Array<{ content: string; role: string }>;
      responseFormat: GrilloWorkerCompletionRequest['responseFormat'];
      stateKey: string;
      stateScope: string;
      toolChoiceMode: string;
    }> = [];
    try {
      const scopeKey = 'local:persona:hikari-chan';
      const participantKey = 'local:local:subsect';

      await grillo.ingestTurnPair({
        assistantName: 'Hikari-chan',
        assistantText: 'I will keep backend memory lane extraction grounded.',
        authorName: 'Subsect',
        channelId: 'local',
        createdAt: 1770000001000,
        participantKey,
        scopeKey,
        source: 'local',
        userText: 'remember that backend memory lane should use worker tools',
      });

      const tick = await grillo.runTickWithOptions(
        {
          reason: 'manual_test',
          scopeKey,
        },
        {
          completion: async (request) => {
            requests.push({
              maxToolRounds: request.maxToolRounds,
              messages: request.messages.map((message) => ({ ...message })),
              responseFormat: request.responseFormat,
              stateKey: request.stateKey,
              stateScope: request.stateScope,
              toolChoiceMode: request.toolChoiceMode,
            });
            if (requests.length === 1) {
              return {
                meta: { model: 'openai/gpt-5-nano', provider: 'vercel-gateway' },
                text: JSON.stringify({
                  candidate: null,
                  diary: null,
                  done: false,
                  memory: null,
                  notes: 'writing grounded worker memories',
                  relationship: null,
                  toolCalls: [
                    {
                      args: {
                        confidence: 0.9,
                        content: 'Subsect wants backend GRILLO extraction to use the memory lane and worker tools.',
                        summary: 'Subsect wants backend memory-lane worker tools.',
                        tags: ['grillo', 'memory-lane'],
                        type: 'goal',
                      },
                      name: 'core.worker_candidate_write',
                    },
                    {
                      args: {
                        beat_type: 'extraction',
                        personal_thought: 'I should use the backend memory lane and real worker tools for GRILLO extraction.',
                        summary: 'Backend memory-lane extraction was requested.',
                        tags: ['grillo', 'reflection'],
                      },
                      name: 'core.worker_diary_write',
                    },
                    {
                      args: {
                        confidence: 0.9,
                        kind: 'goal',
                        predicate: 'memory_architecture',
                        subject: participantKey,
                        value: 'Use backend GRILLO memory-lane worker tools.',
                      },
                      name: 'core.worker_claim_propose',
                    },
                    {
                      args: {
                        confidence: 0.5,
                        evidence_turn_ids: ['missing-turn'],
                        kind: 'fact',
                        predicate: 'unsupported_memory',
                        subject: participantKey,
                        value: true,
                      },
                      name: 'core.worker_claim_propose',
                    },
                  ],
                }),
              };
            }
            return JSON.stringify({
              candidate: null,
              diary: null,
              done: true,
              memory: null,
              notes: 'done',
              relationship: null,
              toolCalls: [],
            });
          },
          maxToolRounds: 15,
          model: 'openai/gpt-5-nano',
          provider: 'vercel-gateway',
        },
      );

      expect(tick).toMatchObject({
        noOpReason: '',
        ok: true,
        writes: 3,
      });
      expect(requests[0]).toMatchObject({
        maxToolRounds: 15,
        responseFormat: { type: 'json_object' },
        stateKey: 'memory:local:persona:hikari-chan',
        stateScope: 'memory',
        toolChoiceMode: 'auto',
      });
      expect(requests[0]?.messages[0]?.content).toContain('Available tools:');
      expect(requests[0]?.messages[0]?.content).toContain('core.worker_claim_propose');
      expect(requests[0]?.messages[1]?.content).toContain('source_turn_ids');

      const graph = await memory.getGraphSummary();
      expect(graph.recent.traces[0]).toMatchObject({
        model: 'openai/gpt-5-nano',
        provider: 'vercel-gateway',
        taskType: 'extraction',
      });
      expect(graph.recent.candidates[0]?.summary).toBe(
        'Subsect wants backend memory-lane worker tools.',
      );
      expect(graph.recent.diary[0]?.summary).toBe(
        'Backend memory-lane extraction was requested.',
      );
      expect(graph.recent.activities.filter((row) => row.beatType === 'worker_tool')).toHaveLength(
        4,
      );
      const ledger = await grillo.getEvidenceLedgerReplay(scopeKey);
      expect(ledger.decisions.map((decision) => decision.outcome)).toEqual([
        'applied',
        'deferred',
      ]);
      const projection = await grillo.getEvidenceLedgerProjection(scopeKey);
      expect(projection.beliefs).toEqual([
        expect.objectContaining({
          effectiveValue: 'Use backend GRILLO memory-lane worker tools.',
          evidenceIds: ['id-1', 'id-2'],
          kind: 'goal',
          predicate: 'memory_architecture',
          subject: participantKey,
        }),
      ]);

      await expect(grillo.runTickWithOptions({ reason: 'manual_test', scopeKey })).resolves.toMatchObject({
        noOpReason: 'no_new_turn_pairs',
        writes: 0,
      });
    } finally {
      await memory.close();
    }
  });

  it('serializes guarded evidence migrations and backfills each turn once', async () => {
    const { grillo, memory } = createServices();
    const scopeKey = 'local:persona:hikari-chan';
    try {
      await memory.appendGrilloRecord('turn_events', {
        turn_id: 'legacy-turn-1',
        content: 'A historical turn that predates the evidence ledger.',
        created_at: 1760000000000,
        role: 'user',
        scope_key: scopeKey,
        source: 'local',
      });
      const plan = await grillo.getEvidenceMigrationPlan(scopeKey);
      const request = {
        dryRun: false,
        evidenceGeneration: plan.evidenceGeneration,
        planHash: plan.planHash,
        sourceGeneration: plan.sourceGeneration,
      };
      const results = await Promise.all([
        grillo.applyEvidenceMigration(scopeKey, request),
        grillo.applyEvidenceMigration(scopeKey, request),
      ]);

      expect(results.map((result) => result.status).sort()).toEqual(['completed', 'stale']);
      const replay = await grillo.getEvidenceLedgerReplay(scopeKey);
      expect(replay.evidence.map((record) => record.id)).toEqual(['legacy-turn-1']);
      const receipts = await memory.readGrilloRecords<Record<string, unknown>>('migration_receipts');
      expect(receipts.map((record) => record['event'])).toEqual(['started', 'completed']);

      const freshPlan = await grillo.getEvidenceMigrationPlan(scopeKey);
      expect(
        await grillo.applyEvidenceMigration(scopeKey, {
          dryRun: false,
          evidenceGeneration: freshPlan.evidenceGeneration,
          planHash: freshPlan.planHash,
          sourceGeneration: freshPlan.sourceGeneration,
        }),
      ).toMatchObject({ status: 'already_applied', insertedTurnIds: [] });
      expect(await memory.readGrilloRecords('migration_receipts')).toHaveLength(2);
    } finally {
      await memory.close();
    }
  });

  it('records feedback and applies evidence-backed corrections without changing prompt wiring', async () => {
    const { grillo, memory } = createServices();
    const scopeKey = 'local:persona:hikari-correction';
    const participantKey = 'local:local:subsect';
    try {
      await memory.appendGrilloRecord('evidence_records', {
        id: 'evidence-original',
        content: 'My favorite color is green.',
        createdAt: 10,
        kind: 'turn',
        metadata: {},
        participantKey,
        role: 'user',
        scopeKey,
        source: 'local',
        sourceRecordIds: ['turn-original'],
      });
      await memory.appendGrilloRecord('memory_claims', {
        id: 'claim-color',
        confidence: 0.8,
        createdAt: 11,
        evidenceIds: ['evidence-original'],
        kind: 'preference',
        operation: 'ADD',
        participantKey,
        predicate: 'favorite_color',
        scopeKey,
        subject: 'subsect',
        supersedesRecordIds: [],
        validFrom: 10,
        validTo: null,
        value: 'green',
      });

      const feedback = await grillo.recordMemoryFeedback({
        content: 'That answer used the wrong memory.',
        participantKey,
        scopeKey,
      });
      const correction = await grillo.recordMemoryCorrection({
        content: 'My favorite color is blue now.',
        correctedValue: 'blue',
        participantKey,
        reason: 'The user directly corrected the stored preference.',
        scopeKey,
        targetClaimId: 'claim-color',
      });
      const replay = await grillo.getEvidenceLedgerReplay(scopeKey);

      expect(feedback).toMatchObject({ kind: 'feedback', role: 'user', scopeKey });
      expect(correction.decision).toMatchObject({ outcome: 'applied', operation: 'UPDATE' });
      const repairTasks = await grillo.listRepairQueue(scopeKey, 'open');
      expect(repairTasks).toHaveLength(2);
      expect(repairTasks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            signalKind: 'correction',
            sourceRecordIds: ['claim-color'],
            status: 'open',
          }),
          expect.objectContaining({ signalKind: 'feedback', status: 'open' }),
        ]),
      );
      await grillo.recordMemoryFeedback({
        content: 'A different participant reported an unrelated memory issue.',
        participantKey: 'local:local:someone-else',
        scopeKey,
      });
      const repairList = await grillo.runWorkerTool({
        args: { status: 'open' },
        name: 'core.worker_repair_list',
        participantKey,
        scopeKey,
      });
      const correctionTask = repairTasks.find((task) => task.signalKind === 'correction');
      expect(repairList).toMatchObject({ ok: true, result: { tasks: expect.any(Array) } });
      expect((repairList.result as { tasks: unknown[] }).tasks).toHaveLength(2);
      expect(correctionTask).toBeDefined();
      const repairTransition = await grillo.runWorkerTool({
        args: {
          action: 'resolve',
          summary: 'The evidence-backed correction is reflected in the active claim.',
          task_id: correctionTask?.taskId,
        },
        name: 'core.worker_repair_transition',
        participantKey,
        scopeKey,
      });
      expect(repairTransition).toMatchObject({
        ok: true,
        result: { action: 'resolve', taskId: correctionTask?.taskId },
      });
      expect(await grillo.listRepairQueue(scopeKey, 'resolved')).toEqual([
        expect.objectContaining({ taskId: correctionTask?.taskId, status: 'resolved' }),
      ]);
      expect(replay.activeClaims).toEqual([
        expect.objectContaining({
          effectiveValue: 'blue',
          status: 'corrected',
          claim: expect.objectContaining({ id: 'claim-color' }),
        }),
      ]);
      expect(replay.evidence.map((record) => record.kind)).toEqual([
        'turn',
        'feedback',
        'correction',
      ]);
    } finally {
      await memory.close();
    }
  });

  it('ranks current-query semantic vectors with stable provenance and scope isolation', async () => {
    const { grillo, memory } = createServices();
    const scopeKey = 'local:persona:hikari-vector-recall';
    try {
      await memory.saveSemanticRecords(scopeKey, [
        {
          assistantText: 'You said synthwave helps you focus.',
          createdAt: 1770000001000,
          embedding: [1, 0, 0],
          embeddingModel: 'test-embedding',
          embeddingProvider: 'test-provider',
          embeddingVersion: 'v1',
          id: 'semantic-relevant-older',
          personaId: 'hikari-vector-recall',
          scopeKey,
          sourceTurnIds: ['turn-user-relevant', 'turn-assistant-relevant'],
          text: 'User prefers synthwave while concentrating on code.',
          userText: 'Synthwave helps me focus while coding.',
        },
        {
          assistantText: 'We discussed an unrelated breakfast.',
          createdAt: 1770000009000,
          embedding: [0, 1, 0],
          id: 'semantic-unrelated-newer',
          personaId: 'hikari-vector-recall',
          scopeKey,
          text: 'User ate toast for breakfast.',
          userText: 'I ate toast.',
        },
      ]);
      await memory.saveSemanticRecords('local:persona:other', [
        {
          assistantText: 'This belongs to another persona.',
          createdAt: 1770000010000,
          embedding: [1, 0, 0],
          id: 'semantic-other-scope',
          personaId: 'other',
          scopeKey: 'local:persona:other',
          text: 'Other persona synthwave memory.',
          userText: 'Other scope.',
        },
      ]);

      const packet = await grillo.buildContextPacket({
        embeddingModel: 'test-embedding',
        embeddingProvider: 'test-provider',
        embeddingVersion: 'v1',
        query: 'What music helps me focus while coding?',
        queryEmbedding: [1, 0, 0],
        scopeKey,
      });
      const semanticItems = packet.recalled_memories.filter((item) => item.source === 'semantic');

      expect(semanticItems[0]).toMatchObject({
        embedding: {
          dimensions: 3,
          generation: 'test-provider:test-embedding:v1:3',
        },
        evidenceIds: ['turn-user-relevant', 'turn-assistant-relevant'],
        id: 'semantic-relevant-older',
        scopeKey,
        source: 'semantic',
      });
      expect(semanticItems.map((item) => item.id)).not.toContain('semantic-other-scope');
      expect(packet.retrieval_receipt).toMatchObject({
        embedding: {
          dimensions: 3,
          generation: 'test-provider:test-embedding:v1:3',
        },
        query: 'What music helps me focus while coding?',
        strategy: 'semantic_vector',
      });
      expect(packet.retrieval_receipt.lanes.recalled_memories.includedIds).toEqual(
        packet.recalled_memories.map((item) => item.id),
      );
    } finally {
      await memory.close();
    }
  });

  it('keeps semantic recall isolated to the requested participant', async () => {
    const { grillo, memory } = createServices();
    const scopeKey = 'twitch:channel:collab:persona:hikari';
    const alice = 'twitch:collab:alice';
    try {
      await memory.saveSemanticRecords(scopeKey, [
        {
          assistantText: 'Alice likes synthwave.',
          createdAt: 1770000003000,
          embedding: [1, 0, 0],
          id: 'semantic-alice',
          participantKeys: [alice],
          personaId: 'hikari',
          scopeKey,
          text: 'Alice uses the starlight codeword for synthwave.',
          userText: 'My codeword is starlight.',
        },
        {
          assistantText: 'Bob likes jazz.',
          createdAt: 1770000002000,
          embedding: [1, 0, 0],
          id: 'semantic-bob',
          participantKeys: ['twitch:collab:bob'],
          personaId: 'hikari',
          scopeKey,
          text: 'Bob uses the starlight codeword for jazz.',
          userText: 'My codeword is starlight.',
        },
        {
          assistantText: 'Legacy identity is unknown.',
          createdAt: 1770000001000,
          embedding: [1, 0, 0],
          id: 'semantic-legacy',
          personaId: 'hikari',
          scopeKey,
          text: 'An unknown participant used the starlight codeword.',
          userText: 'Starlight.',
        },
      ]);

      const packet = await grillo.buildContextPacket({
        participantKeys: [alice],
        query: 'starlight codeword',
        queryEmbedding: [1, 0, 0],
        scopeKey,
      });
      expect(
        packet.recalled_memories
          .filter((item) => item.source === 'semantic')
          .map((item) => item.id),
      ).toEqual(['semantic-alice']);

      const workerSearch = await grillo.runWorkerTool({
        args: { query: 'starlight codeword' },
        name: 'core.worker_memory_search',
        participantKey: alice,
        scopeKey,
      });
      expect(workerSearch.ok).toBe(true);
      expect(
        ((workerSearch.result as { results: Array<{ id: string }> }).results ?? []).map(
          (item) => item.id,
        ),
      ).toEqual(['semantic-alice']);
    } finally {
      await memory.close();
    }
  });

  it('uses lexical recall without an embedding instead of arbitrary recent semantic records', async () => {
    const { grillo, memory } = createServices();
    const scopeKey = 'local:persona:hikari-lexical-recall';
    try {
      await memory.saveSemanticRecords(scopeKey, [
        {
          assistantText: 'Older but relevant.',
          createdAt: 1770000001000,
          embedding: null,
          id: 'semantic-older-relevant',
          personaId: 'hikari-lexical-recall',
          scopeKey,
          text: 'The preferred deployment target is Oracle Cloud ARM.',
          userText: 'Use Oracle Cloud ARM for deployment.',
        },
        {
          assistantText: 'Newer and unrelated.',
          createdAt: 1770000009000,
          embedding: null,
          id: 'semantic-newer-unrelated',
          personaId: 'hikari-lexical-recall',
          scopeKey,
          text: 'The avatar background is red.',
          userText: 'The background is red.',
        },
      ]);

      const packet = await grillo.buildContextPacket({
        query: 'Oracle Cloud ARM deployment',
        scopeKey,
      });
      const semanticItems = packet.recalled_memories.filter((item) => item.source === 'semantic');

      expect(packet.retrieval_receipt.strategy).toBe('lexical_fallback');
      expect(semanticItems[0]?.id).toBe('semantic-older-relevant');
      expect(semanticItems.map((item) => item.id)).not.toContain('semantic-newer-unrelated');

      const unrelatedPacket = await grillo.buildContextPacket({
        includeProvenanceReceipt: true,
        query: 'quantum bananas',
        scopeKey,
      });
      expect(unrelatedPacket.retrieval_receipt.strategy).toBe('none');
      expect(
        unrelatedPacket.recalled_memories.filter((item) => item.source === 'semantic'),
      ).toEqual([]);
      expect(unrelatedPacket.provenance_receipt?.lanes.recalled_memories.dropped).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'semantic-older-relevant', reason: 'semantic_filter' }),
          expect.objectContaining({ id: 'semantic-newer-unrelated', reason: 'semantic_filter' }),
        ]),
      );
    } finally {
      await memory.close();
    }
  });

  it('validates GRILLO worker JSON locally before executing tool calls', async () => {
    const { grillo, memory } = createServices();
    try {
      const scopeKey = 'local:persona:hikari-chan';
      await grillo.ingestTurnPair({
        assistantName: 'Hikari-chan',
        assistantText: 'I will only run valid local GRILLO tool calls.',
        authorName: 'Subsect',
        channelId: 'local',
        createdAt: 1770000001000,
        participantKey: 'local:local:subsect',
        scopeKey,
        source: 'local',
        userText: 'make grillo validate model json locally',
      });

      let calls = 0;
      const tick = await grillo.runTickWithOptions(
        { reason: 'manual_test', scopeKey },
        {
          completion: async () => {
            calls += 1;
            return JSON.stringify({
              done: true,
              notes: 'one invalid candidate and one valid diary',
              toolCalls:
                calls === 1
                  ? [
                      {
                        args: {
                          content: 'This should not write because summary is missing.',
                          type: 'fact',
                        },
                        name: 'core.worker_candidate_write',
                      },
                      {
                        args: {
                          personal_thought:
                            'I should validate worker JSON locally before touching memory.',
                          summary: 'GRILLO worker JSON validation was requested.',
                        },
                        name: 'core.worker_diary_write',
                      },
                    ]
                  : [],
            });
          },
          model: 'openai/gpt-5-nano',
          provider: 'vercel-gateway',
        },
      );

      expect(tick).toMatchObject({
        noOpReason: '',
        ok: true,
        writes: 1,
      });

      const graph = await memory.getGraphSummary();
      expect(graph.recent.candidates).toHaveLength(0);
      expect(graph.recent.diary[0]?.summary).toBe('GRILLO worker JSON validation was requested.');
      expect(graph.recent.activities.filter((row) => row.beatType === 'worker_tool')).toHaveLength(
        1,
      );
    } finally {
      await memory.close();
    }
  });

  it('instructs reflection beats to synthesize higher-order memory insights', async () => {
    const { grillo, memory } = createServices();
    const requests: GrilloWorkerCompletionRequest[] = [];
    try {
      const scopeKey = 'local:persona:hikari-chan';
      const participantKey = 'local:local:subsect';

      await grillo.ingestTurnPair({
        assistantName: 'Hikari-chan',
        assistantText: 'I will keep the recurring bit in mind without overdoing it.',
        authorName: 'Subsect',
        channelId: 'local',
        createdAt: 1770000001000,
        participantKey,
        scopeKey,
        source: 'local',
        userText: 'keep the joke going but do not make every reply the same bit',
      });

      const tick = await grillo.runTickWithOptions(
        {
          beatType: 'reflection',
          reason: 'manual_reflection',
          scopeKey,
        },
        {
          completion: async (request) => {
            requests.push(request);
            return JSON.stringify({
              candidate: null,
              diary: null,
              done: true,
              memory: null,
              notes: 'reflection prompt verified',
              relationship: null,
              toolCalls: [],
            });
          },
          model: 'openai/gpt-5-nano',
          provider: 'vercel-gateway',
        },
      );

      expect(tick).toMatchObject({
        beatType: 'reflection',
        noOpReason: 'worker_no_writes',
        writes: 0,
      });
      expect(requests[0]?.messages[0]?.content).toContain(
        'Reflection beats synthesize higher-order insight',
      );
      expect(requests[0]?.messages[1]?.content).toContain(
        'Synthesize higher-order insight, not a literal transcript summary.',
      );
      expect(requests[0]?.messages[1]?.content).toContain('core.worker_emotion_read');
      expect(requests[0]?.messages[1]?.content).toContain('what the pattern means for future replies');
      expect(requests[0]?.messages[1]?.content).toContain('block_name="relationship_state"');
    } finally {
      await memory.close();
    }
  });

  it('runs a backend debrief recovery round when LLM extraction writes no candidate or diary', async () => {
    const { grillo, memory } = createServices();
    const requests: Array<{
      messages: Array<{ content: string; role: string }>;
      stateScope: string;
    }> = [];
    try {
      const scopeKey = 'local:persona:hikari-chan';
      const participantKey = 'local:local:subsect';

      await grillo.ingestTurnPair({
        assistantName: 'Hikari-chan',
        assistantText: 'I will remember that recovery should not silently drop durable memory.',
        authorName: 'Subsect',
        channelId: 'local',
        createdAt: 1770000001000,
        participantKey,
        scopeKey,
        source: 'local',
        userText: 'remember debrief recovery when worker writes nothing',
      });

      const tick = await grillo.runTickWithOptions(
        { reason: 'manual_test', scopeKey },
        {
          completion: async (request) => {
            requests.push({
              messages: request.messages.map((message) => ({ ...message })),
              stateScope: request.stateScope,
            });
            if (requests.length === 1) {
              return JSON.stringify({
                candidate: null,
                diary: null,
                done: true,
                memory: null,
                notes: 'missed the write',
                relationship: null,
                toolCalls: [],
              });
            }
            if (requests.length === 2) {
              return JSON.stringify({
                candidate: null,
                diary: null,
                done: false,
                memory: null,
                notes: 'recovered writes',
                relationship: null,
                toolCalls: [
                  {
                    args: {
                      confidence: 0.82,
                      content: 'Subsect wants GRILLO debrief recovery when the worker writes nothing.',
                      summary: 'Subsect wants GRILLO debrief recovery.',
                      tags: ['grillo', 'debrief'],
                      type: 'goal',
                    },
                    name: 'core.worker_candidate_write',
                  },
                  {
                    args: {
                      beat_type: 'debrief',
                      personal_thought: 'I should not let the worker silently finish without checking for missed memory.',
                      summary: 'Recovered a missed GRILLO memory write.',
                      tags: ['grillo', 'debrief'],
                    },
                    name: 'core.worker_diary_write',
                  },
                ],
              });
            }
            return JSON.stringify({
              candidate: null,
              diary: null,
              done: true,
              memory: null,
              notes: 'done after recovery',
              relationship: null,
              toolCalls: [],
            });
          },
          maxRounds: 4,
          model: 'openai/gpt-5-nano',
          provider: 'vercel-gateway',
        },
      );

      expect(tick).toMatchObject({
        noOpReason: '',
        writes: 2,
      });
      expect(requests).toHaveLength(3);
      expect(requests.every((request) => request.stateScope === 'memory')).toBe(true);
      expect(requests[1]?.messages.at(-1)?.content).toContain('Debrief recovery:');

      const graph = await memory.getGraphSummary();
      expect(graph.recent.candidates[0]?.summary).toBe('Subsect wants GRILLO debrief recovery.');
      expect(graph.recent.diary[0]?.summary).toBe('Recovered a missed GRILLO memory write.');

      const state = await memory.getGrilloSingleton<Record<string, unknown>>('memory_worker_state');
      expect(state).toMatchObject({
        lastExtractionCandidateWrites: 1,
        lastExtractionDiaryWrites: 1,
        lastExtractionRecoveryAttempted: true,
      });
    } finally {
      await memory.close();
    }
  });

  it('runs explicit relationship beats through the backend memory lane', async () => {
    const { grillo, memory } = createServices();
    const requests: Array<{
      messages: Array<{ content: string; role: string }>;
      stateScope: string;
      temperature: number;
    }> = [];
    try {
      const scopeKey = 'local:persona:hikari-chan';
      const participantKey = 'local:local:subsect';

      await grillo.ingestTurnPair({
        assistantName: 'Hikari-chan',
        assistantText: 'I will keep the relationship beat grounded in the backend memory lane.',
        authorName: 'Subsect',
        channelId: 'local',
        createdAt: 1770000001000,
        participantKey,
        scopeKey,
        source: 'local',
        userText: 'relationship beats should update the grillo relationship state',
      });

      const tick = await grillo.runTickWithOptions(
        {
          beatType: 'relationship',
          reason: 'manual_relationship',
          scopeKey,
        },
        {
          completion: async (request) => {
            requests.push({
              messages: request.messages.map((message) => ({ ...message })),
              stateScope: request.stateScope,
              temperature: request.temperature,
            });
            if (requests.length === 1) {
              return {
                meta: { model: 'openai/gpt-5-nano', provider: 'vercel-gateway' },
                text: JSON.stringify({
                  candidate: null,
                  diary: null,
                  done: false,
                  memory: null,
                  notes: 'relationship beat writes',
                  relationship: null,
                  toolCalls: [
                    {
                      args: {
                        beat_type: 'relationship',
                        personal_thought: 'I should track that Subsect wants relationship beats to update durable GRILLO state.',
                        summary: 'Relationship beat recorded a durable state request.',
                        tags: ['relationship', 'grillo'],
                      },
                      name: 'core.worker_diary_write',
                    },
                    {
                      args: {
                        block_name: 'relationship_state',
                        items: ['Subsect wants relationship beats to update durable GRILLO state.'],
                        operation: 'merge',
                        reason: 'relationship beat',
                      },
                      name: 'core.worker_memory_write',
                    },
                  ],
                }),
              };
            }
            return JSON.stringify({
              candidate: null,
              diary: null,
              done: true,
              memory: null,
              notes: 'relationship beat done',
              relationship: null,
              toolCalls: [],
            });
          },
          maxToolRounds: 15,
          model: 'openai/gpt-5-nano',
          provider: 'vercel-gateway',
        },
      );

      expect(tick).toMatchObject({
        beatType: 'relationship',
        noOpReason: '',
        writes: 2,
      });
      expect(requests[0]).toMatchObject({
        stateScope: 'memory',
        temperature: 0.2,
      });
      expect(requests[0]?.messages[1]?.content).toContain('This is a relationship beat.');
      expect(requests[0]?.messages[1]?.content).toContain('Canonical GRILLO context packet:');

      const graph = await memory.getGraphSummary();
      expect(graph.recent.traces[0]).toMatchObject({
        beatType: 'relationship',
        model: 'openai/gpt-5-nano',
        provider: 'vercel-gateway',
        taskType: 'relationship',
      });
      expect(graph.recent.diary[0]).toMatchObject({
        beatType: 'relationship',
        participantKey,
        summary: 'Relationship beat recorded a durable state request.',
      });
      expect(graph.recent.slots[0]).toMatchObject({
        participantKey,
        slotName: 'relationship_state',
      });

      const state = await memory.getGrilloSingleton<Record<string, unknown>>('memory_worker_state');
      expect(state).toMatchObject({
        lastBeatModel: 'openai/gpt-5-nano',
        lastBeatProvider: 'vercel-gateway',
        lastBeatType: 'relationship',
        lastToolCalls: 2,
      });
    } finally {
      await memory.close();
    }
  });

  it('runs consolidation and compaction beats through the backend memory lane', async () => {
    const { grillo, memory } = createServices();
    const requests: Array<{
      beatType: string;
      messages: Array<{ content: string; role: string }>;
      stateScope: string;
    }> = [];
    try {
      const scopeKey = 'local:persona:hikari-chan';
      const participantKey = 'local:local:subsect';

      await grillo.ingestTurnPair({
        assistantName: 'Hikari-chan',
        assistantText: 'I will keep consolidation and compaction visible in GRILLO.',
        authorName: 'Subsect',
        channelId: 'local',
        createdAt: 1770000001000,
        participantKey,
        scopeKey,
        source: 'local',
        userText: 'consolidate and compact grillo memory when it gets noisy',
      });

      const completion = async (request: GrilloWorkerCompletionRequest) => {
        const prompt = request.messages[1]?.content ?? '';
        const beatType = prompt.includes('compaction beat')
          ? 'compaction'
          : prompt.includes('consolidation beat')
            ? 'consolidation'
            : 'unknown';
        requests.push({
          beatType,
          messages: request.messages.map((message) => ({ ...message })),
          stateScope: request.stateScope,
        });
        if (request.messages.length > 2) {
          return JSON.stringify({
            candidate: null,
            diary: null,
            done: true,
            memory: null,
            notes: `${beatType} done`,
            relationship: null,
            toolCalls: [],
          });
        }
        if (beatType === 'consolidation') {
          return {
            meta: { model: 'openai/gpt-5-nano', provider: 'vercel-gateway' },
            text: JSON.stringify({
              candidate: null,
              diary: null,
              done: false,
              memory: null,
              notes: 'consolidating durable memory',
              relationship: null,
              toolCalls: [
                {
                  args: {
                    block_name: 'ongoing_threads',
                    items: ['Subsect wants GRILLO to consolidate durable memory from noisy chat.'],
                    operation: 'merge',
                    reason: 'consolidation beat',
                  },
                  name: 'core.worker_memory_write',
                },
              ],
            }),
          };
        }
        return {
          meta: { model: 'openai/gpt-5-nano', provider: 'vercel-gateway' },
          text: JSON.stringify({
            candidate: null,
            diary: null,
            done: false,
            memory: null,
            notes: 'compacting durable memory',
            relationship: null,
            toolCalls: [
              {
                args: {
                  block_name: 'open_threads',
                  items: ['GRILLO memory needs concise durable summaries when chat context gets noisy.'],
                  operation: 'replace',
                  reason: 'compaction beat',
                },
                name: 'core.worker_memory_write',
              },
              {
                args: {
                  text: 'Archived noisy GRILLO memory discussion before compaction.',
                },
                name: 'core.worker_memory_insert_archival',
              },
            ],
          }),
        };
      };

      const consolidation = await grillo.runTickWithOptions(
        {
          beatType: 'consolidation',
          reason: 'manual_consolidation',
          scopeKey,
        },
        {
          completion,
          maxToolRounds: 15,
          model: 'openai/gpt-5-nano',
          provider: 'vercel-gateway',
        },
      );
      const compaction = await grillo.runTickWithOptions(
        {
          beatType: 'compaction',
          reason: 'manual_compaction',
          scopeKey,
        },
        {
          completion,
          maxToolRounds: 15,
          model: 'openai/gpt-5-nano',
          provider: 'vercel-gateway',
        },
      );

      expect(consolidation).toMatchObject({
        beatType: 'consolidation',
        noOpReason: '',
        writes: 1,
      });
      expect(compaction).toMatchObject({
        beatType: 'compaction',
        noOpReason: '',
        writes: 2,
      });
      expect(requests.every((request) => request.stateScope === 'memory')).toBe(true);
      expect(requests[0]?.messages[1]?.content).toContain('This is a consolidation beat.');
      expect(requests[2]?.messages[1]?.content).toContain('This is a compaction beat.');

      const graph = await memory.getGraphSummary();
      expect(graph.recent.traces).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ beatType: 'consolidation', taskType: 'consolidation' }),
          expect.objectContaining({ beatType: 'compaction', taskType: 'compaction' }),
        ]),
      );
      expect(graph.recent.slots).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ slotName: 'ongoing_threads' }),
          expect.objectContaining({ slotName: 'open_threads' }),
        ]),
      );
      expect(graph.recent.semantic[0]?.text).toBe(
        'Archived noisy GRILLO memory discussion before compaction.',
      );

      const state = await memory.getGrilloSingleton<Record<string, unknown>>('memory_worker_state');
      expect(state).toMatchObject({
        lastBeatModel: 'openai/gpt-5-nano',
        lastBeatProvider: 'vercel-gateway',
        lastBeatType: 'compaction',
        lastToolCalls: 2,
      });
    } finally {
      await memory.close();
    }
  });

  it('runs curiosity and tag elaboration beats through the backend memory lane', async () => {
    const { grillo, memory } = createServices();
    const requests: Array<{
      beatType: string;
      messages: Array<{ content: string; role: string }>;
      stateScope: string;
    }> = [];
    try {
      const scopeKey = 'local:persona:hikari-chan';
      const participantKey = 'local:local:subsect';

      await grillo.ingestTurnPair({
        assistantName: 'Hikari-chan',
        assistantText: 'I will keep curiosity and tag elaboration grounded in memory.',
        authorName: 'Subsect',
        channelId: 'local',
        createdAt: 1770000001000,
        participantKey,
        scopeKey,
        source: 'local',
        userText: 'grillo should track useful questions and organize tags',
      });

      const completion = async (request: GrilloWorkerCompletionRequest) => {
        const prompt = request.messages[1]?.content ?? '';
        const beatType = prompt.includes('tag elaboration beat')
          ? 'tag_elaboration'
          : prompt.includes('curiosity beat')
            ? 'curiosity'
            : 'unknown';
        requests.push({
          beatType,
          messages: request.messages.map((message) => ({ ...message })),
          stateScope: request.stateScope,
        });
        if (request.messages.length > 2) {
          return JSON.stringify({
            candidate: null,
            diary: null,
            done: true,
            memory: null,
            notes: `${beatType} done`,
            relationship: null,
            toolCalls: [],
          });
        }
        if (beatType === 'curiosity') {
          return {
            meta: { model: 'openai/gpt-5-nano', provider: 'vercel-gateway' },
            text: JSON.stringify({
              candidate: null,
              diary: null,
              done: false,
              memory: null,
              notes: 'curiosity beat writes',
              relationship: null,
              toolCalls: [
                {
                  args: {
                    block_name: 'working_scratchpad',
                    items: ['Ask Subsect whether GRILLO should prioritize local-only chat or stream mode next.'],
                    operation: 'merge',
                    reason: 'curiosity beat',
                  },
                  name: 'core.worker_memory_write',
                },
                {
                  args: {
                    field: 'active_threads',
                    operation: 'add',
                    value: 'GRILLO local mode versus stream mode priority',
                  },
                  name: 'core.worker_profile_patch',
                },
              ],
            }),
          };
        }
        return {
          meta: { model: 'openai/gpt-5-nano', provider: 'vercel-gateway' },
          text: JSON.stringify({
            candidate: null,
            diary: null,
            done: false,
            memory: null,
            notes: 'tag elaboration writes',
            relationship: null,
            toolCalls: [
              {
                args: {
                  confidence: 0.86,
                  content: 'Subsect wants GRILLO memories organized by useful retrieval tags.',
                  summary: 'Subsect wants tagged GRILLO memory organization.',
                  tags: ['grillo', 'tags', 'retrieval'],
                  type: 'goal',
                },
                name: 'core.worker_candidate_write',
              },
              {
                args: {
                  block_name: 'ongoing_threads',
                  items: ['GRILLO memory organization should preserve useful retrieval tags.'],
                  operation: 'merge',
                  reason: 'tag elaboration beat',
                },
                name: 'core.worker_memory_write',
              },
            ],
          }),
        };
      };

      const curiosity = await grillo.runTickWithOptions(
        {
          beatType: 'curiosity',
          reason: 'manual_curiosity',
          scopeKey,
        },
        {
          completion,
          maxToolRounds: 15,
          model: 'openai/gpt-5-nano',
          provider: 'vercel-gateway',
        },
      );
      const tagElaboration = await grillo.runTickWithOptions(
        {
          beatType: 'tag_elaboration',
          reason: 'manual_tag_elaboration',
          scopeKey,
        },
        {
          completion,
          maxToolRounds: 15,
          model: 'openai/gpt-5-nano',
          provider: 'vercel-gateway',
        },
      );

      expect(curiosity).toMatchObject({
        beatType: 'curiosity',
        noOpReason: '',
        writes: 2,
      });
      expect(tagElaboration).toMatchObject({
        beatType: 'tag_elaboration',
        noOpReason: '',
        writes: 2,
      });
      expect(requests.every((request) => request.stateScope === 'memory')).toBe(true);
      expect(requests[0]?.messages[1]?.content).toContain('This is a curiosity beat.');
      expect(requests[2]?.messages[1]?.content).toContain('This is a tag elaboration beat.');

      const graph = await memory.getGraphSummary();
      expect(graph.recent.traces).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ beatType: 'curiosity', taskType: 'curiosity' }),
          expect.objectContaining({ beatType: 'tag_elaboration', taskType: 'tag_elaboration' }),
        ]),
      );
      expect(graph.recent.candidates[0]?.summary).toBe(
        'Subsect wants tagged GRILLO memory organization.',
      );
      expect(graph.recent.slots).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ slotName: 'working_scratchpad' }),
          expect.objectContaining({ slotName: 'ongoing_threads' }),
        ]),
      );

      const state = await memory.getGrilloSingleton<Record<string, unknown>>('memory_worker_state');
      const profiles = await memory.loadRelationshipProfiles();
      expect(profiles[scopeKey]).toMatchObject({
        active_threads: ['GRILLO local mode versus stream mode priority'],
      });
      expect(state).toMatchObject({
        lastBeatModel: 'openai/gpt-5-nano',
        lastBeatProvider: 'vercel-gateway',
        lastBeatType: 'tag_elaboration',
        lastToolCalls: 2,
      });
    } finally {
      await memory.close();
    }
  });

  it('runs semantic indexing beats into Ladybug semantic vectors', async () => {
    const { grillo, memory } = createServices();
    const embeddingRequests: Array<{ input: string; model: unknown; provider: unknown }> = [];
    try {
      const scopeKey = 'local:persona:hikari-chan';
      const participantKey = 'local:local:subsect';

      await grillo.ingestTurnPair({
        assistantName: 'Hikari-chan',
        assistantText: 'I will index this exchange for semantic recall.',
        authorName: 'Subsect',
        channelId: 'local',
        createdAt: 1770000001000,
        participantKey,
        scopeKey,
        source: 'local',
        userText: 'semantic indexing should create a vector memory',
      });

      const tick = await grillo.runTickWithOptions(
        {
          beatType: 'semantic_indexing',
          reason: 'manual_semantic_indexing',
          scopeKey,
        },
        {
          embedding: async (request) => {
            embeddingRequests.push({
              input: request.input,
              model: request.model,
              provider: request.provider,
            });
            return {
              embedding: [1, 0, 0],
              model: 'openai/text-embedding-3-small',
              provider: 'vercel-gateway',
            };
          },
          embeddingModel: 'openai/text-embedding-3-small',
          embeddingProvider: 'vercel-gateway',
        },
      );

      expect(tick).toMatchObject({
        beatType: 'semantic_indexing',
        noOpReason: '',
        writes: 1,
      });
      expect(embeddingRequests).toEqual([
        expect.objectContaining({
          model: 'openai/text-embedding-3-small',
          provider: 'vercel-gateway',
        }),
      ]);
      expect(embeddingRequests[0]?.input).toContain('semantic indexing should create a vector memory');
      expect(embeddingRequests[0]?.input).toContain('I will index this exchange for semantic recall.');

      const records = await memory.loadSemanticRecords(scopeKey);
      expect(records?.[0]).toMatchObject({
        embedding: [1, 0, 0],
        personaId: 'hikari-chan',
        scopeKey,
        userText: 'semantic indexing should create a vector memory',
      });
      const matches = await memory.querySemanticVectors(scopeKey, [1, 0, 0], 4);
      expect(matches[0]?.text).toContain('semantic indexing should create a vector memory');

      const graph = await memory.getGraphSummary();
      expect(graph.recent.traces[0]).toMatchObject({
        beatType: 'semantic_indexing',
        model: 'openai/text-embedding-3-small',
        provider: 'vercel-gateway',
        taskType: 'semantic_indexing',
      });
      expect(graph.recent.semantic[0]?.text).toContain('semantic indexing should create a vector memory');
      expect(graph.recent.vectors[0]?.text).toContain('semantic indexing should create a vector memory');

      const state = await memory.getGrilloSingleton<Record<string, unknown>>('memory_worker_state');
      expect(state).toMatchObject({
        lastBeatModel: 'openai/text-embedding-3-small',
        lastBeatProvider: 'vercel-gateway',
        lastBeatType: 'semantic_indexing',
        lastSemanticIndexingFailed: 0,
        lastSemanticIndexingWrites: 1,
      });
      expect(await grillo.runTickWithOptions({ beatType: 'semantic_indexing', scopeKey })).toMatchObject({
        noOpReason: 'semantic_indexing_requires_embedding',
        writes: 0,
      });
    } finally {
      await memory.close();
    }
  });

  it('keeps worker watermarks isolated by memory scope', async () => {
    const { grillo, memory } = createServices();
    const firstScope = 'local:persona:hikari-chan';
    const secondScope = 'twitch:other-channel:hikari-chan';
    try {
      const first = await grillo.ingestTurnPair({
        assistantText: 'First scope reply.',
        participantKey: 'local:local:subsect',
        scopeKey: firstScope,
        source: 'local',
        userText: 'First scope message.',
      });
      const second = await grillo.ingestTurnPair({
        assistantText: 'Second scope reply.',
        participantKey: 'twitch:other-channel:viewer',
        scopeKey: secondScope,
        source: 'twitch',
        userText: 'Second scope message.',
      });

      await grillo.runTickWithOptions({ beatType: 'extraction', scopeKey: firstScope });
      await grillo.runTickWithOptions({ beatType: 'extraction', scopeKey: secondScope });
      const state = await memory.getGrilloSingleton<Record<string, unknown>>('memory_worker_state');
      const scopes = state?.['scopes'] as Record<string, Record<string, unknown>>;

      expect(scopes[firstScope]?.['processedTurnIds']).toEqual(first.turnIds);
      expect(scopes[secondScope]?.['processedTurnIds']).toEqual(second.turnIds);
      await expect(
        grillo.runTickWithOptions({ beatType: 'extraction', scopeKey: firstScope }),
      ).resolves.toMatchObject({ noOpReason: 'no_new_turn_pairs', writes: 0 });
      await expect(
        grillo.runTickWithOptions({ beatType: 'extraction', scopeKey: secondScope }),
      ).resolves.toMatchObject({ noOpReason: 'no_new_turn_pairs', writes: 0 });

      const embeddingOptions = {
        embedding: async () => ({
          embedding: [1, 0, 0],
          model: 'openai/text-embedding-3-small',
          provider: 'vercel-gateway' as const,
        }),
        embeddingModel: 'openai/text-embedding-3-small',
        embeddingProvider: 'vercel-gateway' as const,
      };
      await grillo.runTickWithOptions(
        { beatType: 'semantic_indexing', scopeKey: firstScope },
        embeddingOptions,
      );
      await grillo.runTickWithOptions(
        { beatType: 'semantic_indexing', scopeKey: secondScope },
        embeddingOptions,
      );
      const indexedState = await memory.getGrilloSingleton<Record<string, unknown>>(
        'memory_worker_state',
      );
      const indexedScopes = indexedState?.['scopes'] as Record<string, Record<string, unknown>>;
      expect(indexedScopes[firstScope]?.['semanticIndexedTurnIds']).toEqual(first.turnIds);
      expect(indexedScopes[secondScope]?.['semanticIndexedTurnIds']).toEqual(second.turnIds);
      await expect(
        grillo.runTickWithOptions(
          { beatType: 'semantic_indexing', scopeKey: firstScope },
          embeddingOptions,
        ),
      ).resolves.toMatchObject({ noOpReason: 'no_new_turn_pairs', writes: 0 });
      await expect(
        grillo.runTickWithOptions(
          { beatType: 'semantic_indexing', scopeKey: secondScope },
          embeddingOptions,
        ),
      ).resolves.toMatchObject({ noOpReason: 'no_new_turn_pairs', writes: 0 });
    } finally {
      await memory.close();
    }
  });

  it('starts, stops, and guards backend worker ticks', async () => {
    const dbPath = join(tmpdir(), `webwaifu4-grillo-runtime-test-${process.pid}-${Date.now()}.db`);
    dbPaths.push(dbPath);
    const memory = new LadybugMemoryService(dbPath);
    let id = 0;
    let releaseTick: (() => void) | null = null;
    const grillo = new GrilloWorkerService(
      memory,
      () => 1770000000000,
      () => `runtime-id-${++id}`,
      async () => {
        await new Promise<void>((resolve) => {
          releaseTick = resolve;
        });
        return { noOpReason: 'test_tick_noop', writes: 0 };
      },
    );

    try {
      expect(grillo.start({ enabled: true, intervalMs: 5000 })).toMatchObject({
        enabled: true,
        intervalMs: 5000,
        started: true,
      });

      const firstTick = grillo.runTick({
        reason: 'manual_test',
        scopeKey: 'local:persona:hikari-chan',
      });
      const guardedTick = await grillo.runTick({
        reason: 'manual_test',
        scopeKey: 'local:persona:hikari-chan',
      });

      expect(guardedTick).toMatchObject({
        noOpReason: 'tick_already_running',
        running: true,
        writes: 0,
      });

      (releaseTick as (() => void) | null)?.();
      expect(await firstTick).toMatchObject({
        noOpReason: 'test_tick_noop',
        reason: 'manual_test',
        running: false,
        tickId: 'runtime-id-1',
        writes: 0,
      });

      const state = await memory.getGrilloSingleton<Record<string, unknown>>('memory_worker_state');
      expect(state).toMatchObject({
        lastNoOpReason: 'test_tick_noop',
        lastTickId: 'runtime-id-1',
        scopeKey: 'local:persona:hikari-chan',
      });
      const graph = await memory.getGraphSummary();
      expect(graph.recent.activities[0]).toMatchObject({
        beatType: 'worker_tick',
        responseText: 'GRILLO extraction tick no-op: test_tick_noop',
      });
      expect(grillo.stop()).toMatchObject({
        enabled: false,
        lastNoOpReason: 'stopped',
        started: false,
      });
    } finally {
      grillo.stop();
      await memory.close();
    }
  });
});
