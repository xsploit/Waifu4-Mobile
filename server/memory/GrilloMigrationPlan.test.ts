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
    expect(plan).toMatchObject({
      schemaVersion: '1.0.0',
      kind: 'turn_event_evidence_backfill',
    });
    expect(plan.planHash).toMatch(/^[a-f0-9]{64}$/);
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
    const initial = buildGrilloMigrationPlan({
      relationshipProfile: {}, replay, scopeKey, turnEvents: [turn('turn-1', 'hello')],
    });
    replay.evidence.push(initial.evidenceBackfill.items[0]!.candidate!);
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

  it('treats duplicate source turn IDs as one blocking conflict', () => {
    const plan = buildGrilloMigrationPlan({
      relationshipProfile: {}, replay: emptyReplay(), scopeKey,
      turnEvents: [turn('turn-1', 'hello'), turn('turn-1', 'hello again')],
    });
    expect(plan.evidenceBackfill).toMatchObject({ canApply: false, conflicts: 1, inserts: 0 });
    expect(plan.evidenceBackfill.items).toEqual([
      expect.objectContaining({ action: 'conflict', candidate: null, turnId: 'turn-1' }),
    ]);
  });

  it('keeps generations stable across source ordering and object key ordering', () => {
    const first = turn('turn-1', 'hello');
    const second = turn('turn-2', 'goodbye');
    const reversedKeys = Object.fromEntries(Object.entries(first).reverse());
    const left = buildGrilloMigrationPlan({
      relationshipProfile: {}, replay: emptyReplay(), scopeKey, turnEvents: [first, second],
    });
    const right = buildGrilloMigrationPlan({
      relationshipProfile: {}, replay: emptyReplay(), scopeKey, turnEvents: [second, reversedKeys],
    });
    expect(right.sourceGeneration).toBe(left.sourceGeneration);
    expect(right.evidenceGeneration).toBe(left.evidenceGeneration);
    expect(right.planHash).toBe(left.planHash);
  });

  it('changes the guarded plan when canonical evidence fields change', () => {
    const baseline = buildGrilloMigrationPlan({
      relationshipProfile: {}, replay: emptyReplay(), scopeKey, turnEvents: [turn('turn-1', 'hello')],
    });
    for (const changed of [
      { ...turn('turn-1', 'changed') },
      { ...turn('turn-1', 'hello'), created_at: 11 },
      { ...turn('turn-1', 'hello'), participant_key: 'local:local:someone-else' },
      { ...turn('turn-1', 'hello'), role: 'assistant' },
      { ...turn('turn-1', 'hello'), source: 'twitch' },
    ]) {
      const plan = buildGrilloMigrationPlan({
        relationshipProfile: {}, replay: emptyReplay(), scopeKey, turnEvents: [changed],
      });
      expect(plan.planHash).not.toBe(baseline.planHash);
    }
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
