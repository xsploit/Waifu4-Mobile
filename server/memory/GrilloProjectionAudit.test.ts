import { describe, expect, it } from 'vitest';
import type { GrilloLedgerProjection, GrilloProjectedClaim } from './GrilloLedgerProjector';
import {
  auditGrilloProjectionCoverage,
  type GrilloLegacyProjectionSource,
} from './GrilloProjectionAudit';

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

  it('audits every top-level RelationshipMemory field', () => {
    const source = createLegacySource();
    source.relationshipProfile = {
      participantKey: 'local:local:subsect',
      version: 2,
      turnCount: 42,
      lastSeenAt: 1770000000000,
      lastDiaryTurnCount: 40,
      relationshipStage: 'familiar',
      mood: 'warm',
      trust: 4,
      attraction: 2,
      respect: 3,
      irritation: 0,
      jealousy: 1,
      guard: 2,
      lastActionTag: 'tease',
      facts: ['likes green'],
      summary: 'A trusted regular.',
      diaryEntry: 'Today felt easy.',
      diaryHistory: ['We joked around.'],
      affectState: {
        arousal: 0.2,
        dominance: 0.5,
        label: 'content',
        lastEmotion: 'joy',
        updatedAt: 1770000000000,
        valence: 0.7,
      },
    };
    const report = auditGrilloProjectionCoverage(createProjection(), source);
    const containers = new Set(
      report.legacyItems
        .filter((item) => item.source === 'relationship_profile')
        .map((item) => item.container),
    );

    for (const container of [
      'turn_count',
      'last_seen_at',
      'last_diary_turn_count',
      'relationship_stage',
      'mood',
      'trust',
      'attraction',
      'respect',
      'irritation',
      'jealousy',
      'guard',
      'last_action_tag',
      'facts',
      'summary',
      'diary_entry',
      'diary_history',
      'affect_state_arousal',
      'affect_state_dominance',
      'affect_state_label',
      'affect_state_last_emotion',
      'affect_state_updated_at',
      'affect_state_valence',
    ]) {
      expect(containers).toContain(container);
    }
    // irritation: 0 is meaningful state and must be audited, not skipped.
    expect(
      report.legacyItems.some(
        (item) => item.container === 'irritation' && item.value === 0,
      ),
    ).toBe(true);
    expect(report.ready).toBe(false);
  });

  it('never treats a numeric string as equal to a number', () => {
    const source = createLegacySource();
    source.relationshipProfile = {
      participantKey: 'local:local:subsect',
      stats: { trust: '4' },
    };
    const projection = createProjection();
    const report = auditGrilloProjectionCoverage(projection, source);
    const item = report.legacyItems.find((entry) => entry.container === 'stats_trust');

    expect(item?.value).toBe('4');
    expect(item?.exactClaimIds).toEqual([]);
    expect(item?.valueOnlyClaimIds).toEqual([]);
    expect(report.ready).toBe(false);
  });

  it('requires matching participant identity on both sides', () => {
    const projection = createProjection();
    for (const slot of projection.slots) {
      slot.current.participantKey = null;
    }
    projection.beliefs[0]!.participantKey = null;
    for (const claim of projection.relationships) {
      claim.participantKey = null;
    }
    const report = auditGrilloProjectionCoverage(projection, createLegacySource());

    expect(report.coverage.exact).toBe(0);
    expect(report.legacyItems.every((item) => item.exactClaimIds.length === 0)).toBe(true);
    expect(report.legacyItems.every((item) => item.valueOnlyClaimIds.length === 0)).toBe(true);
    expect(report.ready).toBe(false);
  });

  it('does not let nested-object scalars manufacture exact matches', () => {
    const projection = createProjection();
    projection.slots[1]!.current.effectiveValue = {
      inner: { stage: 'familiar' },
    };
    projection.relationships[0]!.effectiveValue = {
      inner: { stage: 'familiar' },
    };
    const report = auditGrilloProjectionCoverage(projection, createLegacySource());
    const stageItem = report.legacyItems.find(
      (item) => item.container === 'relationship_stage',
    );

    expect(stageItem?.exactClaimIds).toEqual([]);
    expect(stageItem?.valueOnlyClaimIds).toEqual([]);
    expect(report.ready).toBe(false);
  });

  it('matches structured values only through canonical deep equality', () => {
    const source = createLegacySource();
    source.memorySlots = [
      {
        content_json: JSON.stringify([{ b: 2, a: 1 }]),
        participant_key: 'local:local:subsect',
        scope_key: source.scopeKey,
        slot_id: 'slot-structured',
        slot_name: 'structured',
      },
    ];
    source.memoryBlocks = [];
    source.relationshipProfile = {};
    const projection = createProjection();
    projection.slots = [projection.slots[0]!];
    projection.slots[0]!.current.predicate = 'structured';
    projection.slots[0]!.current.effectiveValue = [{ a: 1, b: 2 }];
    const report = auditGrilloProjectionCoverage(projection, source);
    const item = report.legacyItems.find((entry) => entry.container === 'structured');

    expect(item?.exactClaimIds).toEqual(['claim-preferences']);
  });

  it('reports ledger-only claims and blocks readiness bidirectionally', () => {
    const projection = createProjection();
    const extra = {
      ...projection.slots[0]!.current,
      claimId: 'claim-ledger-only',
      effectiveValue: 'a belief the legacy store never had',
      predicate: 'novel_predicate',
    };
    projection.slots = [
      ...projection.slots,
      { current: extra, predicate: extra.predicate, subject: extra.subject },
    ];
    const report = auditGrilloProjectionCoverage(projection, createLegacySource());

    expect(report.ledgerOnlyClaimIds).toEqual(['claim-ledger-only']);
    expect(report.uncoveredItemIds).toEqual([]);
    expect(report.ready).toBe(false);
  });

  it('blocks readiness while the replay reports integrity issues', () => {
    const projection = createProjection();
    projection.provenance.integrityIssues = [
      'claim:claim-x:missing_superseded:claim-gone',
    ];
    const report = auditGrilloProjectionCoverage(projection, createLegacySource());

    expect(report.ledgerIntegrityIssues).toEqual([
      'claim:claim-x:missing_superseded:claim-gone',
    ]);
    expect(report.ready).toBe(false);
  });
});

function createLegacySource(): GrilloLegacyProjectionSource {
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
      integrityIssues: [],
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
