import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Connection, Database } from '@ladybugdb/core';
import type { LadybugMemoryGraphSummary } from '../../src/shared/ladybugMemoryTypes';
export type { LadybugMemoryGraphSummary } from '../../src/shared/ladybugMemoryTypes';

export type LadybugSemanticMemoryRecord = {
  id: string;
  createdAt: number;
  embeddingModel?: string;
  embeddingProvider?: string;
  embeddingVersion?: string;
  personaId: string;
  scopeKey: string;
  sourceTurnIds?: string[];
  text: string;
  userText: string;
  assistantText: string;
  embedding: number[] | null;
};

export type LadybugSemanticMemoryMatch = LadybugSemanticMemoryRecord & {
  distance: number;
  score: number;
};

export type LadybugGrilloRecordEntity =
  | 'turn_events'
  | 'memory_candidates'
  | 'diary_entries'
  | 'memory_blocks'
  | 'memory_slots'
  | 'memory_slot_patches'
  | 'relationship_profiles'
  | 'emotion_states'
  | 'grillo_activity_log'
  | 'worker_context_traces'
  | 'semantic_records'
  | 'semantic_vectors';

export type LadybugGrilloSingletonEntity = 'runtime_settings' | 'memory_worker_state';

export type LadybugMemorySlotRecord = {
  content_json: string;
  schema_version: '1.0.0';
  slot_id: string;
  slot_name: string;
  source_candidate_ids_json: string;
  updated_at: string;
  user_id: string;
};

export type LadybugMemorySlotPatchRecord = {
  created_at: string;
  operation: 'set' | 'merge' | 'remove';
  patch_id: string;
  patch_json: string;
  schema_version: '1.0.0';
  slot_id: string;
  slot_name: string;
  source_candidate_ids_json: string;
  user_id: string;
};

export type LadybugEmotionStateRecord = {
  emotion_state_id: string;
  intensities: Record<string, number>;
  intensities_json: string;
  last_signal_at: string;
  last_signal_source: string;
  schema_version: '1.0.0';
  scope_key: string;
  updated_at: string;
  user_id: string;
};

type LadybugSnapshotKind = 'grillo' | 'relationships' | 'semantic';

type LadybugSnapshot = {
  id: string;
  json: string;
  kind: LadybugSnapshotKind;
  scopeKey: string;
  updatedAt: number;
};

type LadybugQueryResult = {
  getAll: () => Promise<Array<Record<string, unknown>>>;
};

type LadybugState = {
  connection: Connection;
  database: Database;
  initialized: boolean;
};

type LadybugCoreModule = {
  Connection: new (database: Database) => Connection;
  Database: new (path: string) => Database;
};

type FallbackSnapshot = {
  kind: string;
  scopeKey: string;
  updatedAt: number;
  value: unknown;
};

type FallbackStore = {
  reason: string | null;
  snapshots: Record<string, FallbackSnapshot>;
  updatedAt: number;
  version: 1;
};

const DEFAULT_MEMORY_DB_DIR = join(process.cwd(), '.webwaifu4', 'ladybug-memory.db');
const MAX_SCOPE_KEY_LENGTH = 180;
const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;

export class LadybugMemoryService {
  readonly dbDir: string;
  private state: LadybugState | null = null;
  private initPromise: Promise<LadybugState> | null = null;
  private fallbackReason: string | null = null;
  private fallbackMutationQueue: Promise<void> = Promise.resolve();

  constructor(dbDir = process.env['WEBWAIFU_MEMORY_DB_DIR']?.trim() || DEFAULT_MEMORY_DB_DIR) {
    this.dbDir = dbDir;
    const backend = process.env['WEBWAIFU_MEMORY_BACKEND']?.trim().toLowerCase();
    if (backend === 'json' || backend === 'json-fallback') {
      this.fallbackReason = 'WEBWAIFU_MEMORY_BACKEND=json';
    }
  }

  getBackendLabel() {
    return this.fallbackReason ? 'json-fallback' : 'ladybug';
  }

  async getStatus() {
    try {
      const state = await this.open();
      const [
        snapshots,
        grilloScopes,
        semanticScopes,
        scopes,
        participants,
        personas,
        turnEvents,
        candidates,
        memoryBlocks,
        memorySlots,
        memorySlotPatches,
        diaryEntries,
        grilloActivities,
        workerContextTraces,
        emotionStates,
        emotionIntensities,
        semanticRecords,
        semanticVectors,
        relationshipProfiles,
        relationshipFacts,
        hasCandidateEdges,
        hasBlockEdges,
        hasTurnEdges,
        hasSlotEdges,
        hasSlotPatchEdges,
        hasDiaryEdges,
        hasActivityEdges,
        hasTraceEdges,
        hasEmotionEdges,
        hasEmotionIntensityEdges,
        hasSemanticEdges,
        hasVectorEdges,
        hasVectorPersonaEdges,
        hasRelationshipEdges,
        hasRelationshipPersonaEdges,
        hasRelationshipParticipantEdges,
        hasRelationshipFactEdges,
        blockSourceCandidateEdges,
        slotSourceCandidateEdges,
      ] = await Promise.all([
        this.scalarCount('MATCH (m:MemoryState) RETURN count(m) AS count'),
        this.scalarCount("MATCH (m:MemoryState) WHERE m.kind = 'grillo' RETURN count(m) AS count"),
        this.scalarCount(
          "MATCH (m:MemoryState) WHERE m.kind = 'semantic' RETURN count(m) AS count",
        ),
        this.scalarCount('MATCH (m:MemoryScope) RETURN count(m) AS count'),
        this.scalarCount('MATCH (m:Participant) RETURN count(m) AS count'),
        this.scalarCount('MATCH (m:Persona) RETURN count(m) AS count'),
        this.scalarCount('MATCH (m:TurnEvent) RETURN count(m) AS count'),
        this.scalarCount('MATCH (m:MemoryCandidate) RETURN count(m) AS count'),
        this.scalarCount('MATCH (m:MemoryBlock) RETURN count(m) AS count'),
        this.scalarCount('MATCH (m:MemorySlot) RETURN count(m) AS count'),
        this.scalarCount('MATCH (m:MemorySlotPatch) RETURN count(m) AS count'),
        this.scalarCount('MATCH (m:DiaryEntry) RETURN count(m) AS count'),
        this.scalarCount('MATCH (m:GrilloActivity) RETURN count(m) AS count'),
        this.scalarCount('MATCH (m:WorkerContextTrace) RETURN count(m) AS count'),
        this.scalarCount('MATCH (m:EmotionState) RETURN count(m) AS count'),
        this.scalarCount('MATCH (m:EmotionIntensity) RETURN count(m) AS count'),
        this.scalarCount('MATCH (m:SemanticRecord) RETURN count(m) AS count'),
        this.scalarCount('MATCH (m:SemanticVector) RETURN count(m) AS count'),
        this.scalarCount('MATCH (m:RelationshipProfile) RETURN count(m) AS count'),
        this.scalarCount('MATCH (m:RelationshipFact) RETURN count(m) AS count'),
        this.scalarCount(
          'MATCH (s:MemoryScope)-[:HAS_CANDIDATE]->(m:MemoryCandidate) RETURN count(m) AS count',
        ),
        this.scalarCount(
          'MATCH (s:MemoryScope)-[:HAS_BLOCK]->(m:MemoryBlock) RETURN count(m) AS count',
        ),
        this.scalarCount(
          'MATCH (s:MemoryScope)-[:HAS_TURN]->(m:TurnEvent) RETURN count(m) AS count',
        ),
        this.scalarCount(
          'MATCH (s:MemoryScope)-[:HAS_SLOT]->(m:MemorySlot) RETURN count(m) AS count',
        ),
        this.scalarCount(
          'MATCH (s:MemoryScope)-[:HAS_SLOT_PATCH]->(m:MemorySlotPatch) RETURN count(m) AS count',
        ),
        this.scalarCount(
          'MATCH (s:MemoryScope)-[:HAS_DIARY]->(m:DiaryEntry) RETURN count(m) AS count',
        ),
        this.scalarCount(
          'MATCH (s:MemoryScope)-[:HAS_ACTIVITY]->(m:GrilloActivity) RETURN count(m) AS count',
        ),
        this.scalarCount(
          'MATCH (s:MemoryScope)-[:HAS_TRACE]->(m:WorkerContextTrace) RETURN count(m) AS count',
        ),
        this.scalarCount(
          'MATCH (s:MemoryScope)-[:HAS_EMOTION]->(m:EmotionState) RETURN count(m) AS count',
        ),
        this.scalarCount(
          'MATCH (m:EmotionState)-[:HAS_EMOTION_INTENSITY]->(i:EmotionIntensity) RETURN count(i) AS count',
        ),
        this.scalarCount(
          'MATCH (s:MemoryScope)-[:HAS_SEMANTIC]->(m:SemanticRecord) RETURN count(m) AS count',
        ),
        this.scalarCount(
          'MATCH (s:MemoryScope)-[:HAS_VECTOR]->(m:SemanticVector) RETURN count(m) AS count',
        ),
        this.scalarCount(
          'MATCH (m:SemanticVector)-[:VECTOR_FOR_PERSONA]->(p:Persona) RETURN count(m) AS count',
        ),
        this.scalarCount(
          'MATCH (s:MemoryScope)-[:HAS_RELATIONSHIP]->(m:RelationshipProfile) RETURN count(m) AS count',
        ),
        this.scalarCount(
          'MATCH (m:RelationshipProfile)-[:RELATIONSHIP_AS_PERSONA]->(p:Persona) RETURN count(m) AS count',
        ),
        this.scalarCount(
          'MATCH (m:RelationshipProfile)-[:RELATIONSHIP_WITH_PARTICIPANT]->(p:Participant) RETURN count(m) AS count',
        ),
        this.scalarCount(
          'MATCH (m:RelationshipProfile)-[:HAS_RELATIONSHIP_FACT]->(f:RelationshipFact) RETURN count(f) AS count',
        ),
        this.scalarCount(
          'MATCH (m:MemoryBlock)-[:BLOCK_FROM_CANDIDATE]->(c:MemoryCandidate) RETURN count(c) AS count',
        ),
        this.scalarCount(
          'MATCH (m:MemorySlot)-[:SLOT_FROM_CANDIDATE]->(c:MemoryCandidate) RETURN count(c) AS count',
        ),
      ]);
      const relationshipEdges =
        hasCandidateEdges +
        hasBlockEdges +
        hasTurnEdges +
        hasSlotEdges +
        hasSlotPatchEdges +
        hasDiaryEdges +
        hasActivityEdges +
        hasTraceEdges +
        hasEmotionEdges +
        hasEmotionIntensityEdges +
        hasSemanticEdges +
        hasVectorEdges +
        hasVectorPersonaEdges +
        hasRelationshipEdges +
        hasRelationshipPersonaEdges +
        hasRelationshipParticipantEdges +
        hasRelationshipFactEdges +
        blockSourceCandidateEdges +
        slotSourceCandidateEdges;
      return {
        backend: 'ladybug',
        dbDir: this.dbDir,
        initialized: state.initialized,
        snapshots,
        grilloScopes,
        semanticScopes,
        scopes,
        participants,
        personas,
        turnEvents,
        candidates,
        memoryBlocks,
        memorySlots,
        memorySlotPatches,
        diaryEntries,
        grilloActivities,
        workerContextTraces,
        emotionStates,
        emotionIntensities,
        semanticRecords,
        semanticVectors,
        relationshipProfiles,
        relationshipFacts,
        relationshipEdges,
      };
    } catch (error) {
      return this.getFallbackStatus(error);
    }
  }

  async loadGrilloState(scopeKey: string) {
    try {
      const snapshot = await this.loadSnapshot('grillo', scopeKey);
      return snapshot ? safeJsonParse(snapshot.json) : null;
    } catch (error) {
      return this.loadFallbackSnapshotValue('grillo', scopeKey, error);
    }
  }

  async saveGrilloState(scopeKey: string, state: unknown) {
    try {
      await this.saveSnapshot('grillo', scopeKey, state);
      await this.replaceGrilloGraph(scopeKey, state);
    } catch (error) {
      await this.saveFallbackSnapshotValue('grillo', scopeKey, state, error);
    }
  }

  async deleteGrilloState(scopeKey: string) {
    const normalizedScopeKey = normalizeScopeKey(scopeKey);
    try {
      await this.deleteSnapshot('grillo', normalizedScopeKey);
      await this.deleteGrilloRecordsForScope(normalizedScopeKey);
      await this.deleteGraphRowsForScope(
        normalizedScopeKey,
        [
          'TurnEvent',
          'MemoryCandidate',
          'MemoryBlock',
          'MemorySlot',
          'MemorySlotPatch',
          'DiaryEntry',
          'EmotionState',
          'EmotionIntensity',
          'GrilloActivity',
          'WorkerContextTrace',
        ],
        true,
      );
    } catch (error) {
      await this.deleteFallbackSnapshotValue('grillo', normalizedScopeKey, error);
    }
  }

  async loadSemanticRecords(scopeKey: string): Promise<LadybugSemanticMemoryRecord[] | null> {
    try {
      const snapshot = await this.loadSnapshot('semantic', scopeKey);
      if (!snapshot) {
        return null;
      }
      const parsed = safeJsonParse(snapshot.json);
      return Array.isArray(parsed) ? normalizeSemanticRecords(parsed) : [];
    } catch (error) {
      const fallback = await this.loadFallbackSnapshotValue('semantic', scopeKey, error);
      return Array.isArray(fallback) ? normalizeSemanticRecords(fallback) : null;
    }
  }

  async saveSemanticRecords(scopeKey: string, records: LadybugSemanticMemoryRecord[]) {
    const normalized = normalizeSemanticRecords(records);
    try {
      await this.saveSnapshot('semantic', scopeKey, normalized);
      await this.replaceSemanticGraph(scopeKey, normalized);
    } catch (error) {
      await this.saveFallbackSnapshotValue('semantic', scopeKey, normalized, error);
    }
  }

  async querySemanticVectors(
    scopeKey: string,
    embedding: number[],
    limit = 4,
  ): Promise<LadybugSemanticMemoryMatch[]> {
    const normalizedEmbedding = normalizeEmbeddingArray(embedding);
    if (normalizedEmbedding.length === 0) {
      return [];
    }
    const normalizedScopeKey = normalizeScopeKey(scopeKey);
    try {
      await this.open();
      await this.ensureSemanticVectorIndex(normalizedEmbedding.length).catch(() => undefined);
    } catch (error) {
      return this.queryFallbackSemanticVectors(
        normalizedScopeKey,
        normalizedEmbedding,
        limit,
        error,
      );
    }
    const vectorTable = semanticVectorTableName(normalizedEmbedding.length);
    const vectorIndex = semanticVectorIndexName(normalizedEmbedding.length);
    const rows = await this.all(
      `CALL QUERY_VECTOR_INDEX('${vectorTable}', '${vectorIndex}', ${vectorLiteral(normalizedEmbedding)}, ${Math.max(limit * 8, limit)}) WITH node AS n, distance WHERE n.scopeKey = ${q(normalizedScopeKey)} RETURN n.id AS id, n.scopeKey AS scopeKey, n.personaId AS personaId, n.text AS text, n.userText AS userText, n.assistantText AS assistantText, n.embedding AS embedding, n.createdAt AS createdAt, distance ORDER BY distance LIMIT ${Math.max(1, Math.min(20, Math.trunc(limit)))}`,
    ).catch(() => []);
    return rows.map((row) => {
      const distance = numberValue(row['distance'], 1);
      const embeddingValue = Array.isArray(row['embedding'])
        ? normalizeEmbeddingArray(row['embedding'])
        : [];
      return {
        assistantText: stringValue(row['assistantText']).slice(0, 1200),
        createdAt: intValue(row['createdAt']),
        distance,
        embedding: embeddingValue.length ? embeddingValue : null,
        id: stringValue(row['id']),
        personaId: stringValue(row['personaId']) || 'unknown',
        scopeKey: stringValue(row['scopeKey']) || normalizedScopeKey,
        score: Math.max(0, 1 - distance),
        text: stringValue(row['text']),
        userText: stringValue(row['userText']).slice(0, 1200),
      };
    });
  }

