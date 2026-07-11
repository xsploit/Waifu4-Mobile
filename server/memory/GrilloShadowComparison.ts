import type { GrilloLedgerReplay } from './GrilloEvidenceLedger.js';
import { buildGrilloLedgerProjection } from './GrilloLedgerProjector.js';
import {
  auditGrilloProjectionCoverage,
  type GrilloProjectionCoverageReport,
} from './GrilloProjectionAudit.js';

export type GrilloShadowComparisonInput = {
  generatedAt?: number;
  memoryBlocks: Array<Record<string, unknown>>;
  memorySlots: Array<Record<string, unknown>>;
  relationshipProfile: Record<string, unknown>;
  replay: GrilloLedgerReplay;
  scopeKey: string;
  turnEvents: Array<Record<string, unknown>>;
};

export type GrilloShadowComparisonReport = {
  scopeKey: string;
  generatedAt: number;
  projectionGeneration: string;
  reconciliation: {
    turnEventCount: number;
    ledgerTurnEvidenceCount: number;
    turnIdsMissingFromEvidence: string[];
    evidenceIdsMissingFromTurns: string[];
    mismatchedTurnIds: string[];
  };
  legacyPrompt: {
    lines: string[];
    includedRecordIds: string[];
    droppedRecordIds: string[];
  };
  ledgerPrompt: {
    lines: string[];
    includedClaimIds: string[];
    droppedClaimIds: string[];
  };
  coverage: GrilloProjectionCoverageReport;
  uncoveredLegacyItemIds: string[];
  ledgerOnlyClaimIds: string[];
  integrityIssues: string[];
  invalidRecordIds: string[];
  safeToSwitch: boolean;
  notes: string[];
};

// Matches the live lane caps in GrilloWorkerService.buildContextPacket.
const LANE_LINE_LIMIT = 16;
const LANE_RECORD_LIMIT = 8;
const LANE_ITEMS_PER_RECORD = 5;

/**
 * Read-only shadow comparison between the legacy relationship-memory prompt
 * lane and the evidence-ledger projection. The legacy rendering below is a
 * byte-for-byte mirror of the `relationship_memory` lane assembled by
 * GrilloWorkerService.buildContextPacket (with no participant filter); it
 * never feeds live prompt injection and never writes anything.
 */
export function buildGrilloShadowComparison(
  input: GrilloShadowComparisonInput,
): GrilloShadowComparisonReport {
  const projection = buildGrilloLedgerProjection(input.replay);
  const coverage = auditGrilloProjectionCoverage(projection, {
    memoryBlocks: input.memoryBlocks,
    memorySlots: input.memorySlots,
    relationshipProfile: input.relationshipProfile,
    scopeKey: input.scopeKey,
  });
  const legacyLines = renderLegacyRelationshipLane(input);
  const includedLegacy = legacyLines.slice(0, LANE_LINE_LIMIT);
  const droppedLegacy = legacyLines.slice(LANE_LINE_LIMIT);
  const ledgerLines = projection.slots.map((slot) => ({
    sourceId: slot.current.claimId,
    text: renderProjectedClaimLine(slot.current),
  }));
  const includedLedger = ledgerLines.slice(0, LANE_LINE_LIMIT);
  const droppedLedger = ledgerLines.slice(LANE_LINE_LIMIT);
  const reconciliation = reconcileTurnEvidence(input);
  const safeToSwitch =
    coverage.ready &&
    reconciliation.turnIdsMissingFromEvidence.length === 0 &&
    reconciliation.evidenceIdsMissingFromTurns.length === 0 &&
    reconciliation.mismatchedTurnIds.length === 0 &&
    input.replay.integrityIssues.length === 0 &&
    input.replay.invalidRecordIds.length === 0 &&
    droppedLedger.length === 0;
  return {
    scopeKey: input.scopeKey,
    generatedAt: input.generatedAt ?? Date.now(),
    projectionGeneration: projection.generation,
    reconciliation,
    legacyPrompt: {
      lines: includedLegacy.map((line) => line.text),
      includedRecordIds: uniqueIds(includedLegacy.map((line) => line.sourceId)),
      droppedRecordIds: uniqueIds(droppedLegacy.map((line) => line.sourceId)),
    },
    ledgerPrompt: {
      lines: includedLedger.map((line) => line.text),
      includedClaimIds: uniqueIds(includedLedger.map((line) => line.sourceId)),
      droppedClaimIds: uniqueIds(droppedLedger.map((line) => line.sourceId)),
    },
    coverage,
    uncoveredLegacyItemIds: [...coverage.uncoveredItemIds],
    ledgerOnlyClaimIds: [...coverage.ledgerOnlyClaimIds],
    integrityIssues: [...input.replay.integrityIssues],
    invalidRecordIds: [...input.replay.invalidRecordIds],
    safeToSwitch,
    notes: [
      'Read-only shadow report: live prompt injection still uses the legacy lane.',
      'Legacy and ledger lines are rendered in different formats; value-level parity is measured by the coverage audit, not by string equality.',
      'No backfill is performed; uncovered legacy items require explicit evidence-backed claims before switching.',
    ],
  };
}

type LaneLine = {
  sourceId: string;
  text: string;
};

function renderLegacyRelationshipLane(input: GrilloShadowComparisonInput): LaneLine[] {
  const inScope = (record: Record<string, unknown>) => recordScopeKey(record) === input.scopeKey;
  const scopedBlocks = input.memoryBlocks
    .filter(inScope)
    .sort((left, right) => recordUpdatedAt(right) - recordUpdatedAt(left))
    .slice(0, LANE_RECORD_LIMIT);
  const scopedSlots = input.memorySlots
    .filter(inScope)
    .sort((left, right) => recordUpdatedAt(right) - recordUpdatedAt(left))
    .slice(0, LANE_RECORD_LIMIT);
  return [
    ...formatRelationshipProfile(input.relationshipProfile).map((text) => ({
      sourceId: `relationship_profile:${input.scopeKey}`,
      text,
    })),
    ...scopedBlocks.flatMap(formatMemoryBlock),
    ...scopedSlots.flatMap(formatMemorySlot),
  ];
}

