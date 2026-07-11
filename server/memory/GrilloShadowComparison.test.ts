import { describe, expect, it } from 'vitest';
import type { GrilloLedgerReplay, GrilloMemoryClaim } from './GrilloEvidenceLedger';
import { buildGrilloShadowComparison } from './GrilloShadowComparison';

const SCOPE_KEY = 'local:persona:hikari-chan';
const PARTICIPANT_KEY = 'local:local:subsect';

describe('buildGrilloShadowComparison', () => {
  it('reports full parity as safe to switch with exact included IDs', () => {
    const report = buildGrilloShadowComparison(createParityInput());

    expect(report.safeToSwitch).toBe(true);
    expect(report.coverage.ready).toBe(true);
    expect(report.reconciliation).toEqual({
      turnEventCount: 1,
      ledgerTurnEvidenceCount: 1,
      turnIdsMissingFromEvidence: [],
      evidenceIdsMissingFromTurns: [],
      mismatchedTurnIds: [],
    });
    expect(report.legacyPrompt.lines).toEqual([
      'stage=familiar mood=warm',
      'summary=A trusted regular.',
      'known_facts=["likes green"]',
      `[block:preferences ${PARTICIPANT_KEY}] direct technical checks`,
      `[slot:preferences ${PARTICIPANT_KEY}] direct technical checks`,
    ]);
    expect(report.legacyPrompt.includedRecordIds).toEqual([
      `relationship_profile:${SCOPE_KEY}`,
      'block-preferences',
      'slot-preferences',
    ]);
    expect(report.legacyPrompt.droppedRecordIds).toEqual([]);
    expect(report.ledgerPrompt.includedClaimIds.sort()).toEqual([
      'claim-facts',
      'claim-mood',
      'claim-preferences',
      'claim-stage',
      'claim-summary',
    ]);
    expect(report.ledgerPrompt.droppedClaimIds).toEqual([]);
    expect(report.uncoveredLegacyItemIds).toEqual([]);
    expect(report.ledgerOnlyClaimIds).toEqual([]);
    expect(report.integrityIssues).toEqual([]);
    expect(report.invalidRecordIds).toEqual([]);
  });

  it('reports turn/evidence reconciliation gaps and blocks switching', () => {
    const input = createParityInput();
    input.turnEvents.push({
      content: 'A turn the ledger never saw.',
      created_at: 40,
      role: 'user',
      scope_key: SCOPE_KEY,
      turn_id: 'turn-unledgered',
    });
    input.replay.evidence.push({
      content: 'Evidence with no matching turn event.',
      createdAt: 50,
      id: 'evidence-orphan',
      kind: 'turn',
      metadata: {},
      role: 'user',
      scopeKey: SCOPE_KEY,
      source: 'local',
      sourceRecordIds: [],
    });
    input.turnEvents[0]!['content'] = 'Edited after ingestion.';
    const report = buildGrilloShadowComparison(input);

    expect(report.reconciliation.turnIdsMissingFromEvidence).toEqual(['turn-unledgered']);
    expect(report.reconciliation.evidenceIdsMissingFromTurns).toEqual(['evidence-orphan']);
    expect(report.reconciliation.mismatchedTurnIds).toEqual(['turn-1']);
    expect(report.safeToSwitch).toBe(false);
  });

  it('reports records dropped by the legacy lane cap', () => {
    const input = createParityInput();
    input.relationshipProfile = {};
    input.memorySlots = [];
    input.memoryBlocks = [1, 2, 3, 4].map((index) => ({
      block_id: `block-${index}`,
      block_name: `topic_${index}`,
      created_at: index,
      items: ['a', 'b', 'c', 'd', 'e'].map((letter) => `${letter}${index}`),
      operation: 'replace',
      participant_key: PARTICIPANT_KEY,
      scope_key: SCOPE_KEY,
    }));
    const report = buildGrilloShadowComparison(input);

    expect(report.legacyPrompt.lines).toHaveLength(16);
    expect(report.legacyPrompt.includedRecordIds).toEqual([
      'block-4',
      'block-3',
      'block-2',
      'block-1',
    ]);
    expect(report.legacyPrompt.droppedRecordIds).toEqual(['block-1']);
    expect(report.safeToSwitch).toBe(false);
  });

  it('propagates replay integrity issues and invalid records into the report', () => {
    const input = createParityInput();
    input.replay.integrityIssues = ['claim:claim-x:missing_superseded:claim-gone'];
    input.replay.invalidRecordIds = ['broken-record'];
    const report = buildGrilloShadowComparison(input);

    expect(report.integrityIssues).toEqual(['claim:claim-x:missing_superseded:claim-gone']);
    expect(report.invalidRecordIds).toEqual(['broken-record']);
    expect(report.coverage.ready).toBe(false);
    expect(report.safeToSwitch).toBe(false);
  });

  it('blocks switching while the ledger carries claims the legacy lane lacks', () => {
    const input = createParityInput();
    const extra = claim('claim-novel', 'preference', 'novel_predicate', 'brand new belief');
    input.replay.claims.push(extra);
    input.replay.claimStates.push({
      claim: extra,
      effectiveValue: extra.value,
      status: 'active',
      validTo: null,
    });
    input.replay.activeClaims = input.replay.claimStates;
    const report = buildGrilloShadowComparison(input);

    expect(report.ledgerOnlyClaimIds).toEqual(['claim-novel']);
    expect(report.safeToSwitch).toBe(false);
  });
});

