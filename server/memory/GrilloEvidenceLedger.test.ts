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

  it('requires correction participant identity to match the target claim exactly', async () => {
    const { ledger, memory } = createLedger();
    const scopeKey = 'local:persona:hikari-chan';
    const participantKey = 'local:local:subsect';
    try {
      const evidence = await ledger.appendEvidence({
        content: 'My favorite color is blue.',
        kind: 'turn',
        participantKey,
        role: 'user',
        scopeKey,
        source: 'local',
      });
      const claim = await ledger.evaluateClaim({
        confidence: 0.95,
        evidenceIds: [evidence.id],
        kind: 'preference',
        participantKey,
        predicate: 'favorite_color',
        scopeKey,
        subject: participantKey,
        value: 'blue',
      });
      const correction = await ledger.recordCorrection({
        correctedValue: 'navy blue',
        evidenceIds: [evidence.id],
        reason: 'More precise value.',
        scopeKey,
        targetClaimId: claim.claim!.id,
      });

      expect(correction.correction).toBeNull();
      expect(correction.decision).toMatchObject({
        operation: 'REJECT',
        outcome: 'rejected',
        publicReason: 'A correction participant must match its target claim.',
      });
    } finally {
      await memory.close();
    }
  });

  it('replays supersession chains identically regardless of storage order', async () => {
    const scopeKey = 'local:persona:hikari-chan';
    const evidence = rawEvidence(scopeKey, 'evidence-1', 5);
    const chain = [
      rawClaim(scopeKey, { id: 'claim-a', createdAt: 10, validFrom: 10, value: 'green' }),
      rawClaim(scopeKey, {
        id: 'claim-b',
        createdAt: 20,
        validFrom: 20,
        value: 'blue',
        operation: 'SUPERSEDE',
        supersedesRecordIds: ['claim-a'],
      }),
      rawClaim(scopeKey, {
        id: 'claim-c',
        createdAt: 30,
        validFrom: 30,
        value: 'red',
        operation: 'SUPERSEDE',
        supersedesRecordIds: ['claim-b'],
      }),
    ];
    const forward = createLedger();
    const reversed = createLedger();
    try {
      await forward.memory.appendGrilloRecord('evidence_records', evidence);
      await reversed.memory.appendGrilloRecord('evidence_records', evidence);
      for (const claim of chain) {
        await forward.memory.appendGrilloRecord('memory_claims', { ...claim });
      }
      for (const claim of [...chain].reverse()) {
        await reversed.memory.appendGrilloRecord('memory_claims', { ...claim });
      }
      const forwardReplay = await forward.ledger.replay(scopeKey);
      const reversedReplay = await reversed.ledger.replay(scopeKey);

      expect(reversedReplay).toEqual(forwardReplay);
      expect(forwardReplay.integrityIssues).toEqual([]);
      expect(
        forwardReplay.claimStates.map((state) => `${state.claim.id}:${state.status}`).sort(),
      ).toEqual(['claim-a:superseded', 'claim-b:superseded', 'claim-c:active']);
      expect(forwardReplay.activeClaims.map((state) => state.claim.id)).toEqual(['claim-c']);
    } finally {
      await forward.memory.close();
      await reversed.memory.close();
    }
  });

  it('applies supersession recorded out of createdAt order without losing it', async () => {
    const { ledger, memory } = createLedger();
    const scopeKey = 'local:persona:hikari-chan';
    try {
      await memory.appendGrilloRecord('evidence_records', rawEvidence(scopeKey, 'evidence-1', 5));
      // The superseding claim sorts before its target by createdAt.
      await memory.appendGrilloRecord('memory_claims', rawClaim(scopeKey, {
        id: 'claim-late-target',
        createdAt: 40,
        validFrom: 10,
        value: 'green',
      }));
      await memory.appendGrilloRecord('memory_claims', rawClaim(scopeKey, {
        id: 'claim-early-superseder',
        createdAt: 20,
        validFrom: 30,
        value: 'blue',
        operation: 'SUPERSEDE',
        supersedesRecordIds: ['claim-late-target'],
      }));
      const replay = await ledger.replay(scopeKey);

      expect(replay.integrityIssues).toEqual([]);
      expect(replay.activeClaims.map((state) => state.claim.id)).toEqual([
        'claim-early-superseder',
      ]);
    } finally {
      await memory.close();
    }
  });

  it('rejects a superseding claim whose validity starts before its target', async () => {
    const { ledger, memory } = createLedger();
    const scopeKey = 'local:persona:hikari-chan';
    try {
      const evidence = await ledger.appendEvidence({
        content: 'Green is my favorite color.',
        kind: 'turn',
        role: 'user',
        scopeKey,
        source: 'local',
      });
      const green = await ledger.evaluateClaim({
        confidence: 0.9,
        evidenceIds: [evidence.id],
        kind: 'preference',
        predicate: 'favorite_color',
        scopeKey,
        subject: 'local:local:subsect',
        value: 'green',
      });
      const backdated = await ledger.evaluateClaim({
        confidence: 0.9,
        evidenceIds: [evidence.id],
        kind: 'preference',
        operation: 'SUPERSEDE',
        predicate: 'favorite_color',
        scopeKey,
        subject: 'local:local:subsect',
        supersedesRecordIds: [green.claim!.id],
        validFrom: green.claim!.validFrom - 100,
        value: 'blue',
      });
      const replay = await ledger.replay(scopeKey);

      expect(backdated).toMatchObject({
        claim: null,
        decision: { operation: 'REJECT', outcome: 'rejected' },
      });
      expect(backdated.decision.publicReason).toContain('cannot begin before its target');
      expect(replay.claims.map((claim) => claim.id)).toEqual([green.claim!.id]);
      expect(replay.integrityIssues).toEqual([]);
    } finally {
      await memory.close();
    }
  });

  it('reports stored temporally-invalid supersession as a replay integrity issue', async () => {
    const { ledger, memory } = createLedger();
    const scopeKey = 'local:persona:hikari-chan';
    try {
      await memory.appendGrilloRecord('evidence_records', rawEvidence(scopeKey, 'evidence-1', 5));
      await memory.appendGrilloRecord('memory_claims', rawClaim(scopeKey, {
        id: 'claim-target',
        createdAt: 10,
        validFrom: 10,
        value: 'green',
      }));
      await memory.appendGrilloRecord('memory_claims', rawClaim(scopeKey, {
        id: 'claim-backdated',
        createdAt: 20,
        validFrom: 5,
        value: 'blue',
        operation: 'SUPERSEDE',
        supersedesRecordIds: ['claim-target'],
      }));
      const replay = await ledger.replay(scopeKey);

      expect(replay.integrityIssues).toContain(
        'claim:claim-backdated:invalid_interval:claim-target',
      );
      const target = replay.claimStates.find((state) => state.claim.id === 'claim-target');
      expect(target?.status).toBe('active');
    } finally {
      await memory.close();
    }
  });

  it('serializes concurrent identical claims into one stored claim plus one NOOP', async () => {
    const { ledger, memory } = createLedger();
    const scopeKey = 'local:persona:hikari-chan';
    try {
      const evidence = await ledger.appendEvidence({
        content: 'The user likes green.',
        kind: 'turn',
        role: 'user',
        scopeKey,
        source: 'local',
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
      const results = await Promise.all([ledger.evaluateClaim(input), ledger.evaluateClaim(input)]);
      const replay = await ledger.replay(scopeKey);
      const applied = results.filter((result) => result.decision.outcome === 'applied');
      const noops = results.filter((result) => result.decision.outcome === 'noop');

      expect(applied).toHaveLength(1);
      expect(noops).toHaveLength(1);
      expect(noops[0]?.decision.targetId).toBe(applied[0]?.claim?.id);
      expect(replay.claims).toHaveLength(1);
      expect(replay.decisions.map((decision) => decision.outcome).sort()).toEqual([
        'applied',
        'noop',
      ]);
    } finally {
      await memory.close();
    }
  });

  it('keeps identical claims about different participants separate instead of deduplicating', async () => {
    const { ledger, memory } = createLedger();
    const scopeKey = 'local:persona:hikari-chan';
    try {
      const evidence = await ledger.appendEvidence({
        content: 'Both chat participants like green.',
        kind: 'turn',
        role: 'user',
        scopeKey,
        source: 'local',
      });
      const base = {
        confidence: 0.8,
        evidenceIds: [evidence.id],
        kind: 'preference' as const,
        predicate: 'favorite_color',
        scopeKey,
        subject: 'favorite_color_owner',
        value: 'green',
      };
      const first = await ledger.evaluateClaim({ ...base, participantKey: 'local:local:subsect' });
      const second = await ledger.evaluateClaim({ ...base, participantKey: 'local:local:guest' });
      const repeat = await ledger.evaluateClaim({ ...base, participantKey: 'local:local:subsect' });
      const replay = await ledger.replay(scopeKey);

      expect(first.decision.outcome).toBe('applied');
      expect(second.decision.outcome).toBe('applied');
      expect(repeat).toMatchObject({
        claim: null,
        decision: { operation: 'NOOP', outcome: 'noop', targetId: first.claim?.id },
      });
      expect(replay.claims).toHaveLength(2);
      expect(new Set(replay.claims.map((claim) => claim.participantKey))).toEqual(
        new Set(['local:local:subsect', 'local:local:guest']),
      );
    } finally {
      await memory.close();
    }
  });

  it('reports malformed correction and supersession references as replay integrity issues', async () => {
    const { ledger, memory } = createLedger();
    const scopeKey = 'local:persona:hikari-chan';
    try {
      await memory.appendGrilloRecord('evidence_records', rawEvidence(scopeKey, 'evidence-1', 5));
      await memory.appendGrilloRecord('memory_claims', rawClaim(scopeKey, {
        id: 'claim-dangling',
        createdAt: 10,
        validFrom: 10,
        value: 'green',
        operation: 'SUPERSEDE',
        supersedesRecordIds: ['claim-that-never-existed'],
      }));
      await memory.appendGrilloRecord('memory_claims', rawClaim(scopeKey, {
        id: 'claim-self',
        createdAt: 20,
        validFrom: 20,
        value: 'blue',
        operation: 'SUPERSEDE',
        predicate: 'favorite_food',
        supersedesRecordIds: ['claim-self'],
      }));
      await memory.appendGrilloRecord('memory_corrections', {
        id: 'correction-dangling',
        correctedValue: 'navy blue',
        createdAt: 30,
        evidenceIds: ['evidence-1'],
        reason: 'Target claim never existed.',
        scopeKey,
        targetClaimId: 'claim-that-never-existed',
      });
      await memory.appendGrilloRecord('memory_corrections', {
        id: 'correction-time-travel',
        correctedValue: 'teal',
        createdAt: 1,
        evidenceIds: ['evidence-1'],
        reason: 'Recorded before its target claim.',
        scopeKey,
        targetClaimId: 'claim-dangling',
      });
      const replay = await ledger.replay(scopeKey);

      expect(replay.integrityIssues).toEqual(
        expect.arrayContaining([
          'claim:claim-dangling:missing_superseded:claim-that-never-existed',
          'claim:claim-self:self_supersession',
          'correction:correction-dangling:missing_target:claim-that-never-existed',
          'correction:correction-time-travel:predates_target:claim-dangling',
        ]),
      );
      const dangling = replay.claimStates.find((state) => state.claim.id === 'claim-dangling');
      expect(dangling?.status).toBe('active');
      expect(dangling?.effectiveValue).toBe('green');
    } finally {
      await memory.close();
    }
  });

  it('keeps stable claim replays warm across evidence appends and invalidates them for claims', async () => {
    const { ledger, memory } = createLedger();
    const scopeKey = 'local:persona:hikari-chan';
    try {
      const firstEvidence = await ledger.appendEvidence({
        content: 'The user prefers low-latency replies.',
        kind: 'turn',
        role: 'user',
        scopeKey,
        source: 'local',
      });
      const stableBefore = await ledger.replay(scopeKey, { stableClaimsOnly: true });
      const fullBefore = await ledger.replay(scopeKey);

      await ledger.appendEvidence({
        content: 'A later chat turn should not rebuild the claim projection.',
        kind: 'turn',
        role: 'assistant',
        scopeKey,
        source: 'local',
      });

      expect(await ledger.replay(scopeKey, { stableClaimsOnly: true })).toBe(stableBefore);
      expect(await ledger.replay(scopeKey)).not.toBe(fullBefore);

      await ledger.evaluateClaim({
        confidence: 0.95,
        evidenceIds: [firstEvidence.id],
        kind: 'preference',
        predicate: 'reply_latency',
        scopeKey,
        subject: 'local:local:subsect',
        value: 'low',
      });

      const stableAfterClaim = await ledger.replay(scopeKey, { stableClaimsOnly: true });
      expect(stableAfterClaim).not.toBe(stableBefore);
      expect(stableAfterClaim.activeClaims).toHaveLength(1);
    } finally {
      await memory.close();
    }
  });
});

function rawEvidence(scopeKey: string, id: string, createdAt: number) {
  return {
    id,
    content: 'Raw ledger fixture evidence.',
    createdAt,
    kind: 'turn',
    metadata: {},
    role: 'user',
    scopeKey,
    source: 'local',
    sourceRecordIds: [],
  };
}

function rawClaim(
  scopeKey: string,
  input: {
    id: string;
    createdAt: number;
    validFrom: number;
    value: string;
    operation?: 'ADD' | 'SUPERSEDE';
    predicate?: string;
    supersedesRecordIds?: string[];
  },
) {
  return {
    confidence: 0.9,
    createdAt: input.createdAt,
    evidenceIds: ['evidence-1'],
    id: input.id,
    kind: 'preference',
    operation: input.operation ?? 'ADD',
    predicate: input.predicate ?? 'favorite_color',
    scopeKey,
    subject: 'local:local:subsect',
    supersedesRecordIds: input.supersedesRecordIds ?? [],
    validFrom: input.validFrom,
    validTo: null,
    value: input.value,
  };
}
