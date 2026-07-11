import { describe, expect, it } from 'vitest';
import type { GrilloLedgerReplay } from './GrilloEvidenceLedger';
import { buildGrilloMigrationPlan } from './GrilloMigrationPlan';

const scopeKey = 'local:persona:hikari-chan';

describe('buildGrilloMigrationPlan', () => {
  it('plans deterministic turn evidence without proposing claims or a prompt switch', () => {
    const plan = buildGrilloMigrationPlan({
      relationshipProfile: {
        affectState: { label: 'neutral', valence: 0 },
        facts: ['likes garlic'],
        relationshipStage: 'close',
        turnCount: 12,
      },
      replay: emptyReplay(),
      scopeKey,
      turnEvents: [turn('turn-1', 'hello')],
    });

    expect(plan.evidenceBackfill).toMatchObject({ canApply: true, conflicts: 0, inserts: 1, noops: 0 });
    expect(plan.evidenceBackfill.items[0]).toMatchObject({ action: 'insert', turnId: 'turn-1' });
    expect(plan.profileFields.map(({ disposition, field }) => ({ disposition, field }))).toEqual([
      { disposition: 'derived_runtime_state', field: 'turnCount' },
      { disposition: 'projection_state', field: 'relationshipStage' },
      { disposition: 'projection_state', field: 'affectState' },
      { disposition: 'durable_claim_candidate', field: 'facts' },
    ]);
    expect(plan.gates).toEqual({
      claimWritesPlanned: 0,
      livePromptSwitchPlanned: false,
      requiresExplicitApprovalToWrite: true,
    });
  });

  it('marks equivalent evidence as a no-op', () => {
    const replay = emptyReplay();
    replay.evidence.push({
      id: 'turn-1', content: 'hello', createdAt: 10, kind: 'turn', metadata: {}, role: 'user',
      scopeKey, source: 'local', sourceRecordIds: ['turn-1'],
    });
    const plan = buildGrilloMigrationPlan({
      relationshipProfile: {}, replay, scopeKey, turnEvents: [turn('turn-1', 'hello')],
    });
    expect(plan.evidenceBackfill).toMatchObject({ canApply: true, conflicts: 0, inserts: 0, noops: 1 });
  });

  it('blocks an evidence backfill when a ledger ID conflicts', () => {
    const replay = emptyReplay();
    replay.evidence.push({
      id: 'turn-1', content: 'different', createdAt: 10, kind: 'turn', metadata: {}, role: 'user',
      scopeKey, source: 'local', sourceRecordIds: ['turn-1'],
    });
    const plan = buildGrilloMigrationPlan({
      relationshipProfile: {}, replay, scopeKey, turnEvents: [turn('turn-1', 'hello')],
    });
    expect(plan.evidenceBackfill).toMatchObject({ canApply: false, conflicts: 1, inserts: 0, noops: 0 });
    expect(plan.evidenceBackfill.items[0]?.action).toBe('conflict');
  });
});

function emptyReplay(): GrilloLedgerReplay {
  return {
    scopeKey, evidence: [], claims: [], corrections: [], decisions: [], claimStates: [],
    activeClaims: [], integrityIssues: [], invalidRecordIds: [],
  };
}

function turn(turnId: string, content: string) {
  return {
    turn_id: turnId, content, created_at: 10, role: 'user', scope_key: scopeKey,
    source: 'local', participant_key: 'local:local:subsect',
  };
}