  async deleteSemanticRecords(scopeKey: string) {
    const normalizedScopeKey = normalizeScopeKey(scopeKey);
    try {
      await this.deleteSnapshot('semantic', normalizedScopeKey);
      await this.deleteGraphRowsForScope(
        normalizedScopeKey,
        ['SemanticRecord', 'SemanticVector'],
        true,
      );
    } catch (error) {
      await this.deleteFallbackSnapshotValue('semantic', normalizedScopeKey, error);
    }
  }

  async loadRelationshipProfiles() {
    try {
      const snapshot = await this.loadSnapshot('relationships', 'all');
      if (!snapshot) {
        return null;
      }
      const parsed = safeJsonParse(snapshot.json);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
      const fallback = await this.loadFallbackSnapshotValue('relationships', 'all', error);
      return fallback && typeof fallback === 'object' && !Array.isArray(fallback) ? fallback : null;
    }
  }

  async saveRelationshipProfiles(profiles: Record<string, unknown>) {
    const normalizedProfiles = normalizeRelationshipProfiles(profiles);
    try {
      await this.saveSnapshot('relationships', 'all', normalizedProfiles);
      await this.replaceRelationshipGraph(normalizedProfiles);
    } catch (error) {
      await this.saveFallbackSnapshotValue('relationships', 'all', normalizedProfiles, error);
    }
  }

  async deleteRelationshipProfile(scopeKey: string) {
    const normalizedScopeKey = normalizeScopeKey(scopeKey);
    const profiles = await this.loadRelationshipProfiles();
    const nextProfiles =
      profiles && typeof profiles === 'object' && !Array.isArray(profiles)
        ? { ...(profiles as Record<string, unknown>) }
        : {};
    delete nextProfiles[normalizedScopeKey];
    await this.saveRelationshipProfiles(nextProfiles);
    try {
      await this.deleteScopeNodeIfUnused(normalizedScopeKey);
    } catch {
      // The JSON fallback has no graph rows to prune.
    }
  }

  async appendGrilloRecord(entity: LadybugGrilloRecordEntity, record: Record<string, unknown>) {
    const normalizedEntity = normalizeGrilloEntity(entity);
    const normalizedRecord = normalizeGrilloRecord(normalizedEntity, record);
    try {
      await this.appendNativeGrilloRecord(normalizedEntity, normalizedRecord);
    } catch (error) {
      await this.appendFallbackGrilloRecord(normalizedEntity, normalizedRecord, error);
    }
  }

  async readGrilloRecords<T = Record<string, unknown>>(
    entity: LadybugGrilloRecordEntity,
  ): Promise<T[]> {
    const normalizedEntity = normalizeGrilloEntity(entity);
    try {
      await this.open();
      const rows = await this.all(
        `MATCH (m:GrilloRecord) WHERE m.entity = ${q(normalizedEntity)} RETURN m.json AS json, m.seq AS seq, m.id AS id`,
      );
      return rows
        .map((row) => ({
          id: stringValue(row['id']),
          seq: numberValue(row['seq'], 0),
          value: safeJsonParse(String(row['json'] ?? '')),
        }))
        .filter((row): row is { id: string; seq: number; value: T } => Boolean(row.value))
        .sort((left, right) => left.seq - right.seq || left.id.localeCompare(right.id))
        .map((row) => row.value);
    } catch (error) {
      return this.readFallbackGrilloRecords<T>(normalizedEntity, error);
    }
  }

  async replaceGrilloRecords(
    entity: LadybugGrilloRecordEntity,
    records: Record<string, unknown>[],
  ) {
    const normalizedEntity = normalizeGrilloEntity(entity);
    const normalizedRecords = records.map((record) =>
      normalizeGrilloRecord(normalizedEntity, record),
    );
    try {
      await this.deleteNativeGrilloEntity(normalizedEntity);
      for (const record of normalizedRecords) {
        await this.appendNativeGrilloRecord(normalizedEntity, record);
      }
    } catch (error) {
      await this.replaceFallbackGrilloRecords(normalizedEntity, normalizedRecords, error);
    }
  }

  async getGrilloSingleton<T = Record<string, unknown>>(
    entity: LadybugGrilloSingletonEntity,
  ): Promise<T | null> {
    const normalizedEntity = normalizeGrilloSingletonEntity(entity);
    try {
      await this.open();
      const rows = await this.all(
        `MATCH (m:GrilloSingleton) WHERE m.entity = ${q(normalizedEntity)} RETURN m.json AS json`,
      );
      const parsed = safeJsonParse(String(rows[0]?.['json'] ?? ''));
      return parsed ? (parsed as T) : null;
    } catch (error) {
      return this.readFallbackGrilloSingleton<T>(normalizedEntity, error);
    }
  }

  async setGrilloSingleton(entity: LadybugGrilloSingletonEntity, value: Record<string, unknown>) {
    const normalizedEntity = normalizeGrilloSingletonEntity(entity);
    try {
      await this.open();
      await this.exec(`MATCH (m:GrilloSingleton) WHERE m.entity = ${q(normalizedEntity)} DELETE m`);
      await this.exec(
        `CREATE (:GrilloSingleton {entity: ${q(normalizedEntity)}, json: ${q(JSON.stringify(value))}, updatedAt: ${Date.now()}})`,
      );
    } catch (error) {
      await this.writeFallbackGrilloSingleton(normalizedEntity, value, error);
    }
  }

  async upsertGrilloMemorySlot(slot: LadybugMemorySlotRecord) {
    await this.replaceOneGrilloRecord(
      'memory_slots',
      slot.slot_id,
      slot as unknown as Record<string, unknown>,
    );
  }

  async listGrilloMemorySlots(userId?: string): Promise<LadybugMemorySlotRecord[]> {
    const rows = await this.readGrilloRecords<LadybugMemorySlotRecord>('memory_slots');
    return userId ? rows.filter((row) => row.user_id === userId) : rows;
  }

  async appendGrilloMemorySlotPatch(patch: LadybugMemorySlotPatchRecord) {
    await this.appendGrilloRecord(
      'memory_slot_patches',
      patch as unknown as Record<string, unknown>,
    );
  }

  async listGrilloMemorySlotPatches(userId?: string): Promise<LadybugMemorySlotPatchRecord[]> {
    const rows = await this.readGrilloRecords<LadybugMemorySlotPatchRecord>('memory_slot_patches');
    return userId ? rows.filter((row) => row.user_id === userId) : rows;
  }

  async upsertGrilloEmotionState(scopeKey: string, state: Record<string, unknown>) {
    const normalizedScopeKey = normalizeScopeKey(scopeKey);
    const emotionStateId = `emotion:${normalizedScopeKey}`;
    const updatedAt = intValue(state['updatedAt'] ?? state['updated_at'] ?? Date.now());
    const lastSignalAt = intValue(state['lastSignalAt'] ?? state['last_signal_at'] ?? updatedAt);
    const intensities = normalizeEmotionIntensityMap(
      state['intensities'] ?? state['intensities_json'],
    );
    const record = {
      ...state,
      emotionStateId: emotionStateId,
      emotion_state_id: emotionStateId,
      intensities,
      intensities_json: JSON.stringify(intensities),
      lastSignalAt,
      lastSignalSource: stringValue(state['lastSignalSource'] ?? state['last_signal_source']),
      last_signal_at: String(lastSignalAt),
      last_signal_source: stringValue(state['lastSignalSource'] ?? state['last_signal_source']),
      schema_version: '1.0.0',
      scopeKey: normalizedScopeKey,
      scope_key: normalizedScopeKey,
      updatedAt,
      updated_at: String(updatedAt),
      user_id: normalizedScopeKey,
    };
    await this.replaceOneGrilloRecord('emotion_states', emotionStateId, record);
    return record as LadybugEmotionStateRecord & Record<string, unknown>;
  }