function createParityInput() {
  const claims = [
    claim('claim-preferences', 'preference', 'preferences', ['direct technical checks']),
    claim('claim-stage', 'relationship', 'relationship_stage', 'familiar'),
    claim('claim-mood', 'relationship', 'mood', 'warm'),
    claim('claim-summary', 'relationship', 'summary', 'A trusted regular.'),
    claim('claim-facts', 'relationship', 'facts', ['likes green']),
  ];
  const replay: GrilloLedgerReplay = {
    scopeKey: SCOPE_KEY,
    evidence: [
      {
        content: 'I prefer direct technical checks.',
        createdAt: 10,
        id: 'turn-1',
        kind: 'turn',
        metadata: {},
        role: 'user',
        scopeKey: SCOPE_KEY,
        source: 'local',
        sourceRecordIds: ['turn-1'],
      },
    ],
    claims,
    corrections: [],
    decisions: [],
    claimStates: claims.map((record) => ({
      claim: record,
      effectiveValue: record.value,
      status: 'active' as const,
      validTo: null,
    })),
    activeClaims: [],
    integrityIssues: [],
    invalidRecordIds: [],
  };
  replay.activeClaims = replay.claimStates;
  return {
    generatedAt: 1_770_000_000_000,
    memoryBlocks: [
      {
        block_id: 'block-preferences',
        block_name: 'preferences',
        created_at: 10,
        items: ['direct technical checks'],
        operation: 'replace',
        participant_key: PARTICIPANT_KEY,
        scope_key: SCOPE_KEY,
      },
    ],
    memorySlots: [
      {
        content_json: JSON.stringify(['direct technical checks']),
        participant_key: PARTICIPANT_KEY,
        scope_key: SCOPE_KEY,
        slot_id: 'slot-preferences',
        slot_name: 'preferences',
      },
    ],
    relationshipProfile: {
      participantKey: PARTICIPANT_KEY,
      relationshipStage: 'familiar',
      mood: 'warm',
      summary: 'A trusted regular.',
      facts: ['likes green'],
    } as Record<string, unknown>,
    replay,
    scopeKey: SCOPE_KEY,
    turnEvents: [
      {
        content: 'I prefer direct technical checks.',
        created_at: 10,
        role: 'user',
        scope_key: SCOPE_KEY,
        turn_id: 'turn-1',
      },
    ] as Array<Record<string, unknown>>,
  };
}

function claim(
  id: string,
  kind: GrilloMemoryClaim['kind'],
  predicate: string,
  value: GrilloMemoryClaim['value'],
): GrilloMemoryClaim {
  return {
    confidence: 0.9,
    createdAt: 20,
    evidenceIds: ['turn-1'],
    id,
    kind,
    operation: 'ADD',
    participantKey: PARTICIPANT_KEY,
    predicate,
    scopeKey: SCOPE_KEY,
    subject: PARTICIPANT_KEY,
    supersedesRecordIds: [],
    validFrom: 20,
    validTo: null,
    value,
  };
}
