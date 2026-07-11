import { createHash } from 'node:crypto';
import type {
  GrilloClaimState,
  GrilloLedgerReplay,
  GrilloMemoryClaim,
} from './GrilloEvidenceLedger.js';

export type GrilloProjectedClaim = {
  claimId: string;
  confidence: number;
  effectiveValue: GrilloMemoryClaim['value'];
  evidenceIds: string[];
  kind: GrilloMemoryClaim['kind'];
  participantKey: string | null;
  predicate: string;
  status: 'active' | 'corrected';
  subject: string;
  validFrom: number;
  validTo: number | null;
};

export type GrilloProjectedSlot = {
  current: GrilloProjectedClaim;
  predicate: string;
  subject: string;
};

export type GrilloProjectionTimelineEvent = {
  createdAt: number;
  evidenceIds: string[];
  id: string;
  operation: string;
  recordId: string;
  targetIds: string[];
  type: 'claim' | 'correction' | 'decision' | 'evidence';
};

export type GrilloLedgerProjection = {
  schemaVersion: '1.0.0';
  scopeKey: string;
  asOf: number;
  generation: string;
  beliefs: GrilloProjectedClaim[];
  relationships: GrilloProjectedClaim[];
  slots: GrilloProjectedSlot[];
  timeline: GrilloProjectionTimelineEvent[];
  provenance: {
    claimIds: string[];
    correctionIds: string[];
    decisionIds: string[];
    evidenceIds: string[];
    integrityIssues: string[];
    invalidRecordIds: string[];
  };
};

export function buildGrilloLedgerProjection(replay: GrilloLedgerReplay): GrilloLedgerProjection {
  const current = replay.activeClaims.map(projectClaim).sort(compareProjectedClaims);
  const beliefs = current.filter((claim) => claim.kind !== 'relationship');
  const relationships = current.filter((claim) => claim.kind === 'relationship');
  const slots = current
    .map((claim) => ({
      current: claim,
      predicate: claim.predicate,
      subject: claim.subject,
    }))
    .sort((left, right) =>
      left.subject.localeCompare(right.subject) || left.predicate.localeCompare(right.predicate),
    );
  const timeline = buildTimeline(replay);
  const provenance = {
    claimIds: replay.claims.map((record) => record.id).sort(),
    correctionIds: replay.corrections.map((record) => record.id).sort(),
    decisionIds: replay.decisions.map((record) => record.id).sort(),
    evidenceIds: replay.evidence.map((record) => record.id).sort(),
    integrityIssues: [...replay.integrityIssues].sort(),
    invalidRecordIds: [...replay.invalidRecordIds].sort(),
  };
  const base = {
    schemaVersion: '1.0.0' as const,
    scopeKey: replay.scopeKey,
    asOf: timeline.reduce((latest, event) => Math.max(latest, event.createdAt), 0),
    beliefs,
    relationships,
    slots,
    timeline,
    provenance,
  };
  return {
    ...base,
    generation: createHash('sha256').update(stableJson(base)).digest('hex'),
  };
}

function projectClaim(state: GrilloClaimState): GrilloProjectedClaim {
  return {
    claimId: state.claim.id,
    confidence: state.claim.confidence,
    effectiveValue: state.effectiveValue,
    evidenceIds: [...state.claim.evidenceIds],
    kind: state.claim.kind,
    participantKey: state.claim.participantKey ?? null,
    predicate: state.claim.predicate,
    status: state.status === 'corrected' ? 'corrected' : 'active',
    subject: state.claim.subject,
    validFrom: state.claim.validFrom,
    validTo: state.validTo,
  };
}

function compareProjectedClaims(left: GrilloProjectedClaim, right: GrilloProjectedClaim) {
  return (
    left.subject.localeCompare(right.subject) ||
    left.predicate.localeCompare(right.predicate) ||
    left.validFrom - right.validFrom ||
    left.claimId.localeCompare(right.claimId)
  );
}

function buildTimeline(replay: GrilloLedgerReplay) {
  const events: GrilloProjectionTimelineEvent[] = [
    ...replay.evidence.map((record) => ({
      createdAt: record.createdAt,
      evidenceIds: [record.id],
      id: `evidence:${record.id}`,
      operation: 'OBSERVE',
      recordId: record.id,
      targetIds: [],
      type: 'evidence' as const,
    })),
    ...replay.claims.map((record) => ({
      createdAt: record.createdAt,
      evidenceIds: [...record.evidenceIds],
      id: `claim:${record.id}`,
      operation: record.operation,
      recordId: record.id,
      targetIds: [...record.supersedesRecordIds],
      type: 'claim' as const,
    })),
    ...replay.corrections.map((record) => ({
      createdAt: record.createdAt,
      evidenceIds: [...record.evidenceIds],
      id: `correction:${record.id}`,
      operation: 'CORRECT',
      recordId: record.id,
      targetIds: [record.targetClaimId],
      type: 'correction' as const,
    })),
    ...replay.decisions.map((record) => ({
      createdAt: record.createdAt,
      evidenceIds: [...record.evidenceIds],
      id: `decision:${record.id}`,
      operation: `${record.operation}:${record.outcome}`,
      recordId: record.id,
      targetIds: [record.targetId],
      type: 'decision' as const,
    })),
  ];
  return events.sort(
    (left, right) =>
      left.createdAt - right.createdAt ||
      timelineTypeOrder(left.type) - timelineTypeOrder(right.type) ||
      left.id.localeCompare(right.id),
  );
}

function timelineTypeOrder(type: GrilloProjectionTimelineEvent['type']) {
  if (type === 'evidence') return 0;
  if (type === 'claim') return 1;
  if (type === 'correction') return 2;
  return 3;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`;
}