  async getGraphSummary(): Promise<LadybugMemoryGraphSummary> {
    try {
      await this.open();
      const [
        hasCandidateEdges,
        hasBlockEdges,
        hasTurnEdges,
        hasSlotEdges,
        hasSlotPatchEdges,
        hasDiaryEdges,
        hasSemanticEdges,
        candidateAboutEdges,
        blockAboutEdges,
        turnByEdges,
        slotAboutEdges,
        diaryAboutEdges,
        activityEdges,
        traceEdges,
        emotionScopeEdges,
        emotionIntensityEdges,
        semanticForPersonaEdges,
        vectorScopeEdges,
        vectorPersonaEdges,
        relationshipScopeEdges,
        relationshipPersonaEdges,
        relationshipParticipantEdges,
        relationshipFactEdges,
        blockSourceCandidateEdges,
        slotSourceCandidateEdges,
        scopes,
        participants,
        personas,
        turns,
        candidates,
        blocks,
        slots,
        slotPatches,
        diary,
        activities,
        traces,
        emotions,
        emotionIntensities,
        relationships,
        relationshipFacts,
        semantic,
        vectors,
      ] = await Promise.all([
        this.scalarCount(
          'MATCH (s:MemoryScope)-[:HAS_CANDIDATE]->(m:MemoryCandidate) RETURN count(m) AS count',
        ),
        this.scalarCount(
          'MATCH (s:MemoryScope)-[:HAS_BLOCK]->(m:MemoryBlock) RETURN count(m) AS count',
        ),
        this.scalarCount(
          'MATCH (s:MemoryScope)-[:HAS_TURN]->(m:TurnEvent) RETURN count(m) AS count',
        ),
        this.scalarCount(
          'MATCH (s:MemoryScope)-[:HAS_SLOT]->(m:MemorySlot) RETURN count(m) AS count',
        ),
        this.scalarCount(
          'MATCH (s:MemoryScope)-[:HAS_SLOT_PATCH]->(m:MemorySlotPatch) RETURN count(m) AS count',
        ),
        this.scalarCount(
          'MATCH (s:MemoryScope)-[:HAS_DIARY]->(m:DiaryEntry) RETURN count(m) AS count',
        ),
        this.scalarCount(
          'MATCH (s:MemoryScope)-[:HAS_SEMANTIC]->(m:SemanticRecord) RETURN count(m) AS count',
        ),
        this.scalarCount(
          'MATCH (m:MemoryCandidate)-[:CANDIDATE_ABOUT]->(p:Participant) RETURN count(m) AS count',
        ),
        this.scalarCount(
          'MATCH (m:MemoryBlock)-[:BLOCK_ABOUT]->(p:Participant) RETURN count(m) AS count',
        ),
        this.scalarCount(
          'MATCH (m:TurnEvent)-[:TURN_BY]->(p:Participant) RETURN count(m) AS count',
        ),
        this.scalarCount(
          'MATCH (m:MemorySlot)-[:SLOT_ABOUT]->(p:Participant) RETURN count(m) AS count',
        ),
        this.scalarCount(
          'MATCH (m:DiaryEntry)-[:DIARY_ABOUT]->(p:Participant) RETURN count(m) AS count',
        ),
        this.scalarCount(
          'MATCH (s:MemoryScope)-[:HAS_ACTIVITY]->(m:GrilloActivity) RETURN count(m) AS count',
        ),
        this.scalarCount(
          'MATCH (s:MemoryScope)-[:HAS_TRACE]->(m:WorkerContextTrace) RETURN count(m) AS count',
        ),
        this.scalarCount(
          'MATCH (s:MemoryScope)-[:HAS_EMOTION]->(m:EmotionState) RETURN count(m) AS count',
        ),
        this.scalarCount(
          'MATCH (m:EmotionState)-[:HAS_EMOTION_INTENSITY]->(i:EmotionIntensity) RETURN count(i) AS count',
        ),
        this.scalarCount(
          'MATCH (m:SemanticRecord)-[:SEMANTIC_FOR_PERSONA]->(p:Persona) RETURN count(m) AS count',
        ),
        this.scalarCount(
          'MATCH (s:MemoryScope)-[:HAS_VECTOR]->(m:SemanticVector) RETURN count(m) AS count',
        ),
        this.scalarCount(
          'MATCH (m:SemanticVector)-[:VECTOR_FOR_PERSONA]->(p:Persona) RETURN count(m) AS count',
        ),
        this.scalarCount(
          'MATCH (s:MemoryScope)-[:HAS_RELATIONSHIP]->(m:RelationshipProfile) RETURN count(m) AS count',
        ),
        this.scalarCount(
          'MATCH (m:RelationshipProfile)-[:RELATIONSHIP_AS_PERSONA]->(p:Persona) RETURN count(m) AS count',
        ),
        this.scalarCount(
          'MATCH (m:RelationshipProfile)-[:RELATIONSHIP_WITH_PARTICIPANT]->(p:Participant) RETURN count(m) AS count',
        ),
        this.scalarCount(
          'MATCH (m:RelationshipProfile)-[:HAS_RELATIONSHIP_FACT]->(f:RelationshipFact) RETURN count(f) AS count',
        ),
        this.scalarCount(
          'MATCH (m:MemoryBlock)-[:BLOCK_FROM_CANDIDATE]->(c:MemoryCandidate) RETURN count(c) AS count',
        ),
        this.scalarCount(
          'MATCH (m:MemorySlot)-[:SLOT_FROM_CANDIDATE]->(c:MemoryCandidate) RETURN count(c) AS count',
        ),
        this.all(
          'MATCH (s:MemoryScope) RETURN s.id AS id, s.source AS source, s.channel AS channel, s.personaId AS personaId LIMIT 12',
        ),
        this.all(
          'MATCH (p:Participant) RETURN p.id AS id, p.source AS source, p.channel AS channel, p.displayName AS displayName LIMIT 16',
        ),
        this.all('MATCH (p:Persona) RETURN p.id AS id, p.name AS name LIMIT 12'),
        this.all(
          'MATCH (m:TurnEvent) RETURN m.id AS id, m.scopeKey AS scopeKey, m.role AS role, m.content AS content, m.authorName AS authorName, m.createdAt AS createdAt LIMIT 8',
        ),
        this.all(
          'MATCH (m:MemoryCandidate) RETURN m.id AS id, m.participantKey AS participantKey, m.type AS type, m.summary AS summary LIMIT 8',
        ),
        this.all(
          'MATCH (m:MemoryBlock) RETURN m.id AS id, m.scopeKey AS scopeKey, m.participantKey AS participantKey, m.blockName AS blockName, m.itemsJson AS itemsJson LIMIT 8',
        ),
        this.all(
          'MATCH (m:MemorySlot) RETURN m.id AS id, m.scopeKey AS scopeKey, m.participantKey AS participantKey, m.slotName AS slotName, m.contentJson AS contentJson, m.updatedAt AS updatedAt LIMIT 8',
        ),
        this.all(
          'MATCH (m:MemorySlotPatch) RETURN m.id AS id, m.scopeKey AS scopeKey, m.participantKey AS participantKey, m.slotId AS slotId, m.slotName AS slotName, m.operation AS operation, m.createdAt AS createdAt LIMIT 8',
        ),
        this.all(
          'MATCH (m:DiaryEntry) RETURN m.id AS id, m.participantKey AS participantKey, m.beatType AS beatType, m.summary AS summary LIMIT 8',
        ),
        this.all(
          'MATCH (m:GrilloActivity) RETURN m.id AS id, m.scopeKey AS scopeKey, m.beatType AS beatType, m.promptText AS promptText, m.responseText AS responseText, m.createdAt AS createdAt ORDER BY m.createdAt DESC LIMIT 8',
        ),
        this.all(
          'MATCH (m:WorkerContextTrace) RETURN m.id AS id, m.scopeKey AS scopeKey, m.taskType AS taskType, m.beatType AS beatType, m.provider AS provider, m.model AS model, m.systemPrompt AS systemPrompt, m.prompt AS prompt, m.createdAt AS createdAt ORDER BY m.createdAt DESC LIMIT 8',
        ),
        this.all(
          'MATCH (m:EmotionState) RETURN m.id AS id, m.scopeKey AS scopeKey, m.lastSignalSource AS lastSignalSource, m.updatedAt AS updatedAt LIMIT 8',
        ),
        this.all(
          'MATCH (m:EmotionIntensity) RETURN m.id AS id, m.scopeKey AS scopeKey, m.emotionStateId AS emotionStateId, m.name AS name, m.intensity AS intensity, m.updatedAt AS updatedAt LIMIT 12',
        ),
        this.all(
          'MATCH (m:RelationshipProfile) RETURN m.id AS id, m.scopeKey AS scopeKey, m.relationshipStage AS relationshipStage, m.mood AS mood, m.summary AS summary LIMIT 8',
        ),
        this.all(
          'MATCH (m:RelationshipProfile)-[:HAS_RELATIONSHIP_FACT]->(f:RelationshipFact) RETURN f.id AS id, m.scopeKey AS scopeKey, f.text AS text LIMIT 8',
        ),
        this.all(
          'MATCH (m:SemanticRecord) RETURN m.id AS id, m.personaId AS personaId, m.text AS text LIMIT 8',
        ),
        this.all(
          'MATCH (m:SemanticVector) RETURN m.id AS id, m.personaId AS personaId, m.text AS text LIMIT 8',
        ),
      ]);

      return {
        edges: [
          { relation: 'HAS_CANDIDATE', count: hasCandidateEdges },
          { relation: 'HAS_BLOCK', count: hasBlockEdges },
          { relation: 'HAS_TURN', count: hasTurnEdges },
          { relation: 'HAS_SLOT', count: hasSlotEdges },
          { relation: 'HAS_SLOT_PATCH', count: hasSlotPatchEdges },
          { relation: 'HAS_DIARY', count: hasDiaryEdges },
          { relation: 'HAS_SEMANTIC', count: hasSemanticEdges },
          { relation: 'CANDIDATE_ABOUT', count: candidateAboutEdges },
          { relation: 'BLOCK_ABOUT', count: blockAboutEdges },
          { relation: 'TURN_BY', count: turnByEdges },
          { relation: 'SLOT_ABOUT', count: slotAboutEdges },
          { relation: 'DIARY_ABOUT', count: diaryAboutEdges },
          { relation: 'HAS_ACTIVITY', count: activityEdges },
          { relation: 'HAS_TRACE', count: traceEdges },
          { relation: 'HAS_EMOTION', count: emotionScopeEdges },
          { relation: 'HAS_EMOTION_INTENSITY', count: emotionIntensityEdges },
          { relation: 'SEMANTIC_FOR_PERSONA', count: semanticForPersonaEdges },
          { relation: 'HAS_VECTOR', count: vectorScopeEdges },
          { relation: 'VECTOR_FOR_PERSONA', count: vectorPersonaEdges },
          { relation: 'HAS_RELATIONSHIP', count: relationshipScopeEdges },
          { relation: 'RELATIONSHIP_AS_PERSONA', count: relationshipPersonaEdges },
          { relation: 'RELATIONSHIP_WITH_PARTICIPANT', count: relationshipParticipantEdges },
          { relation: 'HAS_RELATIONSHIP_FACT', count: relationshipFactEdges },
          { relation: 'BLOCK_FROM_CANDIDATE', count: blockSourceCandidateEdges },
          { relation: 'SLOT_FROM_CANDIDATE', count: slotSourceCandidateEdges },
        ].filter((edge) => edge.count > 0),
        participants: participants.map((row) => ({
          channel: stringValue(row['channel']),
          displayName: stringValue(row['displayName']),
          id: stringValue(row['id']),
          source: stringValue(row['source']),
        })),
        personas: personas.map((row) => ({
          id: stringValue(row['id']),
          name: stringValue(row['name']),
        })),
        recent: {
          activities: activities.map((row) => ({
            beatType: stringValue(row['beatType']),
            createdAt: Number(row['createdAt'] ?? 0),
            id: stringValue(row['id']),
            promptText: stringValue(row['promptText']),
            responseText: stringValue(row['responseText']),
            scopeKey: stringValue(row['scopeKey']),
          })),
          blocks: blocks.map((row) => ({
            blockName: stringValue(row['blockName']),
            id: stringValue(row['id']),
            itemCount: arrayValue(safeJsonParse(stringValue(row['itemsJson']))).length,
            items: arrayValue(safeJsonParse(stringValue(row['itemsJson'])))
              .map((item) => stringValue(item))
              .filter(Boolean)
              .slice(0, 4),
            participantKey: stringValue(row['participantKey']),
            scopeKey: stringValue(row['scopeKey']),
          })),
          candidates: candidates.map((row) => ({
            id: stringValue(row['id']),
            participantKey: stringValue(row['participantKey']),
            summary: stringValue(row['summary']),
            type: stringValue(row['type']),
          })),
          diary: diary.map((row) => ({
            beatType: stringValue(row['beatType']),
            id: stringValue(row['id']),
            participantKey: stringValue(row['participantKey']),
            summary: stringValue(row['summary']),
          })),
          emotions: emotions.map((row) => ({
            id: stringValue(row['id']),
            lastSignalSource: stringValue(row['lastSignalSource']),
            scopeKey: stringValue(row['scopeKey']),
            updatedAt: Number(row['updatedAt'] ?? 0),
          })),
          emotionIntensities: emotionIntensities.map((row) => ({
            emotionStateId: stringValue(row['emotionStateId']),
            id: stringValue(row['id']),
            intensity: numberValue(row['intensity'], 0),
            name: stringValue(row['name']),
            scopeKey: stringValue(row['scopeKey']),
            updatedAt: Number(row['updatedAt'] ?? 0),
          })),
          relationships: relationships.map((row) => ({
            id: stringValue(row['id']),
            mood: stringValue(row['mood']),
            relationshipStage: stringValue(row['relationshipStage']),
            scopeKey: stringValue(row['scopeKey']),
            summary: stringValue(row['summary']),
          })),
          relationshipFacts: relationshipFacts.map((row) => ({
            id: stringValue(row['id']),
            scopeKey: stringValue(row['scopeKey']),
            text: stringValue(row['text']),
          })),
          semantic: semantic.map((row) => ({
            id: stringValue(row['id']),
            personaId: stringValue(row['personaId']),
            text: stringValue(row['text']),
          })),
          slotPatches: slotPatches.map((row) => ({
            createdAt: Number(row['createdAt'] ?? 0),
            id: stringValue(row['id']),
            operation: stringValue(row['operation']),
            participantKey: stringValue(row['participantKey']),
            scopeKey: stringValue(row['scopeKey']),
            slotId: stringValue(row['slotId']),
            slotName: stringValue(row['slotName']),
          })),
          slots: slots.map((row) => {
            const parsedItems = safeJsonParse(stringValue(row['contentJson']));
            const items = arrayValue(parsedItems).map((item) => stringValue(item)).filter(Boolean);
            return {
              id: stringValue(row['id']),
              itemCount: items.length,
              items: items.slice(0, 4),
              participantKey: stringValue(row['participantKey']),
              slotName: stringValue(row['slotName']),
              scopeKey: stringValue(row['scopeKey']),
              updatedAt: Number(row['updatedAt'] ?? 0),
            };
          }),
          traces: traces.map((row) => ({
            beatType: stringValue(row['beatType']),
            createdAt: Number(row['createdAt'] ?? 0),
            id: stringValue(row['id']),
            model: stringValue(row['model']),
            prompt: stringValue(row['prompt']),
            provider: stringValue(row['provider']),
            scopeKey: stringValue(row['scopeKey']),
            systemPrompt: stringValue(row['systemPrompt']),
            taskType: stringValue(row['taskType']),
          })),
          turns: turns.map((row) => ({
            authorName: stringValue(row['authorName']),
            createdAt: Number(row['createdAt'] ?? 0),
            id: stringValue(row['id']),
            role: stringValue(row['role']),
            scopeKey: stringValue(row['scopeKey']),
            text: stringValue(row['content']),
          })),
          vectors: vectors.map((row) => ({
            id: stringValue(row['id']),
            personaId: stringValue(row['personaId']),
            text: stringValue(row['text']),
          })),
        },
        scopes: scopes.map((row) => ({
          channel: stringValue(row['channel']),
          id: stringValue(row['id']),
          personaId: stringValue(row['personaId']),
          source: stringValue(row['source']),
        })),
      };
    } catch (error) {
      return this.getFallbackGraphSummary(error);
    }
  }

  private async getFallbackStatus(error: unknown) {
    await this.enableFallback(error);
    const store = await this.readFallbackStore();
    const snapshots = Object.values(store.snapshots);
    const grilloStates = snapshots.filter((snapshot) => snapshot.kind === 'grillo');
    const semanticStates = snapshots.filter((snapshot) => snapshot.kind === 'semantic');
    const relationshipProfiles = getFallbackRelationshipProfiles(store);
    const grilloCounts = grilloStates.reduce(
      (counts, snapshot) => {
        const value =
          snapshot.value && typeof snapshot.value === 'object'
            ? (snapshot.value as Record<string, unknown>)
            : {};
        counts.candidates += arrayValue(value['candidates']).length;
        counts.memoryBlocks += arrayValue(value['blocks']).length;
        counts.diaryEntries += [
          ...arrayValue(value['diaryEntries']),
          ...arrayValue(value['diary']),
        ].length;
        return counts;
      },
      { candidates: 0, diaryEntries: 0, memoryBlocks: 0 },
    );
    const semanticRecords = semanticStates.reduce(
      (count, snapshot) =>
        count +
        (Array.isArray(snapshot.value) ? normalizeSemanticRecords(snapshot.value).length : 0),
      0,
    );
    return {
      backend: 'json-fallback',
      dbDir: this.dbDir,
      fallbackFile: this.fallbackStorePath,
      fallbackReason: store.reason ?? this.fallbackReason,
      initialized: true,
      snapshots: snapshots.length,
      grilloScopes: new Set(grilloStates.map((snapshot) => snapshot.scopeKey)).size,
      semanticScopes: new Set(semanticStates.map((snapshot) => snapshot.scopeKey)).size,
      scopes: new Set(snapshots.map((snapshot) => snapshot.scopeKey)).size,
      participants: 0,
      personas: 0,
      turnEvents: 0,
      candidates: grilloCounts.candidates,
      memoryBlocks: grilloCounts.memoryBlocks,
      memorySlots: 0,
      memorySlotPatches: 0,
      diaryEntries: grilloCounts.diaryEntries,
      grilloActivities: 0,
      workerContextTraces: 0,
      emotionStates: 0,
      emotionIntensities: 0,
      semanticRecords,
      semanticVectors: semanticRecords,
      relationshipProfiles: Object.keys(relationshipProfiles).length,
      relationshipFacts: Object.values(relationshipProfiles).reduce<number>(
        (count, profile) =>
          count +
          (profile && typeof profile === 'object'
            ? getRelationshipFacts(profile as Record<string, unknown>).length
            : 0),
        0,
      ),
      relationshipEdges: 0,
    };
  }

  private async getFallbackGraphSummary(error: unknown): Promise<LadybugMemoryGraphSummary> {
    await this.enableFallback(error);
    const store = await this.readFallbackStore();
    const snapshots = Object.values(store.snapshots);
    const grilloStates = snapshots.filter((snapshot) => snapshot.kind === 'grillo');
    const semanticStates = snapshots.filter((snapshot) => snapshot.kind === 'semantic');
    const relationshipProfiles = getFallbackRelationshipProfiles(store);
    const recent = createEmptyGraphSummary().recent;

    for (const snapshot of grilloStates.slice(-8)) {
      const value =
        snapshot.value && typeof snapshot.value === 'object'
          ? (snapshot.value as Record<string, unknown>)
          : {};
      for (const block of arrayValue(value['blocks']).slice(-8)) {
        if (!block || typeof block !== 'object') continue;
        const row = block as Record<string, unknown>;
        const items = arrayValue(row['items'])
          .map((item) => stringValue(item))
          .filter(Boolean);
        recent.blocks.push({
          blockName: stringValue(row['blockName'] ?? row['name']),
          id: stringValue(row['blockId'] ?? row['id']),
          itemCount: items.length,
          items: items.slice(0, 4),
          participantKey: stringValue(row['participantKey']),
          scopeKey: snapshot.scopeKey,
        });
      }
      for (const candidate of arrayValue(value['candidates']).slice(-8)) {
        if (!candidate || typeof candidate !== 'object') continue;
        const row = candidate as Record<string, unknown>;
        recent.candidates.push({
          id: stringValue(row['candidateId'] ?? row['id']),
          participantKey: stringValue(row['participantKey']),
          summary: stringValue(row['summary']),
          type: stringValue(row['type']),
        });
      }
      for (const diaryEntry of [
        ...arrayValue(value['diaryEntries']),
        ...arrayValue(value['diary']),
      ].slice(-8)) {
        if (!diaryEntry || typeof diaryEntry !== 'object') continue;
        const row = diaryEntry as Record<string, unknown>;
        recent.diary.push({
          beatType: stringValue(row['beatType'] ?? row['beat_type']),
          id: stringValue(row['diaryId'] ?? row['id']),
          participantKey: stringValue(row['participantKey']),
          summary: stringValue(row['summary']),
        });
      }
    }

    for (const [scopeKey, rawProfile] of Object.entries(relationshipProfiles).slice(-8)) {
      const profile =
        rawProfile && typeof rawProfile === 'object' ? (rawProfile as Record<string, unknown>) : {};
      recent.relationships.push({
        id: `relationship:${scopeKey}`,
        mood: stringValue(profile['mood']),
        relationshipStage: stringValue(profile['relationshipStage']),
        scopeKey,
        summary: stringValue(profile['profileSummary'] ?? profile['summary']),
      });
      for (const fact of getRelationshipFacts(profile).slice(0, 4)) {
        recent.relationshipFacts.push({
          id: `relationship-fact:${scopeKey}:${recent.relationshipFacts.length}`,
          scopeKey,
          text: stringValue(fact),
        });
      }
    }

    for (const snapshot of semanticStates.slice(-8)) {
      const records = Array.isArray(snapshot.value) ? normalizeSemanticRecords(snapshot.value) : [];
      for (const record of records.slice(-8)) {
        recent.semantic.push({
          id: record.id,
          personaId: record.personaId,
          text: record.text,
        });
        if (record.embedding?.length) {
          recent.vectors.push({
            id: record.id,
            personaId: record.personaId,
            text: record.text,
          });
        }
      }
    }

    return {
      ...createEmptyGraphSummary(),
      edges: [],
      recent,
      scopes: snapshots.map((snapshot) => {
        const parsed = parseScopeKey(snapshot.scopeKey);
        return {
          channel: parsed.channel,
          id: snapshot.scopeKey,
          personaId: parsed.personaId,
          source: parsed.source,
        };
      }),
    };
  }

