import { describe, expect, it } from 'vitest';
import type { GrilloLedgerReplay } from './GrilloEvidenceLedger';
import { buildGrilloLedgerProjection } from './GrilloLedgerProjector';

describe('buildGrilloLedgerProjection', () => {
  it('deterministically rebuilds current beliefs, relationships, slots, and history', () => {
    const replay = createReplay();
    const projection = buildGrilloLedgerProjection(replay);
    const reordered = buildGrilloLedgerProjection({
      ...replay,
      claims: [...replay.claims].reverse(),
      decisions: [...replay.decisions].reverse(),
      evidence: [...replay.evidence].reverse(),
    });

    expect(reordered).toEqual(projection);
    expect(projection.generation).toMatch(/^[a-f0-9]{64}$/);
    expect(projection.asOf).toBe(31);
    expect(projection.beliefs).toEqual([
      expect.objectContaining({
        claimId: 'claim-blue',
        effectiveValue: 'navy blue',
        predicate: 'favorite_color',
        status: 'corrected',
      }),
    ]);
    expect(projection.relationships).toEqual([
      expect.objectContaining({
        claimId: 'claim-trust',
        effectiveValue: 4,
        predicate: 'trust',
        status: 'active',
      }),
    ]);
    expect(projection.slots.map((slot) => `${slot.subject}:${slot.predicate}`)).toEqual([
      'local:local:subsect:favorite_color',
      'local:local:subsect:trust',
    ]);
    expect(projection.provenance).toEqual({
      claimIds: ['claim-blue', 'claim-green', 'claim-trust'],
      correctionIds: ['correction-blue'],
      decisionIds: ['decision-blue', 'decision-green', 'decision-trust'],
      evidenceIds: ['evidence-blue', 'evidence-green', 'evidence-trust'],
      invalidRecordIds: [],
    });
    expect(projection.timeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operation: 'SUPERSEDE',
          recordId: 'claim-blue',
          targetIds: ['claim-green'],
          type: 'claim',
        }),
        expect.objectContaining({
          operation: 'CORRECT',
          recordId: 'correction-blue',
          targetIds: ['claim-blue'],
          type: 'correction',
        }),
      ]),
    );
  });

  it('changes the projection generation when canonical state changes', () => {
    const replay = createReplay();
    const original = buildGrilloLedgerProjection(replay);
    const changed = buildGrilloLedgerProjection({
      ...replay,
      activeClaims: replay.activeClaims.map((state) =>
        state.claim.id === 'claim-blue' ? { ...state, effectiveValue: 'royal blue' } : state,
      ),
    });

    expect(changed.generation).not.toBe(original.generation);
    expect(changed.beliefs[0]?.effectiveValue).toBe('royal blue');
  });
});

function createReplay(): GrilloLedgerReplay {
  const scopeKey = 'local:persona:hikari-chan';
  const evidence = [
    evidenceRecord('evidence-green', 10, 'Green is my favorite color.'),
    evidenceRecord('evidence-blue', 20, 'Blue is my favorite color now.'),
    evidenceRecord('evidence-trust', 30, 'I trust you with this project.'),
  ];
  const green = claimRecord({
    id: 'claim-green',
    createdAt: 11,
    evidenceIds: ['evidence-green'],
    kind: 'preference',
    predicate: 'favorite_color',
    validFrom: 11,
    value: 'green',
  });
  const blue = claimRecord({
    id: 'claim-blue',
    createdAt: 21,
    evidenceIds: ['evidence-blue'],
    kind: 'preference',
    operation: 'SUPERSEDE',
    predicate: 'favorite_color',
    supersedesRecordIds: ['claim-green'],
    validFrom: 21,
    value: 'blue',
  });
  const trust = claimRecord({
    id: 'claim-trust',
    createdAt: 31,
    evidenceIds: ['evidence-trust'],
    kind: 'relationship',
    predicate: 'trust',
    validFrom: 31,
    value: 4,
  });
  return {
    scopeKey,
    evidence,
    claims: [green, blue, trust],
    corrections: [
      {
        id: 'correction-blue',
        correctedValue: 'navy blue',
        createdAt: 25,
        evidenceIds: ['evidence-blue'],
        reason: 'The user clarified the shade.',
        scopeKey,
        targetClaimId: 'claim-blue',
      },
    ],
    decisions: [
      decisionRecord('decision-green', 'claim-green', 'evidence-green', 12, 'ADD'),
      decisionRecord('decision-blue', 'claim-blue', 'evidence-blue', 22, 'SUPERSEDE'),
      decisionRecord('decision-trust', 'claim-trust', 'evidence-trust', 31, 'ADD'),
    ],
    claimStates: [
      { claim: green, effectiveValue: 'green', status: 'superseded', validTo: 21 },
      { claim: blue, effectiveValue: 'navy blue', status: 'corrected', validTo: null },
      { claim: trust, effectiveValue: 4, status: 'active', validTo: null },
    ],
    activeClaims: [
      { claim: blue, effectiveValue: 'navy blue', status: 'corrected', validTo: null },
      { claim: trust, effectiveValue: 4, status: 'active', validTo: null },
    ],
    invalidRecordIds: [],
  };

  function evidenceRecord(id: string, createdAt: number, content: string) {
    return {
      id,
      content,
      createdAt,
      kind: 'turn' as const,
      metadata: {},
      role: 'user' as const,
      scopeKey,
      source: 'local',
      sourceRecordIds: [id],
    };
  }

  function claimRecord(input: {
    id: string;
    createdAt: number;
    evidenceIds: string[];
    kind: 'preference' | 'relationship';
    operation?: 'ADD' | 'SUPERSEDE';
    predicate: string;
    supersedesRecordIds?: string[];
    validFrom: number;
    value: string | number;
  }) {
    return {
      confidence: 0.9,
      id: input.id,
      createdAt: input.createdAt,
      evidenceIds: input.evidenceIds,
      kind: input.kind,
      operation: input.operation ?? ('ADD' as const),
      predicate: input.predicate,
      scopeKey,
      subject: 'local:local:subsect',
      supersedesRecordIds: input.supersedesRecordIds ?? [],
      validFrom: input.validFrom,
      validTo: null,
      value: input.value,
    };
  }

  function decisionRecord(
    id: string,
    targetId: string,
    evidenceId: string,
    createdAt: number,
    operation: 'ADD' | 'SUPERSEDE',
  ) {
    return {
      id,
      createdAt,
      evidenceIds: [evidenceId],
      operation,
      outcome: 'applied' as const,
      publicReason: 'Accepted with evidence.',
      runId: `run:${id}`,
      scopeKey,
      targetId,
      targetType: 'claim' as const,
    };
  }
}
