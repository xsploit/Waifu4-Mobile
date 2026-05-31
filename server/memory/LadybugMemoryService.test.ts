import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { LadybugMemoryService } from './LadybugMemoryService';

const dbPaths: string[] = [];

function createService() {
  const dbPath = join(tmpdir(), `webwaifu4-ladybug-test-${process.pid}-${Date.now()}.db`);
  dbPaths.push(dbPath);
  return new LadybugMemoryService(dbPath);
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

describe('LadybugMemoryService', () => {
  it('stores native GRILLO repository records in Ladybug graph rows', async () => {
    const service = createService();
    const scopeKey = 'local:persona:neuro-sama';
    const participantKey = 'local:local:subsect';
    try {
      await service.appendGrilloRecord('turn_events', {
        author_name: 'Subsect',
        channel_id: 'local',
        content: 'remember that I like clean GRILLO memory',
        created_at: 10,
        interface_path: 'local/subsect',
        participant_key: participantKey,
        role: 'user',
        scope_key: scopeKey,
        turn_id: 'turn-1',
        user_id: scopeKey,
      });
      await service.appendGrilloRecord('memory_candidates', {
        candidate_id: 'candidate-native-1',
        confidence: 0.92,
        content: 'Subsect likes clean GRILLO memory.',
        created_at: 11,
        evidence_turn_ids: ['turn-1'],
        participant_key: participantKey,
        scope_key: scopeKey,
        source: 'local',
        summary: 'Subsect likes clean GRILLO memory.',
        type: 'preference',
        user_id: scopeKey,
      });
      await service.appendGrilloRecord('diary_entries', {
        beat_type: 'relationship',
        created_at: 12,
        diary_id: 'diary-native-1',
        participant_key: participantKey,
        personal_thought: 'I should treat GRILLO as the real memory spine now.',
        scope_key: scopeKey,
        summary: 'Subsect clarified GRILLO should be canonical.',
        tags: ['grillo'],
        user_id: scopeKey,
      });
      await service.upsertGrilloMemorySlot({
        content_json: JSON.stringify(['Subsect likes clean GRILLO memory.']),
        schema_version: '1.0.0',
        slot_id: 'slot-native-1',
        slot_name: 'preferences',
        source_candidate_ids_json: JSON.stringify(['candidate-native-1']),
        updated_at: '2026-05-28T00:00:00.000Z',
        user_id: scopeKey,
      });
      await service.appendGrilloMemorySlotPatch({
        created_at: '2026-05-28T00:00:01.000Z',
        operation: 'merge',
        patch_id: 'patch-native-1',
        patch_json: JSON.stringify({ items: ['Subsect likes clean GRILLO memory.'] }),
        schema_version: '1.0.0',
        slot_id: 'slot-native-1',
        slot_name: 'preferences',
        source_candidate_ids_json: JSON.stringify(['candidate-native-1']),
        user_id: scopeKey,
      });
      await service.appendGrilloRecord('grillo_activity_log', {
        activity_id: 'activity-native-1',
        beat_type: 'relationship',
        created_at: 13,
        prompt_text: 'Reflect on the latest memory turn.',
        response_text: 'Wrote candidate and diary.',
        scope_key: scopeKey,
        user_id: scopeKey,
      });
      await service.appendGrilloRecord('worker_context_traces', {
        beat_type: 'relationship',
        created_at: 14,
        model: 'zai/glm-4.7-flash',
        prompt: 'New messages to process...',
        provider: 'openrouter',
        scope_key: scopeKey,
        system_prompt: 'You are the background sleep-time memory agent.',
        task_type: 'extraction',
        trace_id: 'trace-native-1',
        user_id: scopeKey,
      });
      await service.setGrilloSingleton('memory_worker_state', {
        schema_version: '1.0.0',
        last_processed_turn_count: 1,
      });

      const turns = await service.readGrilloRecords<{ turn_id: string }>('turn_events');
      const candidates = await service.readGrilloRecords<{ candidate_id: string }>(
        'memory_candidates',
      );
      const slots = await service.listGrilloMemorySlots(scopeKey);
      const patches = await service.listGrilloMemorySlotPatches(scopeKey);
      const singleton = await service.getGrilloSingleton<{ last_processed_turn_count: number }>(
        'memory_worker_state',
      );
      const status = await service.getStatus();
      const graph = await service.getGraphSummary();

      expect(turns.map((turn) => turn.turn_id)).toEqual(['turn-1']);
      expect(candidates.map((candidate) => candidate.candidate_id)).toEqual(['candidate-native-1']);
      expect(slots[0]?.slot_name).toBe('preferences');
      expect(patches[0]?.operation).toBe('merge');
      expect(singleton?.last_processed_turn_count).toBe(1);
      expect(status.turnEvents).toBe(1);
      expect(status.candidates).toBe(1);
      expect(status.diaryEntries).toBe(1);
      expect(status.memorySlots).toBe(1);
      expect(status.memorySlotPatches).toBe(1);
      expect(status.grilloActivities).toBe(1);
      expect(status.workerContextTraces).toBe(1);
      expect(graph.participants[0]?.id).toBe(participantKey);
      expect(graph.recent.turns[0]).toMatchObject({
        authorName: 'Subsect',
        role: 'user',
        scopeKey,
        text: 'remember that I like clean GRILLO memory',
      });
      expect(graph.recent.slots[0]).toMatchObject({
        itemCount: 1,
        slotName: 'preferences',
        scopeKey,
      });
      expect(graph.recent.slotPatches[0]).toMatchObject({
        operation: 'merge',
        slotId: 'slot-native-1',
        slotName: 'preferences',
      });
      expect(graph.recent.activities[0]).toMatchObject({
        beatType: 'relationship',
        promptText: 'Reflect on the latest memory turn.',
        responseText: 'Wrote candidate and diary.',
        scopeKey,
      });
      expect(graph.recent.traces[0]).toMatchObject({
        beatType: 'relationship',
        model: 'zai/glm-4.7-flash',
        prompt: 'New messages to process...',
        provider: 'openrouter',
        scopeKey,
        systemPrompt: 'You are the background sleep-time memory agent.',
        taskType: 'extraction',
      });
      expect(graph.edges.map((edge) => edge.relation)).toEqual(
        expect.arrayContaining([
          'HAS_TURN',
          'TURN_BY',
          'HAS_CANDIDATE',
          'HAS_DIARY',
          'HAS_SLOT',
          'HAS_SLOT_PATCH',
          'SLOT_FROM_CANDIDATE',
          'HAS_ACTIVITY',
          'HAS_TRACE',
        ]),
      );
    } finally {
      await service.close();
    }
  });

  it('stores Grillo, semantic, participant, persona, and relationship graph rows', async () => {
    const service = createService();
    try {
      await service.saveGrilloState('local:persona:hikari-chan', {
        blocks: [
          {
            blockId: 'block-1',
            blockName: 'preferences',
            createdAt: 2,
            items: ['Subby likes fast TTS.'],
            participantKey: 'local:local:subby',
            scopeKey: 'local:persona:hikari-chan',
            sourceCandidateIds: ['candidate-1'],
            updatedAt: 3,
          },
        ],
        candidates: [
          {
            candidateId: 'candidate-1',
            confidence: 0.94,
            content: 'Subby likes fast TTS.',
            createdAt: 1,
            participantKey: 'local:local:subby',
            scopeKey: 'local:persona:hikari-chan',
            source: 'local',
            sourceTurnIds: ['turn-1'],
            summary: 'Subby likes fast TTS.',
            type: 'preference',
          },
        ],
        diaryEntries: [
          {
            beatType: 'relationship',
            createdAt: 4,
            diaryId: 'diary-1',
            participantKey: 'local:local:subby',
            personalThought: 'I should remember that fast speech latency matters here.',
            scopeKey: 'local:persona:hikari-chan',
            sourceTurnIds: ['turn-1'],
            summary: 'Subby emphasized fast TTS.',
            tags: ['tts'],
          },
        ],
        emotionState: {
          intensities: { happy: 4 },
          lastSignalAt: 5,
          lastSignalSource: 'worker',
          updatedAt: 5,
        },
        promotedCandidateIds: ['candidate-1'],
        scopeKey: 'local:persona:hikari-chan',
        updatedAt: 5,
        version: 1,
      });

      await service.saveSemanticRecords('local:persona:hikari-chan', [
        {
          assistantText: 'Got it.',
          createdAt: 6,
          embedding: [0.1, 0.2, 0.3],
          id: 'semantic-1',
          personaId: 'hikari-chan',
          scopeKey: 'local:persona:hikari-chan',
          text: 'User: remember fast TTS\nHikari-chan: Got it.',
          userText: 'remember fast TTS',
        },
      ]);
      await service.saveRelationshipProfiles({
        'local:persona:hikari-chan': {
          attraction: 1,
          diaryEntry: 'I should keep latency in mind.',
          facts: ['Subby likes fast TTS.'],
          guard: 8,
          irritation: 0,
          jealousy: 0,
          lastActionTag: 'none',
          lastDiaryTurnCount: 2,
          lastSeenAt: 7,
          mood: 'curious',
          participantKeys: ['local:local:subby'],
          relationshipStage: 'familiar',
          respect: 5,
          summary: 'Subby is tuning a low-latency stream avatar.',
          trust: 6,
          turnCount: 2,
          version: 2,
        },
      });

      const grilloState = await service.loadGrilloState('local:persona:hikari-chan');
      const semanticRecords = await service.loadSemanticRecords('local:persona:hikari-chan');
      const semanticMatches = await service.querySemanticVectors(
        'local:persona:hikari-chan',
        [0.1, 0.2, 0.3],
        2,
      );
      const relationshipProfiles = await service.loadRelationshipProfiles();
      const status = await service.getStatus();
      const graph = await service.getGraphSummary();

      expect((grilloState as { candidates: unknown[] }).candidates).toHaveLength(1);
      expect(semanticRecords?.[0]?.embedding).toEqual([0.1, 0.2, 0.3]);
      expect(semanticMatches[0]?.id).toBe('semantic-1');
      expect(
        (relationshipProfiles as Record<string, { summary?: string }>)['local:persona:hikari-chan']
          ?.summary,
      ).toContain('low-latency');
      expect(status.scopes).toBe(1);
      expect(status.participants).toBe(1);
      expect(status.personas).toBe(1);
      expect(status.candidates).toBe(1);
      expect(status.memoryBlocks).toBe(1);
      expect(status.diaryEntries).toBe(1);
      expect(status.emotionStates).toBe(1);
      expect(status.emotionIntensities).toBe(1);
      expect(status.semanticRecords).toBe(1);
      expect(status.semanticVectors).toBe(1);
      expect(status.relationshipProfiles).toBe(1);
      expect(status.relationshipFacts).toBe(1);
      expect(status.relationshipEdges).toBe(13);
      expect(graph.scopes[0]?.id).toBe('local:persona:hikari-chan');
      expect(graph.participants[0]?.id).toBe('local:local:subby');
      expect(graph.personas[0]?.id).toBe('hikari-chan');
      expect(graph.edges.map((edge) => edge.relation)).toEqual(
        expect.arrayContaining([
          'HAS_CANDIDATE',
          'HAS_BLOCK',
          'HAS_DIARY',
          'HAS_EMOTION',
          'HAS_EMOTION_INTENSITY',
          'HAS_SEMANTIC',
          'HAS_VECTOR',
          'HAS_RELATIONSHIP',
          'RELATIONSHIP_AS_PERSONA',
          'RELATIONSHIP_WITH_PARTICIPANT',
          'HAS_RELATIONSHIP_FACT',
          'BLOCK_FROM_CANDIDATE',
          'VECTOR_FOR_PERSONA',
        ]),
      );
      expect(graph.recent.candidates[0]?.summary).toBe('Subby likes fast TTS.');
      expect(graph.recent.blocks[0]).toMatchObject({
        blockName: 'preferences',
        id: 'block-1',
        itemCount: 1,
        items: ['Subby likes fast TTS.'],
        participantKey: 'local:local:subby',
        scopeKey: 'local:persona:hikari-chan',
      });
      expect(graph.recent.emotions[0]?.lastSignalSource).toBe('worker');
      expect(graph.recent.emotionIntensities[0]).toMatchObject({
        emotionStateId: 'emotion:local:persona:hikari-chan',
        intensity: 4,
        name: 'happy',
        scopeKey: 'local:persona:hikari-chan',
      });
      expect(graph.recent.relationships[0]?.summary).toContain('low-latency');
      expect(graph.recent.relationshipFacts[0]).toMatchObject({
        scopeKey: 'local:persona:hikari-chan',
        text: 'Subby likes fast TTS.',
      });
      expect(graph.recent.semantic[0]?.text).toContain('remember fast TTS');
      expect(graph.recent.vectors[0]?.text).toContain('remember fast TTS');
      await service.deleteSemanticRecords('local:persona:hikari-chan');
      expect(await service.loadSemanticRecords('local:persona:hikari-chan')).toBeNull();
      const clearedStatus = await service.getStatus();
      expect(clearedStatus.semanticRecords).toBe(0);
      expect(clearedStatus.semanticVectors).toBe(0);
    } finally {
      await service.close();
    }
  });

  it('deletes one relationship profile scope without clearing other scopes', async () => {
    const service = createService();
    try {
      await service.saveRelationshipProfiles({
        'local:persona:hikari-chan': {
          attraction: 1,
          diaryEntry: 'Local profile diary.',
          facts: ['Subby likes low latency.'],
          guard: 8,
          irritation: 0,
          jealousy: 0,
          lastActionTag: 'none',
          lastDiaryTurnCount: 2,
          lastSeenAt: 7,
          mood: 'curious',
          relationshipStage: 'familiar',
          respect: 5,
          summary: 'Local profile should be deleted.',
          trust: 6,
          turnCount: 2,
          version: 2,
        },
        'twitch:subsect:persona:hikari-chan': {
          attraction: 1,
          diaryEntry: 'Twitch profile diary.',
          facts: ['Twitch chat uses shared queue.'],
          guard: 7,
          irritation: 0,
          jealousy: 0,
          lastActionTag: 'none',
          lastDiaryTurnCount: 3,
          lastSeenAt: 8,
          mood: 'focused',
          relationshipStage: 'familiar',
          respect: 5,
          summary: 'Twitch profile should remain.',
          trust: 6,
          turnCount: 3,
          version: 2,
        },
      });

      await service.deleteRelationshipProfile('local:persona:hikari-chan');

      const profiles = (await service.loadRelationshipProfiles()) as Record<
        string,
        { summary?: string }
      >;
      const status = await service.getStatus();
      const graph = await service.getGraphSummary();

      expect(profiles['local:persona:hikari-chan']).toBeUndefined();
      expect(profiles['twitch:subsect:persona:hikari-chan']?.summary).toBe(
        'Twitch profile should remain.',
      );
      expect(status.relationshipProfiles).toBe(1);
      expect(status.relationshipFacts).toBe(1);
      expect(graph.recent.relationships.map((profile) => profile.scopeKey)).toEqual([
        'twitch:subsect:persona:hikari-chan',
      ]);
      expect(graph.recent.relationships[0]?.summary).toBe('Twitch profile should remain.');
    } finally {
      await service.close();
    }
  });

  it('upserts one native emotion state per scope and replaces graph intensities', async () => {
    const service = createService();
    const scopeKey = 'local:persona:hikari-chan';
    try {
      await service.upsertGrilloEmotionState(scopeKey, {
        intensities: { focused: 4 },
        lastSignalAt: 10,
        lastSignalSource: 'first-pass',
        updatedAt: 10,
      });
      await service.upsertGrilloEmotionState(scopeKey, {
        intensities: { curious: 7 },
        lastSignalAt: 20,
        lastSignalSource: 'second-pass',
        updatedAt: 20,
      });

      const records = await service.readGrilloRecords<Record<string, unknown>>('emotion_states');
      const graph = await service.getGraphSummary();
      const status = await service.getStatus();

      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        emotion_state_id: `emotion:${scopeKey}`,
        last_signal_source: 'second-pass',
        scope_key: scopeKey,
      });
      expect(records[0]?.['intensities']).toEqual({ curious: 7 });
      expect(status.emotionStates).toBe(1);
      expect(status.emotionIntensities).toBe(1);
      expect(graph.recent.emotions[0]).toMatchObject({
        id: `emotion:${scopeKey}`,
        lastSignalSource: 'second-pass',
        scopeKey,
      });
      expect(graph.recent.emotionIntensities).toEqual([
        expect.objectContaining({
          emotionStateId: `emotion:${scopeKey}`,
          intensity: 7,
          name: 'curious',
          scopeKey,
        }),
      ]);
      expect(JSON.stringify(graph)).not.toContain('focused');
    } finally {
      await service.close();
    }
  });

  it('falls back to local JSON snapshots when Ladybug native storage fails', async () => {
    const service = createService();
    const failingService = service as unknown as { init: () => Promise<never> };
    failingService.init = async () => {
      throw new Error('native wal unavailable');
    };

    try {
      await service.saveGrilloState('local:persona:fallback', {
        blocks: [
          {
            blockId: 'fallback-block',
            blockName: 'verified_facts',
            items: ['Fallback memory works.'],
          },
        ],
        diary: [{ id: 'fallback-diary', summary: 'Fallback diary works.' }],
      });
      await service.saveSemanticRecords('local:persona:fallback', [
        {
          assistantText: 'remembered',
          createdAt: 10,
          embedding: [1, 0, 0],
          id: 'fallback-semantic',
          personaId: 'fallback',
          scopeKey: 'local:persona:fallback',
          text: 'Fallback semantic memory works.',
          userText: 'remember fallback',
        },
      ]);
      await service.saveRelationshipProfiles({
        'local:persona:fallback': {
          facts: ['Fallback relationship works.'],
          mood: 'focused',
          relationshipStage: 'new',
          summary: 'Fallback relationship summary.',
        },
      });

      const status = await service.getStatus();
      const graph = await service.getGraphSummary();

      expect(status.backend).toBe('json-fallback');
      expect(status.snapshots).toBe(3);
      expect(await service.loadGrilloState('local:persona:fallback')).toMatchObject({
        blocks: [expect.objectContaining({ blockId: 'fallback-block' })],
      });
      expect(await service.loadSemanticRecords('local:persona:fallback')).toEqual([
        expect.objectContaining({ id: 'fallback-semantic' }),
      ]);
      expect(await service.querySemanticVectors('local:persona:fallback', [1, 0, 0], 1)).toEqual([
        expect.objectContaining({ id: 'fallback-semantic', score: 1 }),
      ]);
      expect(await service.loadRelationshipProfiles()).toMatchObject({
        'local:persona:fallback': expect.objectContaining({ mood: 'focused' }),
      });
      expect(JSON.stringify(graph)).toContain('Fallback memory works.');
      expect(JSON.stringify(graph)).toContain('Fallback semantic memory works.');
      expect(JSON.stringify(graph)).toContain('Fallback relationship works.');
    } finally {
      await service.close();
    }
  });

  it('clears every memory data class for one scope while preserving a sibling scope', async () => {
    const service = createService();
    const clearedScope = 'local:persona:hikari-clear';
    const keptScope = 'twitch:subsect:persona:hikari-clear';
    try {
      for (const [scopeKey, participantKey, semanticId, label] of [
        [clearedScope, 'local:local:subby', 'semantic-clear', 'cleared'],
        [keptScope, 'twitch:subsect:rayen', 'semantic-keep', 'kept'],
      ] as const) {
        await service.saveGrilloState(scopeKey, {
          blocks: [
            {
              blockId: `${label}-block`,
              blockName: 'preferences',
              createdAt: 2,
              items: [`${label} block memory`],
              participantKey,
              scopeKey,
              sourceCandidateIds: [`${label}-candidate`],
              updatedAt: 3,
            },
          ],
          candidates: [
            {
              candidateId: `${label}-candidate`,
              confidence: 0.94,
              content: `${label} candidate memory`,
              createdAt: 1,
              participantKey,
              scopeKey,
              source: label,
              sourceTurnIds: [`${label}-turn`],
              summary: `${label} candidate memory`,
              type: 'preference',
            },
          ],
          diaryEntries: [
            {
              beatType: 'relationship',
              createdAt: 4,
              diaryId: `${label}-diary`,
              emotions: [{ intensity: 5, name: 'focused' }],
              participantKey,
              personalThought: `I remembered ${label} diary memory.`,
              scopeKey,
              sourceTurnIds: [`${label}-turn`],
              summary: `${label} diary memory`,
              tags: [label],
            },
          ],
          emotionState: {
            intensities: { focused: 5 },
            lastSignalAt: 5,
            lastSignalSource: `${label}-diary`,
            updatedAt: 5,
          },
          promotedCandidateIds: [`${label}-candidate`],
          scopeKey,
          updatedAt: 5,
          version: 1,
        });
        await service.saveSemanticRecords(scopeKey, [
          {
            assistantText: `${label} semantic answer`,
            createdAt: 6,
            embedding: label === 'cleared' ? [1, 0, 0] : [0, 1, 0],
            id: semanticId,
            personaId: 'hikari-clear',
            scopeKey,
            text: `User: ${label} semantic memory\nHikari: ${label} semantic answer`,
            userText: `${label} semantic memory`,
          },
        ]);
      }
      await service.saveRelationshipProfiles({
        [clearedScope]: {
          attraction: 1,
          diaryEntry: 'Cleared profile diary.',
          facts: ['Cleared relationship fact.'],
          guard: 8,
          irritation: 0,
          jealousy: 0,
          lastActionTag: 'none',
          lastDiaryTurnCount: 2,
          lastSeenAt: 7,
          mood: 'focused',
          relationshipStage: 'familiar',
          respect: 5,
          summary: 'Cleared relationship summary.',
          trust: 6,
          turnCount: 2,
          version: 2,
        },
        [keptScope]: {
          attraction: 1,
          diaryEntry: 'Kept profile diary.',
          facts: ['Kept relationship fact.'],
          guard: 7,
          irritation: 0,
          jealousy: 0,
          lastActionTag: 'none',
          lastDiaryTurnCount: 3,
          lastSeenAt: 8,
          mood: 'curious',
          relationshipStage: 'familiar',
          respect: 5,
          summary: 'Kept relationship summary.',
          trust: 6,
          turnCount: 3,
          version: 2,
        },
      });

      await service.deleteGrilloState(clearedScope);
      await service.deleteSemanticRecords(clearedScope);
      await service.deleteRelationshipProfile(clearedScope);

      expect(await service.loadGrilloState(clearedScope)).toBeNull();
      expect(await service.loadSemanticRecords(clearedScope)).toBeNull();
      expect(await service.querySemanticVectors(clearedScope, [1, 0, 0], 2)).toEqual([]);
      expect((await service.loadGrilloState(keptScope)) as object).toMatchObject({
        scopeKey: keptScope,
      });
      expect(await service.querySemanticVectors(keptScope, [0, 1, 0], 2)).toEqual([
        expect.objectContaining({ id: 'semantic-keep', scopeKey: keptScope }),
      ]);

      const profiles = (await service.loadRelationshipProfiles()) as Record<
        string,
        { summary?: string }
      >;
      const graph = await service.getGraphSummary();
      const status = await service.getStatus();
      const graphText = JSON.stringify(graph);

      expect(profiles[clearedScope]).toBeUndefined();
      expect(profiles[keptScope]?.summary).toBe('Kept relationship summary.');
      expect(status.candidates).toBe(1);
      expect(status.memoryBlocks).toBe(1);
      expect(status.diaryEntries).toBe(1);
      expect(status.emotionStates).toBe(1);
      expect(status.emotionIntensities).toBe(1);
      expect(status.semanticRecords).toBe(1);
      expect(status.semanticVectors).toBe(1);
      expect(status.relationshipProfiles).toBe(1);
      expect(status.relationshipFacts).toBe(1);
      expect(graphText).toContain(keptScope);
      expect(graphText).toContain('kept block memory');
      expect(graphText).toContain('kept diary memory');
      expect(graphText).toContain('kept semantic memory');
      expect(graphText).toContain('Kept relationship fact.');
      expect(graphText).not.toContain(clearedScope);
      expect(graphText).not.toContain('cleared block memory');
      expect(graphText).not.toContain('cleared diary memory');
      expect(graphText).not.toContain('cleared semantic memory');
      expect(graphText).not.toContain('Cleared relationship fact.');
    } finally {
      await service.close();
    }
  });
});