function renderProjectedClaimLine(claim: {
  claimId: string;
  effectiveValue: unknown;
  kind: string;
  participantKey: string | null;
  predicate: string;
  status: string;
  subject: string;
}) {
  const suffix = claim.status === 'corrected' ? ' (corrected)' : '';
  return `[claim:${claim.kind} ${claim.participantKey ?? 'scope'}] ${claim.subject}.${claim.predicate} = ${JSON.stringify(claim.effectiveValue)}${suffix}`;
}

function reconcileTurnEvidence(input: GrilloShadowComparisonInput) {
  const scopedTurns = input.turnEvents.filter(
    (record) => recordScopeKey(record) === input.scopeKey,
  );
  const turnsById = new Map(
    scopedTurns
      .map((record) => [recordTurnId(record), record] as const)
      .filter(([id]) => Boolean(id)),
  );
  const turnEvidence = input.replay.evidence.filter((record) => record.kind === 'turn');
  const evidenceById = new Map(turnEvidence.map((record) => [record.id, record]));
  const turnIdsMissingFromEvidence = [...turnsById.keys()]
    .filter((id) => !evidenceById.has(id))
    .sort();
  const evidenceIdsMissingFromTurns = [...evidenceById.keys()]
    .filter((id) => !turnsById.has(id))
    .sort();
  const mismatchedTurnIds = [...turnsById.entries()]
    .filter(([id, record]) => {
      const evidence = evidenceById.get(id);
      if (!evidence) return false;
      return (
        normalizeText(record['content'] ?? record['text']) !== normalizeText(evidence.content) ||
        normalizeText(record['role']) !== normalizeText(evidence.role)
      );
    })
    .map(([id]) => id)
    .sort();
  return {
    turnEventCount: turnsById.size,
    ledgerTurnEvidenceCount: turnEvidence.length,
    turnIdsMissingFromEvidence,
    evidenceIdsMissingFromTurns,
    mismatchedTurnIds,
  };
}

// --- Read-only mirrors of the buildContextPacket lane formatters. Keep the
// --- output byte-identical to GrilloWorkerService so the shadow report shows
// --- exactly what the live legacy lane renders today.

function formatRelationshipProfile(profile: Record<string, unknown>) {
  if (Object.keys(profile).length === 0) {
    return [];
  }
  const facts = readStringArray(profile['facts'] ?? profile['storedFacts']);
  return [
    `stage=${normalizeText(profile['relationshipStage']) || 'new'} mood=${normalizeText(profile['mood']) || 'neutral'}`,
    normalizeText(profile['summary']) ? `summary=${normalizeText(profile['summary'])}` : '',
    facts.length > 0 ? `known_facts=${JSON.stringify(facts.slice(0, 12))}` : '',
  ].filter(Boolean);
}

function formatMemoryBlock(record: Record<string, unknown>): LaneLine[] {
  const blockName = normalizeText(record['blockName'] ?? record['block_name']) || 'memory';
  const participantKey = recordParticipantKey(record) || 'unknown';
  const sourceId =
    normalizeText(record['block_id'] ?? record['blockId'] ?? record['id']) || `block:${blockName}`;
  return readJsonArray(record['itemsJson'] ?? record['items_json'] ?? record['items'])
    .slice(0, LANE_ITEMS_PER_RECORD)
    .map((item) => ({ sourceId, text: `[block:${blockName} ${participantKey}] ${item}` }));
}

function formatMemorySlot(record: Record<string, unknown>): LaneLine[] {
  const slotName = normalizeText(record['slotName'] ?? record['slot_name']) || 'slot';
  const participantKey = recordParticipantKey(record) || 'scope';
  const sourceId =
    normalizeText(record['slot_id'] ?? record['slotId'] ?? record['id']) || `slot:${slotName}`;
  return readJsonArray(record['contentJson'] ?? record['content_json'])
    .slice(0, LANE_ITEMS_PER_RECORD)
    .map((item) => ({ sourceId, text: `[slot:${slotName} ${participantKey}] ${item}` }));
}

function readJsonArray(value: unknown) {
  const parsed = typeof value === 'string' ? safeJsonParse(value) : value;
  return Array.isArray(parsed) ? parsed.map((item) => normalizeText(item)).filter(Boolean) : [];
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => normalizeText(item)).filter(Boolean).slice(0, 24)
    : [];
}

function recordScopeKey(record: Record<string, unknown>) {
  return normalizeText(record['scopeKey'] ?? record['scope_key'] ?? record['user_id']);
}

function recordParticipantKey(record: Record<string, unknown>) {
  return normalizeText(record['participantKey'] ?? record['participant_key']);
}

function recordTurnId(record: Record<string, unknown>) {
  return normalizeText(record['turnId'] ?? record['turn_id'] ?? record['id']);
}

function recordTimestamp(record: Record<string, unknown>) {
  const numeric = Number(record['createdAt'] ?? record['created_at'] ?? record['timestamp']);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : 0;
}

function recordUpdatedAt(record: Record<string, unknown>) {
  const raw = record['updatedAt'] ?? record['updated_at'];
  if (raw === undefined || raw === null) return recordTimestamp(record);
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : 0;
}

function normalizeText(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function uniqueIds(ids: string[]) {
  return [...new Set(ids.filter(Boolean))];
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}
