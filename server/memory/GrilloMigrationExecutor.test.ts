import { describe, expect, it, vi } from 'vitest';
import type { GrilloLedgerReplay } from './GrilloEvidenceLedger';
import {
  executeGrilloMigrationPlan,
  type GrilloMigrationApplyInput,
} from './GrilloMigrationExecutor';
import { buildGrilloMigrationPlan } from './GrilloMigrationPlan';

const scopeKey = 'local:persona:hikari-chan';

describe('executeGrilloMigrationPlan', () => {
  it('performs a guarded dry run without writes', async () => {
    const plan = migrationPlan();
    const dependencies = deps();
    const result = await executeGrilloMigrationPlan(plan, request(plan, true), dependencies);
    expect(result.status).toBe('dry_run');
    expect(dependencies.appendEvidence).not.toHaveBeenCalled();
    expect(dependencies.appendReceipt).not.toHaveBeenCalled();
  });

  it('rejects stale guards with zero writes', async () => {
    const plan = migrationPlan();
    const dependencies = deps();
    const result = await executeGrilloMigrationPlan(
      plan,
      { ...request(plan, false), planHash: '0'.repeat(64) },
      dependencies,
    );
    expect(result.status).toBe('stale');
    expect(dependencies.appendEvidence).not.toHaveBeenCalled();
    expect(dependencies.appendReceipt).not.toHaveBeenCalled();
  });

  it('appends only planned evidence and start/completion receipts', async () => {
    const plan = migrationPlan();
    const dependencies = deps();
    const result = await executeGrilloMigrationPlan(plan, request(plan, false), dependencies);
    expect(result).toMatchObject({ status: 'completed', insertedTurnIds: ['turn-1'] });
    expect(dependencies.appendEvidence).toHaveBeenCalledTimes(1);
    expect(dependencies.appendEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'turn-1', kind: 'turn' }),
    );
    expect(dependencies.appendReceipt).toHaveBeenCalledTimes(2);
    expect(dependencies.appendReceipt).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ event: 'started', insertedTurnIds: [] }),
    );
    expect(dependencies.appendReceipt).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ event: 'completed', insertedTurnIds: ['turn-1'] }),
    );
  });

  it('records a retry-safe failed receipt after a partial append', async () => {
    const plan = migrationPlan(['turn-1', 'turn-2']);
    const dependencies = deps();
    dependencies.appendEvidence
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('storage failed'));
    const result = await executeGrilloMigrationPlan(plan, request(plan, false), dependencies);
    expect(result).toMatchObject({ status: 'failed', insertedTurnIds: ['turn-1'] });
    expect(dependencies.appendReceipt).toHaveBeenLastCalledWith(
      expect.objectContaining({ event: 'failed', insertedTurnIds: ['turn-1'] }),
    );
  });

  it('returns already applied without receipts when every item is a no-op', async () => {
    const initial = migrationPlan();
    const replay = emptyReplay();
    replay.evidence.push(initial.evidenceBackfill.items[0]!.candidate!);
    const plan = buildGrilloMigrationPlan({
      relationshipProfile: {},
      replay,
      scopeKey,
      turnEvents: [{
        turn_id: 'turn-1', content: 'turn 1', created_at: 1, role: 'user',
        scope_key: scopeKey, source: 'local',
      }],
    });
    const dependencies = deps();
    const result = await executeGrilloMigrationPlan(plan, request(plan, false), dependencies);
    expect(result.status).toBe('already_applied');
    expect(dependencies.appendEvidence).not.toHaveBeenCalled();
    expect(dependencies.appendReceipt).not.toHaveBeenCalled();
  });

  it('distinguishes an empty scope from an already-applied migration', async () => {
    const plan = migrationPlan([]);
    const dependencies = deps();
    const result = await executeGrilloMigrationPlan(plan, request(plan, false), dependencies);
    expect(result).toMatchObject({
      status: 'empty',
      publicReason: 'No canonical turn events exist in this scope.',
    });
    expect(dependencies.appendEvidence).not.toHaveBeenCalled();
    expect(dependencies.appendReceipt).not.toHaveBeenCalled();
  });
});

function migrationPlan(ids = ['turn-1']) {
  return buildGrilloMigrationPlan({
    relationshipProfile: {},
    replay: emptyReplay(),
    scopeKey,
    turnEvents: ids.map((id, index) => ({
      turn_id: id,
      content: `turn ${index + 1}`,
      created_at: index + 1,
      role: 'user',
      scope_key: scopeKey,
      source: 'local',
    })),
  });
}

function request(plan: ReturnType<typeof migrationPlan>, dryRun: boolean): GrilloMigrationApplyInput {
  return {
    dryRun,
    evidenceGeneration: plan.evidenceGeneration,
    planHash: plan.planHash,
    sourceGeneration: plan.sourceGeneration,
  };
}

function deps() {
  return {
    appendEvidence: vi.fn(async () => undefined),
    appendReceipt: vi.fn(async () => undefined),
    idFactory: () => 'run-1',
    nowMs: () => 100,
  };
}

function emptyReplay(): GrilloLedgerReplay {
  return {
    scopeKey,
    evidence: [],
    claims: [],
    corrections: [],
    decisions: [],
    claimStates: [],
    activeClaims: [],
    integrityIssues: [],
    invalidRecordIds: [],
  };
}