  private async replaceOneGrilloRecord(
    entity: LadybugGrilloRecordEntity,
    recordId: string,
    record: Record<string, unknown>,
  ) {
    const normalizedEntity = normalizeGrilloEntity(entity);
    const normalizedRecord = normalizeGrilloRecord(normalizedEntity, record);
    try {
      await this.deleteNativeGrilloRecord(normalizedEntity, recordId);
      await this.appendNativeGrilloRecord(normalizedEntity, normalizedRecord);
    } catch (error) {
      const records = await this.readFallbackGrilloRecords<Record<string, unknown>>(
        normalizedEntity,
        error,
      );
      await this.replaceFallbackGrilloRecords(
        normalizedEntity,
        [
          ...records.filter((row) => grilloRecordNaturalId(normalizedEntity, row) !== recordId),
          normalizedRecord,
        ],
        error,
      );
    }
  }

  private async appendNativeGrilloRecord(
    entity: LadybugGrilloRecordEntity,
    record: Record<string, unknown>,
  ) {
    await this.open();
    const id = grilloRecordRowId(entity, record);
    const scopeKey = grilloRecordScopeKey(record);
    const participantKey = grilloRecordParticipantKey(record);
    const seq = grilloRecordTimestamp(record);
    await this.ensureScopeNode(scopeKey);
    await this.ensurePersonaNode(parseScopeKey(scopeKey).personaId);
    if (participantKey) {
      await this.ensureParticipantNode(participantKey);
    }
    await this.exec(
      `CREATE (:GrilloRecord {id: ${q(id)}, entity: ${q(entity)}, recordId: ${q(grilloRecordNaturalId(entity, record))}, scopeKey: ${q(scopeKey)}, userId: ${q(grilloRecordUserId(record))}, json: ${q(JSON.stringify(record))}, seq: ${seq}, createdAt: ${Date.now()}})`,
    );
    await this.createNativeGrilloGraphMirror(entity, record, scopeKey, participantKey);
  }

  private async createNativeGrilloGraphMirror(
    entity: LadybugGrilloRecordEntity,
    record: Record<string, unknown>,
    scopeKey: string,
    participantKey: string,
  ) {
    if (entity === 'turn_events') {
      await this.createTurnEventGraph(record, scopeKey, participantKey);
      return;
    }
    if (entity === 'memory_candidates') {
      await this.createCandidateGraph(record, scopeKey, participantKey);
      return;
    }
    if (entity === 'diary_entries') {
      await this.createDiaryGraph(record, scopeKey, participantKey);
      return;
    }
    if (entity === 'memory_blocks') {
      await this.createMemoryBlockGraph(record, scopeKey, participantKey);
      return;
    }
    if (entity === 'memory_slots') {
      await this.createMemorySlotGraph(record, scopeKey, participantKey);
      return;
    }
    if (entity === 'memory_slot_patches') {
      await this.createMemorySlotPatchGraph(record, scopeKey, participantKey);
      return;
    }
    if (entity === 'relationship_profiles') {
      await this.createRelationshipProfileGraph(record, scopeKey);
      return;
    }
    if (entity === 'emotion_states') {
      await this.createEmotionGraph(scopeKey, record);
      return;
    }
    if (entity === 'grillo_activity_log') {
      await this.createGrilloActivityGraph(record, scopeKey);
      return;
    }
    if (entity === 'worker_context_traces') {
      await this.createWorkerContextTraceGraph(record, scopeKey);
    }
  }

  private async createTurnEventGraph(
    record: Record<string, unknown>,
    scopeKey: string,
    participantKey: string,
  ) {
    const id = stringValue(
      record['turn_id'] ?? record['turnId'] ?? grilloRecordNaturalId('turn_events', record),
    );
    await this.exec(
      `CREATE (:TurnEvent {id: ${q(id)}, scopeKey: ${q(scopeKey)}, participantKey: ${q(participantKey)}, channelId: ${q(stringValue(record['channel_id'] ?? record['channelId']))}, interfacePath: ${q(stringValue(record['interface_path'] ?? record['interfacePath']))}, role: ${q(stringValue(record['role']))}, content: ${q(stringValue(record['content']))}, authorName: ${q(stringValue(record['author_name'] ?? record['authorName']))}, createdAt: ${grilloRecordTimestamp(record)}})`,
    );
    await this.exec(
      `MATCH (s:MemoryScope), (m:TurnEvent) WHERE s.id = ${q(scopeKey)} AND m.id = ${q(id)} CREATE (s)-[:HAS_TURN]->(m)`,
    );
    if (participantKey) {
      await this.exec(
        `MATCH (m:TurnEvent), (p:Participant) WHERE m.id = ${q(id)} AND p.id = ${q(participantKey)} CREATE (m)-[:TURN_BY]->(p)`,
      );
    }
  }

  private async createCandidateGraph(
    record: Record<string, unknown>,
    scopeKey: string,
    participantKey: string,
  ) {
    const id = stringValue(
      record['candidate_id'] ??
        record['candidateId'] ??
        grilloRecordNaturalId('memory_candidates', record),
    );
    await this.exec(
      `CREATE (:MemoryCandidate {id: ${q(id)}, scopeKey: ${q(scopeKey)}, participantKey: ${q(participantKey)}, type: ${q(stringValue(record['type']))}, summary: ${q(stringValue(record['summary']))}, content: ${q(stringValue(record['content']))}, confidence: ${numberValue(record['confidence'], 0)}, source: ${q(stringValue(record['source']))}, sourceTurnIdsJson: ${q(JSON.stringify(readSourceTurnIds(record)))}, createdAt: ${grilloRecordTimestamp(record)}})`,
    );
    await this.createScopeRelation('HAS_CANDIDATE', 'MemoryCandidate', scopeKey, id);
    if (participantKey) {
      await this.createAboutRelation('CANDIDATE_ABOUT', 'MemoryCandidate', id, participantKey);
    }
  }

  private async createDiaryGraph(
    record: Record<string, unknown>,
    scopeKey: string,
    participantKey: string,
  ) {
    const id = stringValue(
      record['diary_id'] ?? record['diaryId'] ?? grilloRecordNaturalId('diary_entries', record),
    );
    await this.exec(
      `CREATE (:DiaryEntry {id: ${q(id)}, scopeKey: ${q(scopeKey)}, participantKey: ${q(participantKey)}, beatType: ${q(stringValue(record['beat_type'] ?? record['beatType']))}, summary: ${q(stringValue(record['summary']))}, personalThought: ${q(stringValue(record['personal_thought'] ?? record['personalThought']))}, interactionSummary: ${q(stringValue(record['interaction_summary'] ?? record['interactionSummary']))}, userMessage: ${q(stringValue(record['user_message'] ?? record['userMessage']))}, emotionsJson: ${q(JSON.stringify(arrayValue(record['emotions'])))}, tagsJson: ${q(JSON.stringify(arrayValue(record['tags'])))}, sourceTurnIdsJson: ${q(JSON.stringify(readSourceTurnIds(record)))}, createdAt: ${grilloRecordTimestamp(record)}})`,
    );
    await this.createScopeRelation('HAS_DIARY', 'DiaryEntry', scopeKey, id);
    if (participantKey) {
      await this.createAboutRelation('DIARY_ABOUT', 'DiaryEntry', id, participantKey);
    }
  }

  private async createMemoryBlockGraph(
    record: Record<string, unknown>,
    scopeKey: string,
    participantKey: string,
  ) {
    const id = stringValue(
      record['block_id'] ?? record['blockId'] ?? grilloRecordNaturalId('memory_blocks', record),
    );
    await this.exec(
      `CREATE (:MemoryBlock {id: ${q(id)}, scopeKey: ${q(scopeKey)}, participantKey: ${q(participantKey)}, blockName: ${q(stringValue(record['block_name'] ?? record['blockName']))}, itemsJson: ${q(JSON.stringify(arrayValue(record['items'])))}, sourceCandidateIdsJson: ${q(JSON.stringify(readSourceCandidateIds(record)))}, createdAt: ${grilloRecordTimestamp(record)}, updatedAt: ${grilloRecordUpdatedAt(record)}})`,
    );
    await this.createScopeRelation('HAS_BLOCK', 'MemoryBlock', scopeKey, id);
    if (participantKey) {
      await this.createAboutRelation('BLOCK_ABOUT', 'MemoryBlock', id, participantKey);
    }
    await this.createSourceCandidateRelations(
      'BLOCK_FROM_CANDIDATE',
      'MemoryBlock',
      id,
      readSourceCandidateIds(record),
    );
  }

  private async createMemorySlotGraph(
    record: Record<string, unknown>,
    scopeKey: string,
    participantKey: string,
  ) {
    const id = stringValue(record['slot_id'] ?? grilloRecordNaturalId('memory_slots', record));
    const updatedAt = grilloRecordUpdatedAt(record);
    await this.exec(
      `CREATE (:MemorySlot {id: ${q(id)}, scopeKey: ${q(scopeKey)}, participantKey: ${q(participantKey)}, userId: ${q(grilloRecordUserId(record))}, slotName: ${q(stringValue(record['slot_name'] ?? record['slotName']))}, contentJson: ${q(stringValue(record['content_json'] ?? record['contentJson']))}, sourceCandidateIdsJson: ${q(stringValue(record['source_candidate_ids_json'] ?? record['sourceCandidateIdsJson']))}, updatedAt: ${updatedAt}})`,
    );
    await this.exec(
      `MATCH (s:MemoryScope), (m:MemorySlot) WHERE s.id = ${q(scopeKey)} AND m.id = ${q(id)} CREATE (s)-[:HAS_SLOT]->(m)`,
    );
    if (participantKey) {
      await this.exec(
        `MATCH (m:MemorySlot), (p:Participant) WHERE m.id = ${q(id)} AND p.id = ${q(participantKey)} CREATE (m)-[:SLOT_ABOUT]->(p)`,
      );
    }
    await this.createSourceCandidateRelations(
      'SLOT_FROM_CANDIDATE',
      'MemorySlot',
      id,
      readSourceCandidateIds(record),
    );
  }

  private async createMemorySlotPatchGraph(
    record: Record<string, unknown>,
    scopeKey: string,
    participantKey: string,
  ) {
    const id = stringValue(
      record['patch_id'] ?? grilloRecordNaturalId('memory_slot_patches', record),
    );
    await this.exec(
      `CREATE (:MemorySlotPatch {id: ${q(id)}, scopeKey: ${q(scopeKey)}, participantKey: ${q(participantKey)}, slotId: ${q(stringValue(record['slot_id'] ?? record['slotId']))}, slotName: ${q(stringValue(record['slot_name'] ?? record['slotName']))}, operation: ${q(stringValue(record['operation']))}, patchJson: ${q(stringValue(record['patch_json'] ?? record['patchJson']))}, sourceCandidateIdsJson: ${q(stringValue(record['source_candidate_ids_json'] ?? record['sourceCandidateIdsJson']))}, createdAt: ${grilloRecordTimestamp(record)}})`,
    );
    await this.exec(
      `MATCH (s:MemoryScope), (m:MemorySlotPatch) WHERE s.id = ${q(scopeKey)} AND m.id = ${q(id)} CREATE (s)-[:HAS_SLOT_PATCH]->(m)`,
    );
  }

  private async createRelationshipProfileGraph(record: Record<string, unknown>, scopeKey: string) {
    const parsedScope = parseScopeKey(scopeKey);
    const profileId = stringValue(
      record['profile_id'] ?? record['id'] ?? relationshipProfileId(scopeKey),
    );
    const participantKeys = getRelationshipParticipantKeys(record);
    await this.exec(
      `CREATE (:RelationshipProfile {id: ${q(profileId)}, scopeKey: ${q(scopeKey)}, personaId: ${q(parsedScope.personaId)}, relationshipStage: ${q(stringValue(record['relationship_stage'] ?? record['relationshipStage']))}, mood: ${q(stringValue(record['mood']))}, trust: ${intValue(record['trust'])}, attraction: ${intValue(record['attraction'])}, respect: ${intValue(record['respect'])}, irritation: ${intValue(record['irritation'])}, jealousy: ${intValue(record['jealousy'])}, guard: ${intValue(record['guard'])}, turnCount: ${intValue(record['turn_count'] ?? record['turnCount'])}, lastDiaryTurnCount: ${intValue(record['last_diary_turn_count'] ?? record['lastDiaryTurnCount'])}, lastSeenAt: ${intValue(record['last_seen_at'] ?? record['lastSeenAt'])}, lastActionTag: ${q(stringValue(record['last_action_tag'] ?? record['lastActionTag']))}, summary: ${q(stringValue(record['summary']))}, diaryEntry: ${q(stringValue(record['diary_entry'] ?? record['diaryEntry']))}, updatedAt: ${grilloRecordUpdatedAt(record)}})`,
    );
    await this.exec(
      `MATCH (s:MemoryScope), (m:RelationshipProfile) WHERE s.id = ${q(scopeKey)} AND m.id = ${q(profileId)} CREATE (s)-[:HAS_RELATIONSHIP]->(m)`,
    );
    await this.ensurePersonaNode(parsedScope.personaId);
    await this.exec(
      `MATCH (m:RelationshipProfile), (p:Persona) WHERE m.id = ${q(profileId)} AND p.id = ${q(parsedScope.personaId)} CREATE (m)-[:RELATIONSHIP_AS_PERSONA]->(p)`,
    );
    for (const participantKey of participantKeys) {
      await this.ensureParticipantNode(participantKey);
      await this.exec(
        `MATCH (m:RelationshipProfile), (p:Participant) WHERE m.id = ${q(profileId)} AND p.id = ${q(participantKey)} CREATE (m)-[:RELATIONSHIP_WITH_PARTICIPANT]->(p)`,
      );
    }
    for (const [index, fact] of getRelationshipFacts(record).entries()) {
      const factId = `${profileId}:fact:${index}`;
      await this.exec(
        `CREATE (:RelationshipFact {id: ${q(factId)}, profileId: ${q(profileId)}, scopeKey: ${q(scopeKey)}, text: ${q(fact)}, updatedAt: ${grilloRecordUpdatedAt(record)}})`,
      );
      await this.exec(
        `MATCH (m:RelationshipProfile), (f:RelationshipFact) WHERE m.id = ${q(profileId)} AND f.id = ${q(factId)} CREATE (m)-[:HAS_RELATIONSHIP_FACT]->(f)`,
      );
    }
  }

  private async createGrilloActivityGraph(record: Record<string, unknown>, scopeKey: string) {
    const id = stringValue(
      record['activity_id'] ?? record['id'] ?? grilloRecordNaturalId('grillo_activity_log', record),
    );
    await this.exec(
      `CREATE (:GrilloActivity {id: ${q(id)}, scopeKey: ${q(scopeKey)}, beatType: ${q(stringValue(record['beat_type'] ?? record['beatType']))}, promptText: ${q(stringValue(record['prompt_text'] ?? record['promptText']))}, responseText: ${q(stringValue(record['response_text'] ?? record['responseText']))}, diaryEntryId: ${q(stringValue(record['diary_entry_id'] ?? record['diaryEntryId']))}, createdAt: ${grilloRecordTimestamp(record)}})`,
    );
    await this.exec(
      `MATCH (s:MemoryScope), (m:GrilloActivity) WHERE s.id = ${q(scopeKey)} AND m.id = ${q(id)} CREATE (s)-[:HAS_ACTIVITY]->(m)`,
    );
  }

