import { describe, expect, it } from 'vitest';
import type { GrilloLedgerProjection, GrilloProjectedClaim } from './GrilloLedgerProjector';
import { auditGrilloProjectionCoverage } from './GrilloProjectionAudit';

describe('auditGrilloProjectionCoverage', () => {
  it('requires exact predicate and value coverage for current legacy state', () => {
    const projection = createProjection();
    const source = createLegacySource();
    const report = auditGrilloProjectionCoverage(projection, source);
    const reordered = auditGrilloProjectionCoverage(projection, {
      ...source,
      memoryBlocks: [...source.memoryBlocks].reverse(),
      memorySlots: [...source.memorySlots].reverse(),
    });

    expect(reordered).toEqual(report);
    expect(report).toMatchObject({
      ready: true,
      coverage: { exact: 4, ratio: 1, total: 4, valueOnly: 0 },
      legacyDrift: [],
      uncoveredItemIds: [],
    });
    expect(report.legacyItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          container: 'preferences',
          exactClaimIds: ['claim-preferences'],
          source: 'slot',
          value: 'direct technical checks',
        }),
        expect.objectContaining({
          container: 'relationship_stage',
          exactClaimIds: ['claim-stage'],
          source: 'relationship_profile',
          value: 'familiar',
        }),
      ]),
    );
  });

  it('reports value-only matches as uncovered instead of pretending migration parity', () => {
    const projection = createProjection();
    projection.slots[0]!.current.predicate = 'memory_check_style';
    projection.beliefs[0]!.predicate = 'memory_check_style';
    const report = auditGrilloProjectionCoverage(projection, createLegacySource());

    expect(report.ready).toBe(false);
    expect(report.coverage).toEqual({ exact: 2, ratio: 0.5, total: 4, valueOnly: 2 });
    expect(report.uncoveredItemIds).toHaveLength(2);
    expect(
      report.legacyItems
        .filter((item) => item.container === 'preferences')
        .every(
          (item) =>
            item.exactClaimIds.length === 0 &&
            item.valueOnlyClaimIds.includes('claim-preferences'),
        ),
    ).toBe(true);
  });

  it('blocks readiness when current blocks and slots have drifted', () => {
    const source = createLegacySource();
    source.memoryBlocks[0]!['items'] = [
      'direct technical checks',
      'an item missing from the current slot',
    ];
    const report = auditGrilloProjectionCoverage(createProjection(), source);

    expect(report.ready).toBe(false);
    expect(report.legacyDrift).toEqual([
      expect.objectContaining({
        blockValues: ['direct technical checks', 'an item missing from the current slot'],
        container: 'preferences',
        slotValues: ['direct technical checks'],
      }),
    ]);
  });
});

function createLegacySource() {
  const scopeKey = 'local:persona:hikari-chan';
  const participantKey = 'local:local:subsect';
  return {
    scopeKey,
    memoryBlocks: [
      {
        block_id: 'block-preferences',
        block_name: 'preferences',
        created_at: 10,
        items: ['direct technical checks'],
        operation: 'replace',
        participant_key: participantKey,
        scope_key: scopeKey,
      },
    ],
    memorySlots: [
      {
        content_json: JSON.stringify(['direct technical checks']),
        participant_key: participantKey,
        scope_key: scopeKey,
        slot_id: 'slot-preferences',
        slot_name: 'preferences',
      },
    ],
    relationshipProfile: {
      participantKey,
      relationshipStage: 'familiar',
      stats: { trust: 4 },
    },
  };
}

function createProjection(): GrilloLedgerProjection {
  const claims = [
    claim('claim-preferences', 'preference', 'preferences', ['direct technical checks']),
    claim('claim-stage', 'relationship', 'relationship_stage', 'familiar'),
    claim('claim-trust', 'relationship', 'stats_trust', 4),
  ];
  return {
    schemaVersion: '1.0.0',
    asOf: 20,
    generation: 'a'.repeat(64),
    scopeKey: 'local:persona:hikari-chan',
    beliefs: [claims[0]!],
    relationships: claims.slice(1),
    slots: claims.map((current) => ({
      current,
      predicate: current.predicate,
      subject: current.subject,
    })),
    timeline: [],
    provenance: {
      claimIds: claims.map((item) => item.claimId),
      correctionIds: [],
      decisionIds: [],
      evidenceIds: ['turn-1'],
      invalidRecordIds: [],
    },
  };
}

function claim(
  claimId: string,
  kind: GrilloProjectedClaim['kind'],
  predicate: string,
  effectiveValue: GrilloProjectedClaim['effectiveValue'],
): GrilloProjectedClaim {
  return {
    claimId,
    confidence: 0.9,
    effectiveValue,
    evidenceIds: ['turn-1'],
    kind,
    participantKey: 'local:local:subsect',
    predicate,
    status: 'active',
    subject: 'local:local:subsect',
    validFrom: 10,
    validTo: null,
  };
}
