import { copyFile, readFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  LadybugMemoryService,
  type LadybugGrilloRecordEntity,
  type LadybugSemanticMemoryRecord,
} from '../server/memory/LadybugMemoryService';

type JsonObject = Record<string, unknown>;

type FallbackSnapshot = {
  kind: string;
  scopeKey: string;
  value: unknown;
};

type FallbackStore = {
  snapshots?: Record<string, FallbackSnapshot>;
};

const grilloRecordEntities = new Set<LadybugGrilloRecordEntity>([
  'turn_events',
  'evidence_records',
  'memory_claims',
  'memory_corrections',
  'worker_decisions',
  'repair_queue_events',
  'migration_receipts',
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

function isObject(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function recordNaturalId(record: JsonObject) {
  for (const key of [
    'id',
    'turn_id',
    'turnId',
    'candidate_id',
    'candidateId',
    'diary_id',
    'diaryId',
    'block_id',
    'blockId',
    'slot_id',
    'slotId',
    'patch_id',
    'patchId',
    'activity_id',
    'activityId',
    'trace_id',
    'traceId',
    'profile_id',
    'profileId',
    'emotion_state_id',
    'emotionStateId',
  ]) {
    const id = stringValue(record[key]);
    if (id) return id;
  }
  return '';
}

function mergeObjectArrays(
  current: unknown,
  incoming: unknown,
  idKeys: string[],
) {
  const merged = new Map<string, JsonObject>();
  for (const item of [
    ...(Array.isArray(current) ? current : []),
    ...(Array.isArray(incoming) ? incoming : []),
  ]) {
    if (!isObject(item)) continue;
    const id = idKeys.map((key) => stringValue(item[key])).find(Boolean);
    if (!id) continue;
    const previous = merged.get(id);
    if (!previous || numberValue(item['updatedAt']) >= numberValue(previous['updatedAt'])) {
      merged.set(id, { ...previous, ...item });
    }
  }
  return [...merged.values()];
}

function mergeGrilloStates(scopeKey: string, current: unknown, incoming: unknown) {
  const left = isObject(current) ? current : {};
  const right = isObject(incoming) ? incoming : {};
  const currentEmotion = isObject(left['emotionState']) ? left['emotionState'] : {};
  const incomingEmotion = isObject(right['emotionState']) ? right['emotionState'] : {};
  const emotionState =
    numberValue(incomingEmotion['updatedAt']) >= numberValue(currentEmotion['updatedAt'])
      ? incomingEmotion
      : currentEmotion;
  return {
    ...left,
    ...right,
    blocks: mergeObjectArrays(left['blocks'], right['blocks'], ['blockId', 'id']),
    candidates: mergeObjectArrays(left['candidates'], right['candidates'], ['candidateId', 'id']),
    diaryEntries: mergeObjectArrays(left['diaryEntries'], right['diaryEntries'], [
      'diaryId',
      'id',
    ]),
    emotionState,
    promotedCandidateIds: [
      ...new Set([
        ...(Array.isArray(left['promotedCandidateIds']) ? left['promotedCandidateIds'] : []),
        ...(Array.isArray(right['promotedCandidateIds']) ? right['promotedCandidateIds'] : []),
      ].map(String).filter(Boolean)),
    ],
    scopeKey,
    updatedAt: Math.max(numberValue(left['updatedAt']), numberValue(right['updatedAt'])),
    version: 1,
  };
}

function resolveDbPath() {
  const flagIndex = process.argv.indexOf('--db');
  const fromFlag = flagIndex >= 0 ? process.argv[flagIndex + 1] : '';
  return resolve(
    stringValue(fromFlag) ||
      process.env['WEBWAIFU_MEMORY_DB_DIR']?.trim() ||
      '.webwaifu4/ladybug-memory.db',
  );
}

async function main() {
  const dbPath = resolveDbPath();
  const fallbackPath = `${dbPath}.json`;
  const store = JSON.parse(await readFile(fallbackPath, 'utf8')) as FallbackStore;
  const snapshots = Object.values(store.snapshots ?? {});
  const service = new LadybugMemoryService(dbPath);
  const summary = {
    grilloRecordsAdded: 0,
    grilloScopesMerged: 0,
    relationshipScopesMerged: 0,
    semanticRecordsMerged: 0,
  };

  const assertNative = async (stage: string) => {
    const status = await service.getStatus();
    if (status.backend !== 'ladybug') {
      throw new Error(`${stage} switched to JSON fallback: ${status.fallbackReason ?? 'unknown error'}`);
    }
  };

  try {
    console.log('[memory-recovery] opening native Ladybug');
    const status = await service.getStatus();
    if (status.backend !== 'ladybug') {
      throw new Error(`Native Ladybug is unavailable: ${status.fallbackReason ?? 'unknown error'}`);
    }
    const droppedVectorIndexes = await service.dropLegacySemanticVectorIndexes();
    console.log(`[memory-recovery] legacy vector indexes dropped: ${droppedVectorIndexes}`);

    console.log('[memory-recovery] merging ledger records');
    for (const snapshot of snapshots.filter((item) => item.kind === 'grillo-records')) {
      const entity = snapshot.scopeKey as LadybugGrilloRecordEntity;
      if (!grilloRecordEntities.has(entity) || !Array.isArray(snapshot.value)) continue;
      const current = await service.readGrilloRecords<JsonObject>(entity);
      const currentIds = new Set(current.map(recordNaturalId).filter(Boolean));
      for (const record of snapshot.value) {
        if (!isObject(record)) continue;
        const id = recordNaturalId(record);
        if (id && currentIds.has(id)) continue;
        await service.appendGrilloRecord(entity, record);
        if (id) currentIds.add(id);
        summary.grilloRecordsAdded += 1;
      }
    }

    console.log(`[memory-recovery] ledger records added: ${summary.grilloRecordsAdded}`);
    await assertNative('Ledger merge');
    console.log('[memory-recovery] merging semantic snapshots');
    for (const snapshot of snapshots.filter((item) => item.kind === 'semantic')) {
      if (!Array.isArray(snapshot.value)) continue;
      const records = snapshot.value.filter(isObject) as LadybugSemanticMemoryRecord[];
      await service.saveSemanticRecords(snapshot.scopeKey, records);
      summary.semanticRecordsMerged += records.length;
    }

    console.log(`[memory-recovery] semantic records submitted: ${summary.semanticRecordsMerged}`);
    await assertNative('Semantic merge');
    console.log('[memory-recovery] merging relationship snapshots');
    for (const snapshot of snapshots.filter((item) => item.kind === 'relationships')) {
      if (!isObject(snapshot.value)) continue;
      await service.mergeRelationshipProfiles(snapshot.value);
      summary.relationshipScopesMerged += Object.keys(snapshot.value).length;
    }

    await assertNative('Relationship merge');
    console.log('[memory-recovery] merging GRILLO state snapshots');
    for (const snapshot of snapshots.filter((item) => item.kind === 'grillo')) {
      const current = await service.loadGrilloState(snapshot.scopeKey);
      await service.saveGrilloState(
        snapshot.scopeKey,
        mergeGrilloStates(snapshot.scopeKey, current, snapshot.value),
      );
      summary.grilloScopesMerged += 1;
    }
    await assertNative('GRILLO state merge');
    console.log('[memory-recovery] native merge complete');
  } finally {
    await service.close();
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${fallbackPath}.backup-${timestamp}`;
  const migratedPath = `${fallbackPath}.migrated-${timestamp}`;
  await copyFile(fallbackPath, backupPath);
  await rename(fallbackPath, migratedPath);
  console.log(JSON.stringify({ ...summary, backupPath, dbPath, migratedPath }, null, 2));
}

await main();