  private async createWorkerContextTraceGraph(record: Record<string, unknown>, scopeKey: string) {
    const id = stringValue(
      record['trace_id'] ?? record['id'] ?? grilloRecordNaturalId('worker_context_traces', record),
    );
    await this.exec(
      `CREATE (:WorkerContextTrace {id: ${q(id)}, scopeKey: ${q(scopeKey)}, taskType: ${q(stringValue(record['task_type'] ?? record['taskType']))}, beatType: ${q(stringValue(record['beat_type'] ?? record['beatType']))}, provider: ${q(stringValue(record['provider']))}, model: ${q(stringValue(record['model']))}, systemPrompt: ${q(stringValue(record['system_prompt'] ?? record['systemPrompt']))}, prompt: ${q(stringValue(record['prompt']))}, createdAt: ${grilloRecordTimestamp(record)}})`,
    );
    await this.exec(
      `MATCH (s:MemoryScope), (m:WorkerContextTrace) WHERE s.id = ${q(scopeKey)} AND m.id = ${q(id)} CREATE (s)-[:HAS_TRACE]->(m)`,
    );
  }

  private async deleteNativeGrilloRecord(entity: LadybugGrilloRecordEntity, recordId: string) {
    await this.open();
    await this.exec(
      `MATCH (m:GrilloRecord) WHERE m.entity = ${q(entity)} AND m.recordId = ${q(recordId)} DELETE m`,
    );
    await this.deleteNativeGrilloGraphRows(entity, [recordId]);
  }

  private async deleteNativeGrilloEntity(entity: LadybugGrilloRecordEntity) {
    await this.open();
    const rows = await this.all(
      `MATCH (m:GrilloRecord) WHERE m.entity = ${q(entity)} RETURN m.recordId AS recordId`,
    ).catch(() => []);
    const recordIds = rows.map((row) => stringValue(row['recordId'])).filter(Boolean);
    await this.exec(`MATCH (m:GrilloRecord) WHERE m.entity = ${q(entity)} DELETE m`).catch(
      () => undefined,
    );
    await this.deleteNativeGrilloGraphRows(entity, recordIds);
  }

  private async deleteGrilloRecordsForScope(scopeKey: string) {
    await this.exec(`MATCH (m:GrilloRecord) WHERE m.scopeKey = ${q(scopeKey)} DELETE m`).catch(
      () => undefined,
    );
  }

  private async deleteNativeGrilloGraphRows(
    entity: LadybugGrilloRecordEntity,
    recordIds: string[],
  ) {
    const ids = recordIds.map((id) => q(id)).join(', ');
    if (!ids.length) return;
    const deleteRelations = async (label: string) => {
      await this.exec(
        `MATCH (s:MemoryScope)-[r]->(m:${label}) WHERE m.id IN [${ids}] DELETE r`,
      ).catch(() => undefined);
      await this.exec(`MATCH (m:${label})-[r]->(n) WHERE m.id IN [${ids}] DELETE r`).catch(
        () => undefined,
      );
      await this.exec(`MATCH (n)-[r]->(m:${label}) WHERE m.id IN [${ids}] DELETE r`).catch(
        () => undefined,
      );
    };
    const deleteByLabel = async (label: string) => {
      await deleteRelations(label);
      await this.exec(`MATCH (m:${label}) WHERE m.id IN [${ids}] DELETE m`).catch(() => undefined);
    };
    if (entity === 'turn_events') await deleteByLabel('TurnEvent');
    if (entity === 'memory_candidates') await deleteByLabel('MemoryCandidate');
    if (entity === 'diary_entries') await deleteByLabel('DiaryEntry');
    if (entity === 'memory_blocks') await deleteByLabel('MemoryBlock');
    if (entity === 'memory_slots') await deleteByLabel('MemorySlot');
    if (entity === 'memory_slot_patches') await deleteByLabel('MemorySlotPatch');
    if (entity === 'relationship_profiles') await deleteByLabel('RelationshipProfile');
    if (entity === 'emotion_states') {
      await deleteByLabel('EmotionState');
      await this.exec(`MATCH (m:EmotionIntensity) WHERE m.emotionStateId IN [${ids}] DELETE m`).catch(
        () => undefined,
      );
    }
    if (entity === 'grillo_activity_log') await deleteByLabel('GrilloActivity');
    if (entity === 'worker_context_traces') await deleteByLabel('WorkerContextTrace');
  }

  private async appendFallbackGrilloRecord(
    entity: LadybugGrilloRecordEntity,
    record: Record<string, unknown>,
    error: unknown,
  ) {
    await this.enableFallback(error);
    await this.updateFallbackStore((store) => {
      const existing = readFallbackGrilloBucket(store, entity);
      writeFallbackGrilloBucket(store, entity, [...existing, record]);
    });
  }

  private async readFallbackGrilloRecords<T>(
    entity: LadybugGrilloRecordEntity,
    error: unknown,
  ): Promise<T[]> {
    await this.enableFallback(error);
    const store = await this.readFallbackStore();
    const records = readFallbackGrilloBucket(store, entity);
    return records as T[];
  }

  private async replaceFallbackGrilloRecords(
    entity: LadybugGrilloRecordEntity,
    records: Record<string, unknown>[],
    error: unknown,
  ) {
    await this.enableFallback(error);
    await this.updateFallbackStore((store) => {
      writeFallbackGrilloBucket(store, entity, records);
    });
  }

  private async readFallbackGrilloSingleton<T>(
    entity: LadybugGrilloSingletonEntity,
    error: unknown,
  ): Promise<T | null> {
    await this.enableFallback(error);
    const store = await this.readFallbackStore();
    const value = readFallbackGrilloSingletonValue(store, entity);
    return value ? (value as T) : null;
  }

  private async writeFallbackGrilloSingleton(
    entity: LadybugGrilloSingletonEntity,
    value: Record<string, unknown>,
    error: unknown,
  ) {
    await this.enableFallback(error);
    await this.updateFallbackStore((store) => {
      writeFallbackGrilloSingletonValue(store, entity, value);
    });
  }

  private async loadFallbackSnapshotValue(
    kind: LadybugSnapshotKind,
    scopeKey: string,
    error: unknown,
  ) {
    await this.enableFallback(error);
    const normalizedScopeKey = normalizeScopeKey(scopeKey);
    const store = await this.readFallbackStore();
    return store.snapshots[snapshotId(kind, normalizedScopeKey)]?.value ?? null;
  }

  private async saveFallbackSnapshotValue(
    kind: LadybugSnapshotKind,
    scopeKey: string,
    value: unknown,
    error: unknown,
  ) {
    await this.enableFallback(error);
    const normalizedScopeKey = normalizeScopeKey(scopeKey);
    await this.updateFallbackStore((store) => {
      store.snapshots[snapshotId(kind, normalizedScopeKey)] = {
        kind,
        scopeKey: normalizedScopeKey,
        updatedAt: Date.now(),
        value,
      };
    });
  }

  private async deleteFallbackSnapshotValue(
    kind: LadybugSnapshotKind,
    scopeKey: string,
    error: unknown,
  ) {
    await this.enableFallback(error);
    const normalizedScopeKey = normalizeScopeKey(scopeKey);
    await this.updateFallbackStore((store) => {
      delete store.snapshots[snapshotId(kind, normalizedScopeKey)];
    });
  }

  private async queryFallbackSemanticVectors(
    scopeKey: string,
    embedding: number[],
    limit: number,
    error: unknown,
  ): Promise<LadybugSemanticMemoryMatch[]> {
    await this.enableFallback(error);
    const records = await this.loadSemanticRecords(scopeKey);
    return (records ?? [])
      .map((record) => {
        const distance = cosineDistance(embedding, normalizeEmbeddingArray(record.embedding));
        return {
          ...record,
          distance,
          score: Math.max(0, 1 - distance),
        };
      })
      .filter((record) => Number.isFinite(record.distance))
      .sort((left, right) => left.distance - right.distance)
      .slice(0, Math.max(1, Math.min(20, Math.trunc(limit))));
  }

  private async enableFallback(error: unknown) {
    this.fallbackReason ??= error instanceof Error ? error.message : String(error);
    this.initPromise = null;
    const state = this.state;
    this.state = null;
    await state?.connection.close().catch(() => undefined);
    await state?.database.close().catch(() => undefined);
  }

  private get fallbackStorePath() {
    return `${this.dbDir}.json`;
  }

  private async readFallbackStore(): Promise<FallbackStore> {
    await mkdir(dirname(this.fallbackStorePath), { recursive: true });
    try {
      const parsed = JSON.parse(
        await readFile(this.fallbackStorePath, 'utf8'),
      ) as Partial<FallbackStore>;
      return {
        reason: typeof parsed.reason === 'string' ? parsed.reason : this.fallbackReason,
        snapshots:
          parsed.snapshots &&
          typeof parsed.snapshots === 'object' &&
          !Array.isArray(parsed.snapshots)
            ? (parsed.snapshots as Record<string, FallbackSnapshot>)
            : {},
        updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
        version: 1,
      };
    } catch {
      return {
        reason: this.fallbackReason,
        snapshots: {},
        updatedAt: Date.now(),
        version: 1,
      };
    }
  }

