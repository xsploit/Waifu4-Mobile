import type { GrilloEvidenceRecord } from './GrilloEvidenceLedger.js';
import type { GrilloMigrationPlan } from './GrilloMigrationPlan.js';

export type GrilloMigrationApplyInput = {
  dryRun: boolean;
  evidenceGeneration: string;
  planHash: string;
  sourceGeneration: string;
};

type GrilloMigrationReceipt = {
  id: string;
  schemaVersion: '1.0.0';
  kind: 'turn_event_evidence_backfill';
  scopeKey: string;
  runId: string;
  event: 'completed' | 'failed' | 'started';
  planHash: string;
  sourceGeneration: string;
  evidenceGeneration: string;
  insertedTurnIds: string[];
  noopTurnIds: string[];
  conflictTurnIds: string[];
  publicReason: string;
  createdAt: number;
};

export type GrilloMigrationApplyResult = {
  status: 'already_applied' | 'blocked' | 'completed' | 'dry_run' | 'failed' | 'stale';
  scopeKey: string;
  runId: string | null;
  insertedTurnIds: string[];
  noopTurnIds: string[];
  conflictTurnIds: string[];
  publicReason: string;
};

type ExecutorDependencies = {
  appendEvidence: (record: GrilloEvidenceRecord) => Promise<unknown>;
  appendReceipt: (receipt: GrilloMigrationReceipt) => Promise<unknown>;
  idFactory: () => string;
  nowMs: () => number;
};

export async function executeGrilloMigrationPlan(
  plan: GrilloMigrationPlan,
  input: GrilloMigrationApplyInput,
  dependencies: ExecutorDependencies,
): Promise<GrilloMigrationApplyResult> {
  const stale =
    input.planHash !== plan.planHash ||
    input.sourceGeneration !== plan.sourceGeneration ||
    input.evidenceGeneration !== plan.evidenceGeneration;
  if (stale) {
    return result(plan, 'stale', null, [], 'The migration plan changed; request a fresh dry run.');
  }
  if (!plan.evidenceBackfill.canApply) {
    return result(
      plan,
      'blocked',
      null,
      [],
      'The migration plan contains conflicts or ledger integrity failures.',
    );
  }
  if (input.dryRun) {
    return result(plan, 'dry_run', null, [], 'Generation guards match; no records were written.');
  }
  if (plan.evidenceBackfill.inserts === 0) {
    return result(plan, 'already_applied', null, [], 'All planned evidence already exists.');
  }

  const runId = dependencies.idFactory();
  const insertedTurnIds: string[] = [];
  let receiptAt = dependencies.nowMs();
  await dependencies.appendReceipt(
    receipt(plan, runId, 'started', insertedTurnIds, 'Evidence migration started.', receiptAt),
  );
  try {
    for (const item of plan.evidenceBackfill.items) {
      if (item.action !== 'insert' || !item.candidate) continue;
      await dependencies.appendEvidence(item.candidate);
      insertedTurnIds.push(item.turnId);
    }
    receiptAt = Math.max(dependencies.nowMs(), receiptAt + 1);
    await dependencies.appendReceipt(
      receipt(plan, runId, 'completed', insertedTurnIds, 'Evidence migration completed.', receiptAt),
    );
    return result(plan, 'completed', runId, insertedTurnIds, 'Evidence migration completed.');
  } catch {
    receiptAt = Math.max(dependencies.nowMs(), receiptAt + 1);
    await dependencies.appendReceipt(
      receipt(
        plan,
        runId,
        'failed',
        insertedTurnIds,
        'Evidence migration stopped after a storage failure; appended evidence remains canonical and retry-safe.',
        receiptAt,
      ),
    ).catch(() => undefined);
    return result(
      plan,
      'failed',
      runId,
      insertedTurnIds,
      'Evidence migration stopped after a storage failure; retry with a fresh plan.',
    );
  }
}

function result(
  plan: GrilloMigrationPlan,
  status: GrilloMigrationApplyResult['status'],
  runId: string | null,
  insertedTurnIds: string[],
  publicReason: string,
): GrilloMigrationApplyResult {
  return {
    status,
    scopeKey: plan.scopeKey,
    runId,
    insertedTurnIds: [...insertedTurnIds],
    noopTurnIds: idsForAction(plan, 'noop'),
    conflictTurnIds: idsForAction(plan, 'conflict'),
    publicReason,
  };
}

function receipt(
  plan: GrilloMigrationPlan,
  runId: string,
  event: GrilloMigrationReceipt['event'],
  insertedTurnIds: string[],
  publicReason: string,
  createdAt: number,
): GrilloMigrationReceipt {
  return {
    id: `migration:${runId}:${event}`,
    schemaVersion: '1.0.0',
    kind: 'turn_event_evidence_backfill',
    scopeKey: plan.scopeKey,
    runId,
    event,
    planHash: plan.planHash,
    sourceGeneration: plan.sourceGeneration,
    evidenceGeneration: plan.evidenceGeneration,
    insertedTurnIds: [...insertedTurnIds],
    noopTurnIds: idsForAction(plan, 'noop'),
    conflictTurnIds: idsForAction(plan, 'conflict'),
    publicReason,
    createdAt,
  };
}

function idsForAction(plan: GrilloMigrationPlan, action: 'conflict' | 'noop') {
  return plan.evidenceBackfill.items
    .filter((item) => item.action === action)
    .map((item) => item.turnId);
}
