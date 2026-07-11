import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { GrilloEvidenceLedger } from './GrilloEvidenceLedger';
import { LadybugMemoryService } from './LadybugMemoryService';

const dbPaths: string[] = [];

function createLedger() {
  const dbPath = join(tmpdir(), `webwaifu4-grillo-ledger-test-${process.pid}-${Date.now()}.db`);
  dbPaths.push(dbPath);
  const memory = new LadybugMemoryService(dbPath);
  let id = 0;
  let now = 1770000000000;
  const ledger = new GrilloEvidenceLedger(memory, {
    idFactory: (prefix) => `${prefix}-${++id}`,
    nowMs: () => ++now,
  });
  return { ledger, memory };
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

describe('GrilloEvidenceLedger', () => {
  it('accepts an evidence-backed claim and replays its provenance', async () => {
    const { ledger, memory } = createLedger();
    const scopeKey = 'local:persona:hikari-chan';
    try {
      const evidence = await ledger.appendEvidence({
        content: 'Subsect prefers concise release notes.',
        kind: 'turn',
        role: 'user',
        scopeKey,
        source: 'local',
      });
      const result = await ledger.evaluateClaim({
        confidence: 0.92,
        evidenceIds: [evidence.id],
        kind: 'preference',
        predicate: 'prefers_release_notes',
        scopeKey,
        subject: 'local:local:subsect',
        value: 'concise',
      });
      const replay = await ledger.replay(scopeKey);

      expect(result.decision).toMatchObject({ operation: 'ADD', outcome: 'applied' });
      expect(result.claim?.evidenceIds).toEqual([evidence.id]);
      expect(replay.evidence.map((record) => record.id)).toEqual([evidence.id]);
      expect(replay.activeClaims.map((state) => state.claim.id)).toEqual([result.claim?.id]);
      expect(replay.decisions[0]).toMatchObject({
        evidenceIds: [evidence.id],
        targetId: result.claim?.id,
      });
      expect(replay.invalidRecordIds).toEqual([]);
    } finally {
      await memory.close();
    }
  });

  it('rejects unsupported claims and defers claims with unavailable evidence', async () => {
    const { ledger, memory } = createLedger();
    const scopeKey = 'local:persona:hikari-chan';
    try {
      const otherScopeEvidence = await ledger.appendEvidence({
        id: 'evidence-from-another-scope',
        content: 'This evidence belongs to another persona.',
        kind: 'turn',
        role: 'user',
        scopeKey: 'local:persona:neuro-sama',
        source: 'local',
      });
      const unsupported = await ledger.evaluateClaim({
        confidence: 0.8,
        evidenceIds: [],
        kind: 'fact',
        predicate: 'favorite_color',
        scopeKey,
        subject: 'local:local:subsect',
        value: 'green',
      });
      const unavailable = await ledger.evaluateClaim({
        confidence: 0.8,
        evidenceIds: [otherScopeEvidence.id],
        kind: 'fact',
        predicate: 'favorite_color',
        scopeKey,
        subject: 'local:local:subsect',
        value: 'green',
      });
      const replay = await ledger.replay(scopeKey);

      expect(unsupported).toMatchObject({
        claim: null,
        decision: { operation: 'REJECT', outcome: 'rejected' },
      });
      expect(unavailable).toMatchObject({
        claim: null,
        decision: { operation: 'DEFER', outcome: 'deferred' },
      });
      expect(replay.claims).toEqual([]);
      expect(replay.evidence).toEqual([]);
      expect(replay.decisions.map((decision) => decision.outcome)).toEqual(['rejected', 'deferred']);
    } finally {
      await memory.close();
    }
  });

  it('records duplicate claims as no-ops instead of duplicating durable memory', async () => {
    const { ledger, memory } = createLedger();
    const scopeKey = 'local:persona:hikari-chan';
    try {
      const evidence = await ledger.appendEvidence({
        content: 'The user likes green.',
        kind: 'observation',
        role: 'worker',
        scopeKey,
        source: 'grillo',
      });
      const input = {
        confidence: 0.8,
        evidenceIds: [evidence.id],
        kind: 'preference' as const,
        predicate: 'favorite_color',
        scopeKey,
        subject: 'local:local:subsect',
        value: 'green',
      };
      const first = await ledger.evaluateClaim(input);
      const second = await ledger.evaluateClaim(input);
      const conflicting = await ledger.evaluateClaim({ ...input, value: 'blue' });
      const replay = await ledger.replay(scopeKey);

      expect(first.claim).not.toBeNull();
      expect(second).toMatchObject({
        claim: null,
        decision: { operation: 'NOOP', outcome: 'noop', targetId: first.claim?.id },
      });
      expect(conflicting).toMatchObject({
        claim: null,
        decision: { operation: 'DEFER', outcome: 'deferred' },
      });
      expect(replay.claims).toHaveLength(1);
      expect(replay.decisions).toHaveLength(3);
    } finally {
      await memory.close();
    }
  });

  it('allows a historical value to return when it explicitly supersedes the current claim', async () => {
    const { ledger, memory } = createLedger();
    const scopeKey = 'local:persona:hikari-chan';
    try {
      const greenEvidence = await ledger.appendEvidence({
        content: 'Green is my favorite color.',
        kind: 'turn',
        role: 'user',
        scopeKey,
        source: 'local',
      });
      const green = await ledger.evaluateClaim({
        confidence: 0.9,
        evidenceIds: [greenEvidence.id],
        kind: 'preference',
        predicate: 'favorite_color',
        scopeKey,
        subject: 'local:local:subsect',
        value: 'green',
      });
      const blueEvidence = await ledger.appendEvidence({
        content: 'Blue is my favorite now.',
        kind: 'turn',
        role: 'user',
        scopeKey,
        source: 'local',
      });
      const blue = await ledger.evaluateClaim({
        confidence: 0.9,
        evidenceIds: [blueEvidence.id],
        kind: 'preference',
        operation: 'SUPERSEDE',
        predicate: 'favorite_color',
        scopeKey,
        subject: 'local:local:subsect',
        supersedesRecordIds: [green.claim!.id],
        value: 'blue',
      });
      const greenAgainEvidence = await ledger.appendEvidence({
        content: 'I changed my mind back to green.',
        kind: 'turn',
        role: 'user',
        scopeKey,
        source: 'local',
      });
      const greenAgain = await ledger.evaluateClaim({
        confidence: 0.95,
        evidenceIds: [greenAgainEvidence.id],
        kind: 'preference',
        operation: 'SUPERSEDE',
        predicate: 'favorite_color',
        scopeKey,
        subject: 'local:local:subsect',
        supersedesRecordIds: [blue.claim!.id],
        value: 'green',
      });
      const replay = await ledger.replay(scopeKey);

      expect(greenAgain).toMatchObject({
        decision: { operation: 'SUPERSEDE', outcome: 'applied' },
      });
      expect(replay.activeClaims).toEqual([
        expect.objectContaining({
          claim: expect.objectContaining({ id: greenAgain.claim!.id, value: 'green' }),
          status: 'active',
        }),
      ]);
      expect(replay.claims).toHaveLength(3);
    } finally {
      await memory.close();
    }
  });

  it('replays supersession and corrections without mutating canonical records', async () => {
    const { ledger, memory } = createLedger();
    const scopeKey = 'local:persona:hikari-chan';
    try {
      const oldEvidence = await ledger.appendEvidence({
        content: 'My favorite color is green.',
        kind: 'turn',
        role: 'user',
        scopeKey,
        source: 'local',
      });
      const oldClaim = await ledger.evaluateClaim({
        confidence: 0.9,
        evidenceIds: [oldEvidence.id],
        kind: 'preference',
        predicate: 'favorite_color',
        scopeKey,
        subject: 'local:local:subsect',
        value: 'green',
      });
      const newEvidence = await ledger.appendEvidence({
        content: 'Actually, my favorite color is blue now.',
        kind: 'correction',
        role: 'user',
        scopeKey,
        source: 'local',
      });
      const newClaim = await ledger.evaluateClaim({
        confidence: 0.95,
        evidenceIds: [newEvidence.id],
        kind: 'preference',
        operation: 'SUPERSEDE',
        predicate: 'favorite_color',
        scopeKey,
        subject: 'local:local:subsect',
        supersedesRecordIds: [oldClaim.claim!.id],
        value: 'blue',
      });
      const correction = await ledger.recordCorrection({
        correctedValue: 'navy blue',
        evidenceIds: [newEvidence.id],
        reason: 'The user supplied a more precise value.',
        scopeKey,
        targetClaimId: newClaim.claim!.id,
      });
      const replay = await ledger.replay(scopeKey);
      const oldState = replay.claimStates.find((state) => state.claim.id === oldClaim.claim!.id);
      const newState = replay.claimStates.find((state) => state.claim.id === newClaim.claim!.id);

      expect(correction.decision.outcome).toBe('applied');
      expect(replay.claims).toHaveLength(2);
      expect(oldState).toMatchObject({ status: 'superseded' });
      expect(newState).toMatchObject({ effectiveValue: 'navy blue', status: 'corrected' });
      expect(replay.activeClaims).toEqual([
        expect.objectContaining({ effectiveValue: 'navy blue', status: 'corrected' }),
      ]);
      expect(replay.claims[0]?.value).toBe('green');
      expect(replay.claims[1]?.value).toBe('blue');
    } finally {
      await memory.close();
    }
  });
});