  private async writeFallbackStore(store: FallbackStore) {
    const nextStore: FallbackStore = {
      ...store,
      reason: store.reason ?? this.fallbackReason,
      updatedAt: Date.now(),
      version: 1,
    };
    await mkdir(dirname(this.fallbackStorePath), { recursive: true });
    const temporaryPath = `${this.fallbackStorePath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(nextStore, null, 2)}\n`, 'utf8');
    await rename(temporaryPath, this.fallbackStorePath);
  }

  private async updateFallbackStore(mutator: (store: FallbackStore) => void | Promise<void>) {
    const run = this.fallbackMutationQueue
      .catch(() => undefined)
      .then(async () => {
        const store = await this.readFallbackStore();
        await mutator(store);
        await this.writeFallbackStore(store);
      });
    this.fallbackMutationQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async close() {
    const state = this.state;
    this.state = null;
    this.initPromise = null;
    await state?.connection.close().catch(() => undefined);
    await state?.database.close().catch(() => undefined);
  }

  private async open() {
    if (this.fallbackReason) {
      throw new Error(this.fallbackReason);
    }
    if (this.state?.initialized) {
      return this.state;
    }
    this.initPromise ??= this.init();
    this.state = await this.initPromise;
    return this.state;
  }

  private async init(): Promise<LadybugState> {
    await mkdir(dirname(this.dbDir), { recursive: true });
    const { Connection, Database } = await importLadybugCore();
    const database = new Database(this.dbDir);
    const connection = new Connection(database);
    const state = { connection, database, initialized: false };
    this.state = state;

    await this.ensureNodeTable(
      connection,
      'MemoryState',
      'id STRING, scopeKey STRING, kind STRING, json STRING, updatedAt INT64, PRIMARY KEY(id)',
    );
    await this.ensureNodeTable(
      connection,
      'GrilloRecord',
      'id STRING, entity STRING, recordId STRING, scopeKey STRING, userId STRING, json STRING, seq INT64, createdAt INT64, PRIMARY KEY(id)',
    );
    await this.ensureNodeTable(
      connection,
      'GrilloSingleton',
      'entity STRING, json STRING, updatedAt INT64, PRIMARY KEY(entity)',
    );
    await this.ensureNodeTable(
      connection,
      'MemoryScope',
      'id STRING, source STRING, channel STRING, personaId STRING, updatedAt INT64, PRIMARY KEY(id)',
    );
    await this.ensureNodeTable(
      connection,
      'Participant',
      'id STRING, source STRING, channel STRING, login STRING, displayName STRING, updatedAt INT64, PRIMARY KEY(id)',
    );
    await this.ensureNodeTable(
      connection,
      'Persona',
      'id STRING, name STRING, updatedAt INT64, PRIMARY KEY(id)',
    );
    await this.ensureNodeTable(
      connection,
      'TurnEvent',
      'id STRING, scopeKey STRING, participantKey STRING, channelId STRING, interfacePath STRING, role STRING, content STRING, authorName STRING, createdAt INT64, PRIMARY KEY(id)',
    );
    await this.ensureNodeTable(
      connection,
      'MemoryCandidate',
      'id STRING, scopeKey STRING, participantKey STRING, type STRING, summary STRING, content STRING, confidence DOUBLE, source STRING, sourceTurnIdsJson STRING, createdAt INT64, PRIMARY KEY(id)',
    );
    await this.ensureNodeTable(
      connection,
      'MemoryBlock',
      'id STRING, scopeKey STRING, participantKey STRING, blockName STRING, itemsJson STRING, sourceCandidateIdsJson STRING, createdAt INT64, updatedAt INT64, PRIMARY KEY(id)',
    );
    await this.ensureNodeTable(
      connection,
      'MemorySlot',
      'id STRING, scopeKey STRING, participantKey STRING, userId STRING, slotName STRING, contentJson STRING, sourceCandidateIdsJson STRING, updatedAt INT64, PRIMARY KEY(id)',
    );
    await this.ensureNodeTable(
      connection,
      'MemorySlotPatch',
      'id STRING, scopeKey STRING, participantKey STRING, slotId STRING, slotName STRING, operation STRING, patchJson STRING, sourceCandidateIdsJson STRING, createdAt INT64, PRIMARY KEY(id)',
    );
    await this.ensureNodeTable(
      connection,
      'DiaryEntry',
      'id STRING, scopeKey STRING, participantKey STRING, beatType STRING, summary STRING, personalThought STRING, interactionSummary STRING, userMessage STRING, emotionsJson STRING, tagsJson STRING, sourceTurnIdsJson STRING, createdAt INT64, PRIMARY KEY(id)',
    );
    await this.ensureNodeTable(
      connection,
      'EmotionState',
      'id STRING, scopeKey STRING, intensitiesJson STRING, lastSignalAt INT64, lastSignalSource STRING, updatedAt INT64, PRIMARY KEY(id)',
    );
    await this.ensureNodeTable(
      connection,
      'EmotionIntensity',
      'id STRING, emotionStateId STRING, scopeKey STRING, name STRING, intensity DOUBLE, updatedAt INT64, PRIMARY KEY(id)',
    );
    await this.ensureNodeTable(
      connection,
      'SemanticRecord',
      'id STRING, scopeKey STRING, personaId STRING, text STRING, userText STRING, assistantText STRING, embeddingJson STRING, createdAt INT64, PRIMARY KEY(id)',
    );
    await this.ensureNodeTable(
      connection,
      'SemanticVector',
      'id STRING, scopeKey STRING, personaId STRING, text STRING, userText STRING, assistantText STRING, dimension INT64, vectorTable STRING, createdAt INT64, PRIMARY KEY(id)',
    );
    await this.ensureNodeTable(
      connection,
      'RelationshipProfile',
      'id STRING, scopeKey STRING, personaId STRING, relationshipStage STRING, mood STRING, trust INT64, attraction INT64, respect INT64, irritation INT64, jealousy INT64, guard INT64, turnCount INT64, lastDiaryTurnCount INT64, lastSeenAt INT64, lastActionTag STRING, summary STRING, diaryEntry STRING, updatedAt INT64, PRIMARY KEY(id)',
    );
    await this.ensureNodeTable(
      connection,
      'RelationshipFact',
      'id STRING, profileId STRING, scopeKey STRING, text STRING, updatedAt INT64, PRIMARY KEY(id)',
    );
    await this.ensureNodeTable(
      connection,
      'GrilloActivity',
      'id STRING, scopeKey STRING, beatType STRING, promptText STRING, responseText STRING, diaryEntryId STRING, createdAt INT64, PRIMARY KEY(id)',
    );
    await this.ensureNodeTable(
      connection,
      'WorkerContextTrace',
      'id STRING, scopeKey STRING, taskType STRING, beatType STRING, provider STRING, model STRING, systemPrompt STRING, prompt STRING, createdAt INT64, PRIMARY KEY(id)',
    );
    await this.ensureRelTable(connection, 'HAS_TURN', 'FROM MemoryScope TO TurnEvent');
    await this.ensureRelTable(connection, 'HAS_CANDIDATE', 'FROM MemoryScope TO MemoryCandidate');
    await this.ensureRelTable(connection, 'HAS_BLOCK', 'FROM MemoryScope TO MemoryBlock');
    await this.ensureRelTable(connection, 'HAS_SLOT', 'FROM MemoryScope TO MemorySlot');
    await this.ensureRelTable(connection, 'HAS_SLOT_PATCH', 'FROM MemoryScope TO MemorySlotPatch');
    await this.ensureRelTable(connection, 'HAS_DIARY', 'FROM MemoryScope TO DiaryEntry');
    await this.ensureRelTable(connection, 'HAS_EMOTION', 'FROM MemoryScope TO EmotionState');
    await this.ensureRelTable(
      connection,
      'HAS_EMOTION_INTENSITY',
      'FROM EmotionState TO EmotionIntensity',
    );
    await this.ensureRelTable(connection, 'HAS_SEMANTIC', 'FROM MemoryScope TO SemanticRecord');
    await this.ensureRelTable(connection, 'HAS_VECTOR', 'FROM MemoryScope TO SemanticVector');
    await this.ensureRelTable(
      connection,
      'HAS_RELATIONSHIP',
      'FROM MemoryScope TO RelationshipProfile',
    );
    await this.ensureRelTable(connection, 'CANDIDATE_ABOUT', 'FROM MemoryCandidate TO Participant');
    await this.ensureRelTable(
      connection,
      'BLOCK_FROM_CANDIDATE',
      'FROM MemoryBlock TO MemoryCandidate',
    );
    await this.ensureRelTable(
      connection,
      'SLOT_FROM_CANDIDATE',
      'FROM MemorySlot TO MemoryCandidate',
    );
    await this.ensureRelTable(connection, 'TURN_BY', 'FROM TurnEvent TO Participant');
    await this.ensureRelTable(connection, 'BLOCK_ABOUT', 'FROM MemoryBlock TO Participant');
    await this.ensureRelTable(connection, 'SLOT_ABOUT', 'FROM MemorySlot TO Participant');
    await this.ensureRelTable(connection, 'DIARY_ABOUT', 'FROM DiaryEntry TO Participant');
    await this.ensureRelTable(connection, 'SEMANTIC_FOR_PERSONA', 'FROM SemanticRecord TO Persona');
    await this.ensureRelTable(connection, 'VECTOR_FOR_PERSONA', 'FROM SemanticVector TO Persona');
    await this.ensureRelTable(
      connection,
      'RELATIONSHIP_AS_PERSONA',
      'FROM RelationshipProfile TO Persona',
    );
    await this.ensureRelTable(
      connection,
      'RELATIONSHIP_WITH_PARTICIPANT',
      'FROM RelationshipProfile TO Participant',
    );
    await this.ensureRelTable(
      connection,
      'HAS_RELATIONSHIP_FACT',
      'FROM RelationshipProfile TO RelationshipFact',
    );
    await this.ensureRelTable(connection, 'HAS_ACTIVITY', 'FROM MemoryScope TO GrilloActivity');
    await this.ensureRelTable(connection, 'HAS_TRACE', 'FROM MemoryScope TO WorkerContextTrace');

    state.initialized = true;
    return state;
  }

  private async ensureNodeTable(connection: Connection, name: string, columns: string) {
    await connection.query(`CREATE NODE TABLE ${name}(${columns})`).catch((error) => {
      if (
        !String(error instanceof Error ? error.message : error)
          .toLowerCase()
          .includes('exist')
      ) {
        throw error;
      }
    });
  }

  private async ensureRelTable(connection: Connection, name: string, definition: string) {
    await connection.query(`CREATE REL TABLE ${name}(${definition})`).catch((error) => {
      if (
        !String(error instanceof Error ? error.message : error)
          .toLowerCase()
          .includes('exist')
      ) {
        throw error;
      }
    });
  }

  private async loadSnapshot(kind: LadybugSnapshotKind, scopeKey: string) {
    const normalizedScopeKey = normalizeScopeKey(scopeKey);
    const rows = await this.all(
      `MATCH (m:MemoryState) WHERE m.id = ${q(snapshotId(kind, normalizedScopeKey))} RETURN m.id AS id, m.scopeKey AS scopeKey, m.kind AS kind, m.json AS json, m.updatedAt AS updatedAt`,
    );
    const row = rows[0];
    if (!row || typeof row['json'] !== 'string') {
      return null;
    }
    return row as LadybugSnapshot;
  }

  private async saveSnapshot(kind: LadybugSnapshotKind, scopeKey: string, value: unknown) {
    const normalizedScopeKey = normalizeScopeKey(scopeKey);
    const json = JSON.stringify(value);
    if (json.length > MAX_SNAPSHOT_BYTES) {
      throw new Error(`Ladybug ${kind} snapshot is too large.`);
    }
    const id = snapshotId(kind, normalizedScopeKey);
    await this.deleteSnapshot(kind, normalizedScopeKey);
    await this.exec(
      `CREATE (:MemoryState {id: ${q(id)}, scopeKey: ${q(normalizedScopeKey)}, kind: ${q(kind)}, json: ${q(json)}, updatedAt: ${Date.now()}})`,
    );
  }

  private async deleteSnapshot(kind: LadybugSnapshotKind, scopeKey: string) {
    await this.exec(
      `MATCH (m:MemoryState) WHERE m.id = ${q(snapshotId(kind, normalizeScopeKey(scopeKey)))} DELETE m`,
    );
  }

  private async replaceGrilloGraph(scopeKey: string, value: unknown) {
    const normalizedScopeKey = normalizeScopeKey(scopeKey);
    await this.ensureScopeNode(normalizedScopeKey);
    await this.deleteGraphRowsForScope(
      normalizedScopeKey,
      ['MemoryCandidate', 'MemoryBlock', 'DiaryEntry', 'EmotionState', 'EmotionIntensity'],
      false,
    );
    if (!value || typeof value !== 'object') {
      return;
    }
    const source = value as Record<string, unknown>;
    const candidates = Array.isArray(source['candidates']) ? source['candidates'] : [];
    const blocks = Array.isArray(source['blocks']) ? source['blocks'] : [];
    const diaryEntries = Array.isArray(source['diaryEntries']) ? source['diaryEntries'] : [];
    const emotionState =
      source['emotionState'] && typeof source['emotionState'] === 'object'
        ? (source['emotionState'] as Record<string, unknown>)
        : null;

    for (const candidate of candidates.slice(-120)) {
      if (!candidate || typeof candidate !== 'object') continue;
      const item = candidate as Record<string, unknown>;
      const id = stringValue(item['candidateId']);
      const participantKey = stringValue(item['participantKey']);
      await this.ensureParticipantNode(participantKey);
      await this.exec(
        `CREATE (:MemoryCandidate {id: ${q(id)}, scopeKey: ${q(normalizedScopeKey)}, participantKey: ${q(participantKey)}, type: ${q(stringValue(item['type']))}, summary: ${q(stringValue(item['summary']))}, content: ${q(stringValue(item['content']))}, confidence: ${numberValue(item['confidence'], 0)}, source: ${q(stringValue(item['source']))}, sourceTurnIdsJson: ${q(JSON.stringify(arrayValue(item['sourceTurnIds'])))}, createdAt: ${intValue(item['createdAt'])}})`,
      );
      await this.createScopeRelation('HAS_CANDIDATE', 'MemoryCandidate', normalizedScopeKey, id);
      await this.createAboutRelation('CANDIDATE_ABOUT', 'MemoryCandidate', id, participantKey);
    }

    for (const block of blocks.slice(-80)) {
      if (!block || typeof block !== 'object') continue;
      const item = block as Record<string, unknown>;
      const id = stringValue(item['blockId']);
      const participantKey = stringValue(item['participantKey']);
      await this.ensureParticipantNode(participantKey);
      await this.exec(
        `CREATE (:MemoryBlock {id: ${q(id)}, scopeKey: ${q(normalizedScopeKey)}, participantKey: ${q(participantKey)}, blockName: ${q(stringValue(item['blockName']))}, itemsJson: ${q(JSON.stringify(arrayValue(item['items'])))}, sourceCandidateIdsJson: ${q(JSON.stringify(arrayValue(item['sourceCandidateIds'])))}, createdAt: ${intValue(item['createdAt'])}, updatedAt: ${intValue(item['updatedAt'])}})`,
      );
      await this.createScopeRelation('HAS_BLOCK', 'MemoryBlock', normalizedScopeKey, id);
      await this.createAboutRelation('BLOCK_ABOUT', 'MemoryBlock', id, participantKey);
      await this.createSourceCandidateRelations(
        'BLOCK_FROM_CANDIDATE',
        'MemoryBlock',
        id,
        readSourceCandidateIds(item),
      );
    }

    for (const diaryEntry of diaryEntries.slice(-40)) {
      if (!diaryEntry || typeof diaryEntry !== 'object') continue;
      const item = diaryEntry as Record<string, unknown>;
      const id = stringValue(item['diaryId']);
      const participantKey = stringValue(item['participantKey']);
      await this.ensureParticipantNode(participantKey);
      await this.exec(
        `CREATE (:DiaryEntry {id: ${q(id)}, scopeKey: ${q(normalizedScopeKey)}, participantKey: ${q(participantKey)}, beatType: ${q(stringValue(item['beatType']))}, summary: ${q(stringValue(item['summary']))}, personalThought: ${q(stringValue(item['personalThought']))}, interactionSummary: ${q(stringValue(item['interactionSummary']))}, userMessage: ${q(stringValue(item['userMessage']))}, emotionsJson: ${q(JSON.stringify(arrayValue(item['emotions'])))}, tagsJson: ${q(JSON.stringify(arrayValue(item['tags'])))}, sourceTurnIdsJson: ${q(JSON.stringify(arrayValue(item['sourceTurnIds'])))}, createdAt: ${intValue(item['createdAt'])}})`,
      );
      await this.createScopeRelation('HAS_DIARY', 'DiaryEntry', normalizedScopeKey, id);
      await this.createAboutRelation('DIARY_ABOUT', 'DiaryEntry', id, participantKey);
    }

    if (emotionState) {
      await this.createEmotionGraph(normalizedScopeKey, emotionState);
    }
  }

  private async createEmotionGraph(scopeKey: string, emotionState: Record<string, unknown>) {
    const emotionStateId =
      stringValue(emotionState['emotion_state_id'] ?? emotionState['emotionStateId'] ?? emotionState['id']) ||
      `emotion:${scopeKey}`;
    const intensities =
      emotionState['intensities'] &&
      typeof emotionState['intensities'] === 'object' &&
      !Array.isArray(emotionState['intensities'])
        ? (emotionState['intensities'] as Record<string, unknown>)
        : {};
    await this.exec(
      `CREATE (:EmotionState {id: ${q(emotionStateId)}, scopeKey: ${q(scopeKey)}, intensitiesJson: ${q(JSON.stringify(intensities))}, lastSignalAt: ${intValue(emotionState['lastSignalAt'])}, lastSignalSource: ${q(stringValue(emotionState['lastSignalSource']))}, updatedAt: ${intValue(emotionState['updatedAt'])}})`,
    );
    await this.exec(
      `MATCH (s:MemoryScope), (m:EmotionState) WHERE s.id = ${q(scopeKey)} AND m.id = ${q(emotionStateId)} CREATE (s)-[:HAS_EMOTION]->(m)`,
    );
    for (const [name, rawIntensity] of Object.entries(intensities)) {
      const intensity = numberValue(rawIntensity, 0);
      if (!Number.isFinite(intensity) || intensity <= 0) {
        continue;
      }
      const intensityId = `${emotionStateId}:${normalizeScopeKey(name)}`;
      await this.exec(
        `CREATE (:EmotionIntensity {id: ${q(intensityId)}, emotionStateId: ${q(emotionStateId)}, scopeKey: ${q(scopeKey)}, name: ${q(name)}, intensity: ${intensity}, updatedAt: ${intValue(emotionState['updatedAt'])}})`,
      );
      await this.exec(
        `MATCH (m:EmotionState), (i:EmotionIntensity) WHERE m.id = ${q(emotionStateId)} AND i.id = ${q(intensityId)} CREATE (m)-[:HAS_EMOTION_INTENSITY]->(i)`,
      );
    }
  }

  private async replaceSemanticGraph(scopeKey: string, records: LadybugSemanticMemoryRecord[]) {
    const normalizedScopeKey = normalizeScopeKey(scopeKey);
    await this.ensureScopeNode(normalizedScopeKey);
    await this.deleteGraphRowsForScope(
      normalizedScopeKey,
      ['SemanticRecord', 'SemanticVector'],
      false,
    );
    for (const record of records.slice(0, 160)) {
      await this.ensurePersonaNode(record.personaId);
      await this.exec(
        `CREATE (:SemanticRecord {id: ${q(record.id)}, scopeKey: ${q(normalizedScopeKey)}, personaId: ${q(record.personaId)}, text: ${q(record.text)}, userText: ${q(record.userText)}, assistantText: ${q(record.assistantText)}, embeddingJson: ${q(JSON.stringify(record.embedding ?? []))}, createdAt: ${intValue(record.createdAt)}})`,
      );
      await this.createScopeRelation(
        'HAS_SEMANTIC',
        'SemanticRecord',
        normalizedScopeKey,
        record.id,
      );
      await this.createSemanticPersonaRelation(record.id, record.personaId);
      const embedding = normalizeEmbeddingArray(record.embedding);
      if (embedding.length > 0) {
        await this.ensureSemanticVectorTable(embedding.length);
        const vectorTable = semanticVectorTableName(embedding.length);
        await this.exec(
          `CREATE (:SemanticVector {id: ${q(record.id)}, scopeKey: ${q(normalizedScopeKey)}, personaId: ${q(record.personaId)}, text: ${q(record.text)}, userText: ${q(record.userText)}, assistantText: ${q(record.assistantText)}, dimension: ${embedding.length}, vectorTable: ${q(vectorTable)}, createdAt: ${intValue(record.createdAt)}})`,
        );
        await this.exec(
          `CREATE (:${vectorTable} {id: ${q(record.id)}, scopeKey: ${q(normalizedScopeKey)}, personaId: ${q(record.personaId)}, text: ${q(record.text)}, userText: ${q(record.userText)}, assistantText: ${q(record.assistantText)}, embedding: ${vectorLiteral(embedding)}, createdAt: ${intValue(record.createdAt)}})`,
        );
        await this.createScopeRelation(
          'HAS_VECTOR',
          'SemanticVector',
          normalizedScopeKey,
          record.id,
        );
        await this.createVectorPersonaRelation(record.id, record.personaId);
      }
    }
    await this.rebuildSemanticVectorIndexes(records).catch(() => undefined);
  }

  private async replaceRelationshipGraph(profiles: Record<string, Record<string, unknown>>) {
    await this.deleteAllRelationshipGraphRows();
    for (const [scopeKey, profile] of Object.entries(profiles)) {
      const normalizedScopeKey = normalizeScopeKey(scopeKey);
      const parsedScope = parseScopeKey(normalizedScopeKey);
      const profileId = relationshipProfileId(normalizedScopeKey);
      const participantKeys = getRelationshipParticipantKeys(profile);
      await this.ensureScopeNode(normalizedScopeKey);
      await this.ensurePersonaNode(parsedScope.personaId);
      await this.exec(
        `CREATE (:RelationshipProfile {id: ${q(profileId)}, scopeKey: ${q(normalizedScopeKey)}, personaId: ${q(parsedScope.personaId)}, relationshipStage: ${q(stringValue(profile['relationshipStage']))}, mood: ${q(stringValue(profile['mood']))}, trust: ${intValue(profile['trust'])}, attraction: ${intValue(profile['attraction'])}, respect: ${intValue(profile['respect'])}, irritation: ${intValue(profile['irritation'])}, jealousy: ${intValue(profile['jealousy'])}, guard: ${intValue(profile['guard'])}, turnCount: ${intValue(profile['turnCount'])}, lastDiaryTurnCount: ${intValue(profile['lastDiaryTurnCount'])}, lastSeenAt: ${profile['lastSeenAt'] === null ? 0 : intValue(profile['lastSeenAt'])}, lastActionTag: ${q(stringValue(profile['lastActionTag']))}, summary: ${q(stringValue(profile['summary']))}, diaryEntry: ${q(stringValue(profile['diaryEntry']))}, updatedAt: ${Date.now()}})`,
      );
      await this.exec(
        `MATCH (s:MemoryScope), (m:RelationshipProfile) WHERE s.id = ${q(normalizedScopeKey)} AND m.id = ${q(profileId)} CREATE (s)-[:HAS_RELATIONSHIP]->(m)`,
      );
      await this.exec(
        `MATCH (m:RelationshipProfile), (p:Persona) WHERE m.id = ${q(profileId)} AND p.id = ${q(parsedScope.personaId)} CREATE (m)-[:RELATIONSHIP_AS_PERSONA]->(p)`,
      );
      for (const participantKey of participantKeys) {
        await this.ensureParticipantNode(participantKey);
        await this.exec(
          `MATCH (m:RelationshipProfile), (p:Participant) WHERE m.id = ${q(profileId)} AND p.id = ${q(participantKey)} CREATE (m)-[:RELATIONSHIP_WITH_PARTICIPANT]->(p)`,
        );
      }
      const facts = arrayValue(profile['facts'])
        .map((value) => stringValue(value))
        .filter(Boolean)
        .slice(0, 60);
      for (let index = 0; index < facts.length; index += 1) {
        const factId = `${profileId}:fact:${index}`;
        await this.exec(
          `CREATE (:RelationshipFact {id: ${q(factId)}, profileId: ${q(profileId)}, scopeKey: ${q(normalizedScopeKey)}, text: ${q(facts[index])}, updatedAt: ${Date.now()}})`,
        );
        await this.exec(
          `MATCH (m:RelationshipProfile), (f:RelationshipFact) WHERE m.id = ${q(profileId)} AND f.id = ${q(factId)} CREATE (m)-[:HAS_RELATIONSHIP_FACT]->(f)`,
        );
      }
    }
  }

  private async deleteAllRelationshipGraphRows() {
    await this.exec(
      'MATCH (m:RelationshipProfile)-[r:HAS_RELATIONSHIP_FACT]->(f:RelationshipFact) DELETE r',
    ).catch(() => undefined);
    await this.exec(
      'MATCH (m:RelationshipProfile)-[r:RELATIONSHIP_AS_PERSONA]->(p:Persona) DELETE r',
    ).catch(() => undefined);
    await this.exec(
      'MATCH (m:RelationshipProfile)-[r:RELATIONSHIP_WITH_PARTICIPANT]->(p:Participant) DELETE r',
    ).catch(() => undefined);
    await this.exec(
      'MATCH (s:MemoryScope)-[r:HAS_RELATIONSHIP]->(m:RelationshipProfile) DELETE r',
    ).catch(() => undefined);
    await this.exec('MATCH (m:RelationshipFact) DELETE m').catch(() => undefined);
    await this.exec('MATCH (m:RelationshipProfile) DELETE m').catch(() => undefined);
  }

  private async deleteGraphRowsForScope(
    scopeKey: string,
    labels: string[],
    deleteScopeWhenUnused = false,
  ) {
    if (labels.includes('SemanticVector')) {
      await this.deleteSemanticVectorRowsForScope(scopeKey);
    }
    await this.deleteGraphRelationsForScope(scopeKey, labels);
    for (const label of labels) {
      await this.exec(`MATCH (m:${label}) WHERE m.scopeKey = ${q(scopeKey)} DELETE m`);
    }
    if (deleteScopeWhenUnused) {
      await this.deleteScopeNodeIfUnused(scopeKey);
    }
  }

  private async deleteScopeNodeIfUnused(scopeKey: string) {
    const relationCount = await this.scalarCount(
      `MATCH (s:MemoryScope)-[r]->(m) WHERE s.id = ${q(scopeKey)} RETURN count(r) AS count`,
    ).catch(() => 1);
    if (relationCount > 0) {
      return;
    }
    await this.exec(`MATCH (s:MemoryScope) WHERE s.id = ${q(scopeKey)} DELETE s`).catch(
      () => undefined,
    );
  }

  private async deleteSemanticVectorRowsForScope(scopeKey: string) {
    const rows = await this.all(
      `MATCH (m:SemanticVector) WHERE m.scopeKey = ${q(scopeKey)} RETURN m.id AS id, m.vectorTable AS vectorTable`,
    ).catch(() => []);
    for (const row of rows) {
      const id = stringValue(row['id']);
      const vectorTable = stringValue(row['vectorTable']);
      if (!id || !/^SemanticVectorDim\d+$/.test(vectorTable)) {
        continue;
      }
      await this.exec(`MATCH (m:${vectorTable}) WHERE m.id = ${q(id)} DELETE m`).catch(
        () => undefined,
      );
    }
  }

  private async deleteGraphRelationsForScope(scopeKey: string, labels: string[]) {
    if (labels.includes('TurnEvent')) {
      await this.exec(
        `MATCH (s:MemoryScope)-[r:HAS_TURN]->(m:TurnEvent) WHERE s.id = ${q(scopeKey)} DELETE r`,
      ).catch(() => undefined);
      await this.exec(
        `MATCH (m:TurnEvent)-[r:TURN_BY]->(p:Participant) WHERE m.scopeKey = ${q(scopeKey)} DELETE r`,
      ).catch(() => undefined);
    }
    if (labels.includes('MemoryCandidate')) {
      await this.exec(
        `MATCH (s:MemoryScope)-[r:HAS_CANDIDATE]->(m:MemoryCandidate) WHERE s.id = ${q(scopeKey)} DELETE r`,
      ).catch(() => undefined);
      await this.exec(
        `MATCH (m:MemoryCandidate)-[r:CANDIDATE_ABOUT]->(p:Participant) WHERE m.scopeKey = ${q(scopeKey)} DELETE r`,
      ).catch(() => undefined);
      await this.exec(
        `MATCH (b:MemoryBlock)-[r:BLOCK_FROM_CANDIDATE]->(m:MemoryCandidate) WHERE m.scopeKey = ${q(scopeKey)} DELETE r`,
      ).catch(() => undefined);
      await this.exec(
        `MATCH (s:MemorySlot)-[r:SLOT_FROM_CANDIDATE]->(m:MemoryCandidate) WHERE m.scopeKey = ${q(scopeKey)} DELETE r`,
      ).catch(() => undefined);
    }
    if (labels.includes('MemoryBlock')) {
      await this.exec(
        `MATCH (s:MemoryScope)-[r:HAS_BLOCK]->(m:MemoryBlock) WHERE s.id = ${q(scopeKey)} DELETE r`,
      ).catch(() => undefined);
      await this.exec(
        `MATCH (m:MemoryBlock)-[r:BLOCK_ABOUT]->(p:Participant) WHERE m.scopeKey = ${q(scopeKey)} DELETE r`,
      ).catch(() => undefined);
      await this.exec(
        `MATCH (m:MemoryBlock)-[r:BLOCK_FROM_CANDIDATE]->(c:MemoryCandidate) WHERE m.scopeKey = ${q(scopeKey)} DELETE r`,
      ).catch(() => undefined);
    }
    if (labels.includes('MemorySlot')) {
      await this.exec(
        `MATCH (s:MemoryScope)-[r:HAS_SLOT]->(m:MemorySlot) WHERE s.id = ${q(scopeKey)} DELETE r`,
      ).catch(() => undefined);
      await this.exec(
        `MATCH (m:MemorySlot)-[r:SLOT_ABOUT]->(p:Participant) WHERE m.scopeKey = ${q(scopeKey)} DELETE r`,
      ).catch(() => undefined);
      await this.exec(
        `MATCH (m:MemorySlot)-[r:SLOT_FROM_CANDIDATE]->(c:MemoryCandidate) WHERE m.scopeKey = ${q(scopeKey)} DELETE r`,
      ).catch(() => undefined);
    }
    if (labels.includes('MemorySlotPatch')) {
      await this.exec(
        `MATCH (s:MemoryScope)-[r:HAS_SLOT_PATCH]->(m:MemorySlotPatch) WHERE s.id = ${q(scopeKey)} DELETE r`,
      ).catch(() => undefined);
    }
    if (labels.includes('DiaryEntry')) {
      await this.exec(
        `MATCH (s:MemoryScope)-[r:HAS_DIARY]->(m:DiaryEntry) WHERE s.id = ${q(scopeKey)} DELETE r`,
      ).catch(() => undefined);
      await this.exec(
        `MATCH (m:DiaryEntry)-[r:DIARY_ABOUT]->(p:Participant) WHERE m.scopeKey = ${q(scopeKey)} DELETE r`,
      ).catch(() => undefined);
    }
    if (labels.includes('EmotionState') || labels.includes('EmotionIntensity')) {
      await this.exec(
        `MATCH (s:MemoryScope)-[r:HAS_EMOTION]->(m:EmotionState) WHERE s.id = ${q(scopeKey)} DELETE r`,
      ).catch(() => undefined);
      await this.exec(
        `MATCH (m:EmotionState)-[r:HAS_EMOTION_INTENSITY]->(i:EmotionIntensity) WHERE m.scopeKey = ${q(scopeKey)} DELETE r`,
      ).catch(() => undefined);
    }
    if (labels.includes('SemanticRecord')) {
      await this.exec(
        `MATCH (s:MemoryScope)-[r:HAS_SEMANTIC]->(m:SemanticRecord) WHERE s.id = ${q(scopeKey)} DELETE r`,
      ).catch(() => undefined);
      await this.exec(
        `MATCH (m:SemanticRecord)-[r:SEMANTIC_FOR_PERSONA]->(p:Persona) WHERE m.scopeKey = ${q(scopeKey)} DELETE r`,
      ).catch(() => undefined);
    }
    if (labels.includes('SemanticVector')) {
      await this.exec(
        `MATCH (s:MemoryScope)-[r:HAS_VECTOR]->(m:SemanticVector) WHERE s.id = ${q(scopeKey)} DELETE r`,
      ).catch(() => undefined);
      await this.exec(
        `MATCH (m:SemanticVector)-[r:VECTOR_FOR_PERSONA]->(p:Persona) WHERE m.scopeKey = ${q(scopeKey)} DELETE r`,
      ).catch(() => undefined);
    }
    if (labels.includes('GrilloActivity')) {
      await this.exec(
        `MATCH (s:MemoryScope)-[r:HAS_ACTIVITY]->(m:GrilloActivity) WHERE s.id = ${q(scopeKey)} DELETE r`,
      ).catch(() => undefined);
    }
    if (labels.includes('WorkerContextTrace')) {
      await this.exec(
        `MATCH (s:MemoryScope)-[r:HAS_TRACE]->(m:WorkerContextTrace) WHERE s.id = ${q(scopeKey)} DELETE r`,
      ).catch(() => undefined);
    }
  }

  private async ensureScopeNode(scopeKey: string) {
    const parsed = parseScopeKey(scopeKey);
    await this.createNodeIfMissing(
      `CREATE (:MemoryScope {id: ${q(scopeKey)}, source: ${q(parsed.source)}, channel: ${q(parsed.channel)}, personaId: ${q(parsed.personaId)}, updatedAt: ${Date.now()}})`,
    );
  }

  private async ensureParticipantNode(participantKey: string) {
    const parsed = parseParticipantKey(participantKey);
    await this.createNodeIfMissing(
      `CREATE (:Participant {id: ${q(participantKey)}, source: ${q(parsed.source)}, channel: ${q(parsed.channel)}, login: ${q(parsed.login)}, displayName: ${q(parsed.login)}, updatedAt: ${Date.now()}})`,
    );
  }

  private async ensurePersonaNode(personaId: string) {
    const id = personaId || 'unknown';
    await this.createNodeIfMissing(
      `CREATE (:Persona {id: ${q(id)}, name: ${q(id)}, updatedAt: ${Date.now()}})`,
    );
  }

  private async createScopeRelation(
    relation: 'HAS_CANDIDATE' | 'HAS_BLOCK' | 'HAS_DIARY' | 'HAS_SEMANTIC' | 'HAS_VECTOR',
    label: 'MemoryCandidate' | 'MemoryBlock' | 'DiaryEntry' | 'SemanticRecord' | 'SemanticVector',
    scopeKey: string,
    memoryId: string,
  ) {
    await this.exec(
      `MATCH (s:MemoryScope), (m:${label}) WHERE s.id = ${q(scopeKey)} AND m.id = ${q(memoryId)} CREATE (s)-[:${relation}]->(m)`,
    );
  }

  private async createAboutRelation(
    relation: 'CANDIDATE_ABOUT' | 'BLOCK_ABOUT' | 'DIARY_ABOUT',
    label: 'MemoryCandidate' | 'MemoryBlock' | 'DiaryEntry',
    memoryId: string,
    participantKey: string,
  ) {
    await this.exec(
      `MATCH (m:${label}), (p:Participant) WHERE m.id = ${q(memoryId)} AND p.id = ${q(participantKey)} CREATE (m)-[:${relation}]->(p)`,
    );
  }

  private async createSourceCandidateRelations(
    relation: 'BLOCK_FROM_CANDIDATE' | 'SLOT_FROM_CANDIDATE',
    label: 'MemoryBlock' | 'MemorySlot',
    memoryId: string,
    candidateIds: string[],
  ) {
    for (const candidateId of dedupeStringValues(candidateIds)) {
      await this.exec(
        `MATCH (m:${label}), (c:MemoryCandidate) WHERE m.id = ${q(memoryId)} AND c.id = ${q(candidateId)} CREATE (m)-[:${relation}]->(c)`,
      );
    }
  }

  private async createSemanticPersonaRelation(memoryId: string, personaId: string) {
    await this.exec(
      `MATCH (m:SemanticRecord), (p:Persona) WHERE m.id = ${q(memoryId)} AND p.id = ${q(personaId || 'unknown')} CREATE (m)-[:SEMANTIC_FOR_PERSONA]->(p)`,
    );
  }

  private async createVectorPersonaRelation(memoryId: string, personaId: string) {
    await this.exec(
      `MATCH (m:SemanticVector), (p:Persona) WHERE m.id = ${q(memoryId)} AND p.id = ${q(personaId || 'unknown')} CREATE (m)-[:VECTOR_FOR_PERSONA]->(p)`,
    );
  }

  private async ensureSemanticVectorTable(dimension: number) {
    const vectorTable = semanticVectorTableName(dimension);
    const state = await this.open();
    await this.ensureNodeTable(
      state.connection,
      vectorTable,
      `id STRING PRIMARY KEY, scopeKey STRING, personaId STRING, text STRING, userText STRING, assistantText STRING, embedding FLOAT[${dimension}], createdAt INT64`,
    );
  }

  private async rebuildSemanticVectorIndexes(records: LadybugSemanticMemoryRecord[]) {
    const dimensions = new Set(
      records
        .map((record) => normalizeEmbeddingArray(record.embedding).length)
        .filter((dimension) => dimension > 0),
    );
    for (const dimension of dimensions) {
      await this.ensureSemanticVectorIndex(dimension, { rebuild: true });
    }
  }

  private async ensureSemanticVectorIndex(dimension: number, options: { rebuild?: boolean } = {}) {
    await this.ensureSemanticVectorTable(dimension);
    const vectorTable = semanticVectorTableName(dimension);
    const vectorIndex = semanticVectorIndexName(dimension);
    await this.exec('INSTALL VECTOR').catch(() => undefined);
    await this.exec('LOAD VECTOR');
    if (options.rebuild) {
      await this.exec(`CALL DROP_VECTOR_INDEX('${vectorTable}', '${vectorIndex}')`).catch(
        () => undefined,
      );
    }
    await this.exec(
      `CALL CREATE_VECTOR_INDEX('${vectorTable}', '${vectorIndex}', 'embedding', metric := 'cosine')`,
    ).catch((error) => {
      const message = String(error instanceof Error ? error.message : error).toLowerCase();
      if (!message.includes('exist') && !message.includes('already')) {
        throw error;
      }
    });
  }

  private async createNodeIfMissing(query: string) {
    await this.exec(query).catch((error) => {
      const message = String(error instanceof Error ? error.message : error).toLowerCase();
      if (
        !message.includes('duplicate') &&
        !message.includes('primary') &&
        !message.includes('exist')
      ) {
        throw error;
      }
    });
  }

  private async scalarCount(query: string) {
    const rows = await this.all(query).catch(() => []);
    const value = rows[0]?.['count'];
    return typeof value === 'number' ? value : Number(value ?? 0);
  }

  private async exec(query: string) {
    const state = await this.open();
    await state.connection.query(query);
  }

  private async all(query: string) {
    const state = await this.open();
    const result = (await state.connection.query(query)) as LadybugQueryResult;
    return result.getAll();
  }
}

async function importLadybugCore() {
  try {
    return (await import('@ladybugdb/core')) as unknown as LadybugCoreModule;
  } catch (error) {
    throw new Error(
      `LadybugDB is unavailable in this runtime: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

let singleton: LadybugMemoryService | null = null;

export function getLadybugMemoryService() {
  singleton ??= new LadybugMemoryService();
  return singleton;
}

function snapshotId(kind: LadybugSnapshotKind, scopeKey: string) {
  return `${kind}:${scopeKey}`;
}

const GRILLO_RECORD_ENTITIES = new Set<LadybugGrilloRecordEntity>([
  'turn_events',
  'memory_candidates',
  'diary_entries',
  'memory_blocks',
  'memory_slots',
  'memory_slot_patches',
  'relationship_profiles',
  'emotion_states',
  'grillo_activity_log',
  'worker_context_traces',
  'semantic_records',
  'semantic_vectors',
]);

const GRILLO_SINGLETON_ENTITIES = new Set<LadybugGrilloSingletonEntity>([
  'runtime_settings',
  'memory_worker_state',
]);

function normalizeGrilloEntity(entity: LadybugGrilloRecordEntity) {
  if (!GRILLO_RECORD_ENTITIES.has(entity)) {
    throw new Error(`Unsupported GRILLO record entity: ${entity}`);
  }
  return entity;
}

function normalizeGrilloSingletonEntity(entity: LadybugGrilloSingletonEntity) {
  if (!GRILLO_SINGLETON_ENTITIES.has(entity)) {
    throw new Error(`Unsupported GRILLO singleton entity: ${entity}`);
  }
  return entity;
}

function normalizeGrilloRecord(entity: LadybugGrilloRecordEntity, record: Record<string, unknown>) {
  normalizeGrilloEntity(entity);
  const scopeKey = grilloRecordScopeKey(record);
  return {
    schema_version: '1.0.0',
    ...record,
    scopeKey,
    scope_key: stringValue(record['scope_key']) || scopeKey,
  };
}

function grilloRecordRowId(entity: LadybugGrilloRecordEntity, record: Record<string, unknown>) {
  return `grillo-record:${entity}:${grilloRecordNaturalId(entity, record)}`;
}

function grilloRecordNaturalId(entity: LadybugGrilloRecordEntity, record: Record<string, unknown>) {
  const direct =
    record['id'] ??
    record['turn_id'] ??
    record['turnId'] ??
    record['candidate_id'] ??
    record['candidateId'] ??
    record['diary_id'] ??
    record['diaryId'] ??
    record['block_id'] ??
    record['blockId'] ??
    record['slot_id'] ??
    record['slotId'] ??
    record['patch_id'] ??
    record['patchId'] ??
    record['activity_id'] ??
    record['activityId'] ??
    record['trace_id'] ??
    record['traceId'] ??
    record['profile_id'] ??
    record['profileId'] ??
    record['emotion_state_id'] ??
    record['emotionStateId'];
  const value = stringValue(direct);
  if (value) return value;
  return `${entity}:${grilloRecordScopeKey(record)}:${grilloRecordTimestamp(record)}:${hashText(JSON.stringify(record)).toString(36)}`;
}

function grilloRecordScopeKey(record: Record<string, unknown>) {
  return normalizeScopeKey(
    stringValue(
      record['scopeKey'] ??
        record['scope_key'] ??
        record['memory_scope'] ??
        record['memoryScope'] ??
        record['user_id'] ??
        record['userId'] ??
        'default',
    ),
  );
}

function grilloRecordParticipantKey(record: Record<string, unknown>) {
  const raw = stringValue(
    record['participantKey'] ??
      record['participant_key'] ??
      record['speaker_key'] ??
      record['speakerKey'] ??
      record['actor_key'] ??
      record['actorKey'] ??
      '',
  );
  return raw ? normalizeScopeKey(raw) : '';
}

function grilloRecordUserId(record: Record<string, unknown>) {
  return stringValue(record['user_id'] ?? record['userId'] ?? grilloRecordScopeKey(record));
}

function grilloRecordTimestamp(record: Record<string, unknown>) {
  return intValue(
    record['createdAt'] ??
      record['created_at'] ??
      record['sentAt'] ??
      record['sent_at'] ??
      record['timestamp'] ??
      Date.now(),
  );
}

function grilloRecordUpdatedAt(record: Record<string, unknown>) {
  return intValue(record['updatedAt'] ?? record['updated_at'] ?? grilloRecordTimestamp(record));
}

function normalizeEmotionIntensityMap(value: unknown) {
  const source =
    typeof value === 'string'
      ? safeJsonParse(value)
      : value;
  if (Array.isArray(source)) {
    const intensities: Record<string, number> = {};
    for (const item of source) {
      const record = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
      const normalizedName = stringValue(record['name']).trim();
      const intensity = numberValue(record['intensity'], 0);
      if (!normalizedName || !Number.isFinite(intensity)) continue;
      intensities[normalizedName] = Math.max(0, Math.min(10, intensity));
    }
    return intensities;
  }
  if (!source || typeof source !== 'object') {
    return {};
  }
  const intensities: Record<string, number> = {};
  for (const [name, rawIntensity] of Object.entries(source as Record<string, unknown>)) {
    const normalizedName = stringValue(name).trim();
    const intensity = numberValue(rawIntensity, 0);
    if (!normalizedName || !Number.isFinite(intensity)) continue;
    intensities[normalizedName] = Math.max(0, Math.min(10, intensity));
  }
  return intensities;
}

function readSourceTurnIds(record: Record<string, unknown>) {
  return [
    ...arrayValue(record['sourceTurnIds']),
    ...arrayValue(record['source_turn_ids']),
    ...arrayValue(record['evidence_turn_ids']),
    stringValue(record['origin_turn_id']),
    stringValue(record['originTurnId']),
  ]
    .map((value) => stringValue(value))
    .filter(Boolean);
}

function readSourceCandidateIds(record: Record<string, unknown>) {
  return [
    ...arrayValue(record['sourceCandidateIds']),
    ...arrayValue(record['source_candidate_ids']),
    ...jsonStringArrayValue(record['sourceCandidateIdsJson']),
    ...jsonStringArrayValue(record['source_candidate_ids_json']),
  ]
    .map((value) => stringValue(value))
    .filter(Boolean);
}

function getRelationshipParticipantKeys(record: Record<string, unknown>) {
  const rawKeys = dedupeStringValues([
    record['participantKey'],
    record['participant_key'],
    ...arrayValue(record['participantKeys']),
    ...arrayValue(record['participant_keys']),
  ]);
  return dedupeStringValues(rawKeys.map((value) => normalizeScopeKey(value)));
}

function jsonStringArrayValue(value: unknown) {
  if (typeof value !== 'string') return [];
  return arrayValue(safeJsonParse(value));
}

function dedupeStringValues(values: unknown[]) {
  return Array.from(new Set(values.map((value) => stringValue(value)).filter(Boolean)));
}

function fallbackGrilloRecordsId(entity: LadybugGrilloRecordEntity) {
  return `grillo-records:${entity}`;
}

function fallbackGrilloSingletonId(entity: LadybugGrilloSingletonEntity) {
  return `grillo-singleton:${entity}`;
}

function readFallbackGrilloBucket(store: FallbackStore, entity: LadybugGrilloRecordEntity) {
  const value = store.snapshots[fallbackGrilloRecordsId(entity)]?.value;
  return Array.isArray(value) ? value.filter(isRecordObject) : [];
}

function writeFallbackGrilloBucket(
  store: FallbackStore,
  entity: LadybugGrilloRecordEntity,
  records: Record<string, unknown>[],
) {
  store.snapshots[fallbackGrilloRecordsId(entity)] = {
    kind: 'grillo-records',
    scopeKey: entity,
    updatedAt: Date.now(),
    value: records,
  };
}

function readFallbackGrilloSingletonValue(
  store: FallbackStore,
  entity: LadybugGrilloSingletonEntity,
) {
  const value = store.snapshots[fallbackGrilloSingletonId(entity)]?.value;
  return isRecordObject(value) ? value : null;
}

function writeFallbackGrilloSingletonValue(
  store: FallbackStore,
  entity: LadybugGrilloSingletonEntity,
  value: Record<string, unknown>,
) {
  store.snapshots[fallbackGrilloSingletonId(entity)] = {
    kind: 'grillo-singleton',
    scopeKey: entity,
    updatedAt: Date.now(),
    value,
  };
}

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function relationshipProfileId(scopeKey: string) {
  return `relationship:${scopeKey}`;
}

function normalizeScopeKey(scopeKey: string) {
  return (
    String(scopeKey || 'default')
      .trim()
      .replace(/[^a-z0-9:_-]+/gi, '-')
      .slice(0, MAX_SCOPE_KEY_LENGTH) || 'default'
  );
}

function parseScopeKey(scopeKey: string) {
  const parts = scopeKey.split(':');
  const personaIndex = parts.indexOf('persona');
  return {
    source: parts[0] || 'local',
    channel: personaIndex > 1 ? parts.slice(1, personaIndex).join(':') : 'local',
    personaId: personaIndex >= 0 ? parts.slice(personaIndex + 1).join(':') || 'unknown' : 'unknown',
  };
}

function parseParticipantKey(participantKey: string) {
  const parts = participantKey.split(':');
  return {
    source: parts[0] || 'local',
    channel: parts[1] || 'local',
    login: parts.slice(2).join(':') || 'unknown',
  };
}

function q(value: unknown) {
  return `'${String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')}'`;
}

function hashText(text: string) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function stringValue(value: unknown) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2400);
}

function numberValue(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function intValue(value: unknown) {
  return Math.trunc(numberValue(value, Date.now()));
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function normalizeSemanticRecords(values: unknown[]) {
  return values
    .map((value): LadybugSemanticMemoryRecord | null => {
      if (!value || typeof value !== 'object') {
        return null;
      }
      const source = value as Partial<LadybugSemanticMemoryRecord>;
      const id = stringValue(source.id);
      const scopeKey = stringValue(source.scopeKey);
      const text = stringValue(source.text);
      if (!id || !scopeKey || !text) {
        return null;
      }
      const embedding = Array.isArray(source.embedding)
        ? source.embedding.filter((item): item is number => typeof item === 'number')
        : null;
      return {
        id,
        assistantText: stringValue(source.assistantText).slice(0, 1200),
        createdAt: intValue(source.createdAt),
        embedding: embedding?.length ? embedding : null,
        embeddingModel: stringValue(source.embeddingModel),
        embeddingProvider: stringValue(source.embeddingProvider),
        embeddingVersion: stringValue(source.embeddingVersion),
        personaId: stringValue(source.personaId) || 'unknown',
        scopeKey,
        sourceTurnIds: dedupeStringValues(arrayValue(source.sourceTurnIds)),
        text,
        userText: stringValue(source.userText).slice(0, 1200),
      };
    })
    .filter((record): record is LadybugSemanticMemoryRecord => Boolean(record))
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, 160);
}

function normalizeEmbeddingArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === 'number' && Number.isFinite(item) ? item : null))
    .filter((item): item is number => item !== null);
}

function vectorLiteral(values: number[]) {
  return `[${values.map((value) => (Number.isFinite(value) ? value : 0)).join(', ')}]`;
}

function semanticVectorTableName(dimension: number) {
  return `SemanticVectorDim${Math.max(1, Math.min(10000, Math.trunc(dimension)))}`;
}

function semanticVectorIndexName(dimension: number) {
  return `semantic_vector_idx_${Math.max(1, Math.min(10000, Math.trunc(dimension)))}`;
}

function normalizeRelationshipProfiles(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value)
      .map(([scopeKey, profile]) => [
        normalizeScopeKey(scopeKey),
        profile && typeof profile === 'object' && !Array.isArray(profile)
          ? (profile as Record<string, unknown>)
          : null,
      ])
      .filter((entry): entry is [string, Record<string, unknown>] => Boolean(entry[0] && entry[1])),
  );
}

function getFallbackRelationshipProfiles(store: FallbackStore) {
  const snapshot = store.snapshots[snapshotId('relationships', 'all')];
  return snapshot?.value && typeof snapshot.value === 'object' && !Array.isArray(snapshot.value)
    ? (snapshot.value as Record<string, unknown>)
    : {};
}

function getRelationshipFacts(profile: Record<string, unknown>) {
  return [...arrayValue(profile['facts']), ...arrayValue(profile['storedFacts'])]
    .map((fact) => stringValue(fact))
    .filter(Boolean);
}

function createEmptyGraphSummary(): LadybugMemoryGraphSummary {
  return {
    edges: [],
    participants: [],
    personas: [],
    recent: {
      activities: [],
      blocks: [],
      candidates: [],
      diary: [],
      emotions: [],
      emotionIntensities: [],
      relationships: [],
      relationshipFacts: [],
      semantic: [],
      slotPatches: [],
      slots: [],
      traces: [],
      turns: [],
      vectors: [],
    },
    scopes: [],
  };
}

function cosineDistance(left: number[], right: number[]) {
  if (!left.length || left.length !== right.length) {
    return Number.POSITIVE_INFINITY;
  }
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }
  if (leftMagnitude <= 0 || rightMagnitude <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  return 1 - dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}
