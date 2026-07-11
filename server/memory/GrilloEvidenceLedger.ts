import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import type {
  LadybugGrilloRecordEntity,
  LadybugMemoryService,
} from './LadybugMemoryService.js';

const idSchema = z.string().trim().min(1).max(240);
const scopeKeySchema = z.string().trim().min(1).max(180);
const jsonValueSchema = z.json();

const evidenceRecordSchema = z.object({
  id: idSchema,
  scopeKey: scopeKeySchema,
  participantKey: z.string().trim().max(180).optional(),
  kind: z.enum(['turn', 'observation', 'feedback', 'correction', 'external']),
  role: z.enum(['user', 'assistant', 'system', 'tool', 'worker']),
  content: z.string().trim().min(1).max(100_000),
  source: z.string().trim().min(1).max(120),
  sourceRecordIds: z.array(idSchema).max(100).default([]),
  metadata: z.record(z.string(), jsonValueSchema).default({}),
  createdAt: z.number().int().nonnegative(),
});

const memoryClaimSchema = z.object({
  id: idSchema,
  scopeKey: scopeKeySchema,
  participantKey: z.string().trim().max(180).optional(),
  kind: z.enum(['fact', 'preference', 'opinion', 'relationship', 'decision']),
  subject: z.string().trim().min(1).max(500),
  predicate: z.string().trim().min(1).max(240),
  value: jsonValueSchema,
  confidence: z.number().min(0).max(1),
  validFrom: z.number().int().nonnegative(),
  validTo: z.number().int().nonnegative().nullable().default(null),
  evidenceIds: z.array(idSchema).min(1).max(100),
  supersedesRecordIds: z.array(idSchema).max(100).default([]),
  operation: z.enum(['ADD', 'UPDATE', 'SUPERSEDE']),
  createdAt: z.number().int().nonnegative(),
});

const memoryCorrectionSchema = z.object({
  id: idSchema,
  scopeKey: scopeKeySchema,
  participantKey: z.string().trim().max(180).optional(),
  targetClaimId: idSchema,
  correctedValue: jsonValueSchema,
  reason: z.string().trim().min(1).max(2_000),
  evidenceIds: z.array(idSchema).min(1).max(100),
  createdAt: z.number().int().nonnegative(),
});

const workerDecisionSchema = z.object({
  id: idSchema,
  scopeKey: scopeKeySchema,
  runId: idSchema,
  operation: z.enum(['ADD', 'UPDATE', 'SUPERSEDE', 'NOOP', 'REJECT', 'DEFER']),
  targetType: z.enum(['claim', 'correction']),
  targetId: idSchema,
  outcome: z.enum(['applied', 'rejected', 'deferred', 'noop']),
  evidenceIds: z.array(idSchema).max(100),
  publicReason: z.string().trim().min(1).max(2_000),
  createdAt: z.number().int().nonnegative(),
});

const claimInputSchema = memoryClaimSchema
  .omit({ id: true, createdAt: true, operation: true, validFrom: true, validTo: true })
  .extend({
    id: idSchema.optional(),
    evidenceIds: z.array(idSchema).max(100).default([]),
    operation: z.enum(['ADD', 'UPDATE', 'SUPERSEDE']).optional(),
    supersedesRecordIds: z.array(idSchema).max(100).default([]),
    validFrom: z.number().int().nonnegative().optional(),
  });

const correctionInputSchema = memoryCorrectionSchema
  .omit({ id: true, createdAt: true, evidenceIds: true })
  .extend({
    id: idSchema.optional(),
    evidenceIds: z.array(idSchema).max(100).default([]),
  });

export type GrilloEvidenceRecord = z.infer<typeof evidenceRecordSchema>;
export type GrilloMemoryClaim = z.infer<typeof memoryClaimSchema>;
export type GrilloMemoryCorrection = z.infer<typeof memoryCorrectionSchema>;
export type GrilloWorkerDecision = z.infer<typeof workerDecisionSchema>;
export type GrilloClaimInput = z.input<typeof claimInputSchema>;
export type GrilloCorrectionInput = z.input<typeof correctionInputSchema>;

export type GrilloClaimDecision = {
  claim: GrilloMemoryClaim | null;
  decision: GrilloWorkerDecision;
};

export type GrilloCorrectionDecision = {
  correction: GrilloMemoryCorrection | null;
  decision: GrilloWorkerDecision;
};

export type GrilloClaimState = {
  claim: GrilloMemoryClaim;
  effectiveValue: z.infer<typeof jsonValueSchema>;
  status: 'active' | 'corrected' | 'superseded';
  validTo: number | null;
};

export type GrilloLedgerReplay = {
  scopeKey: string;
  evidence: GrilloEvidenceRecord[];
  claims: GrilloMemoryClaim[];
  corrections: GrilloMemoryCorrection[];
  decisions: GrilloWorkerDecision[];
  claimStates: GrilloClaimState[];
  activeClaims: GrilloClaimState[];
  invalidRecordIds: string[];
};

type LedgerOptions = {
  nowMs?: () => number;
  idFactory?: (prefix: string) => string;
};

type LedgerEntity = Extract<
  LadybugGrilloRecordEntity,
  'evidence_records' | 'memory_claims' | 'memory_corrections' | 'worker_decisions'
>;

export class GrilloEvidenceLedger {
  private readonly nowMs: () => number;
  private readonly idFactory: (prefix: string) => string;
  private lastCreatedAt = 0;

  constructor(
    private readonly memory: LadybugMemoryService,
    options: LedgerOptions = {},
  ) {
    this.nowMs = options.nowMs ?? (() => Date.now());
    this.idFactory = options.idFactory ?? ((prefix) => `${prefix}:${randomUUID()}`);
  }

  async appendEvidence(
    input: Omit<GrilloEvidenceRecord, 'id' | 'createdAt' | 'sourceRecordIds' | 'metadata'> &
      Partial<Pick<GrilloEvidenceRecord, 'id' | 'createdAt' | 'sourceRecordIds' | 'metadata'>>,
  ) {
    const createdAt = input.createdAt ?? this.nextTimestamp();
    this.lastCreatedAt = Math.max(this.lastCreatedAt, createdAt);
    const record = evidenceRecordSchema.parse({
      ...input,
      id: input.id ?? this.idFactory('evidence'),
      createdAt,
      sourceRecordIds: uniqueIds(input.sourceRecordIds ?? []),
      metadata: input.metadata ?? {},
    });
    return this.appendUnique('evidence_records', record, evidenceRecordSchema);
  }

  async evaluateClaim(input: GrilloClaimInput, runId = this.idFactory('run')): Promise<GrilloClaimDecision> {
    const parsed = claimInputSchema.parse(input);
    const now = this.nextTimestamp();
    const claimId = parsed.id ?? this.idFactory('claim');
    const evidenceIds = uniqueIds(parsed.evidenceIds);
    const supersedesRecordIds = uniqueIds(parsed.supersedesRecordIds);
    const requestedOperation = parsed.operation ?? (supersedesRecordIds.length ? 'SUPERSEDE' : 'ADD');

    if (!evidenceIds.length) {
      return this.claimDecision({
        claimId,
        evidenceIds,
        operation: 'REJECT',
        outcome: 'rejected',
        publicReason: 'A durable claim requires at least one evidence record.',
        runId,
        scopeKey: parsed.scopeKey,
      });
    }

    const evidence = await this.readValid('evidence_records', evidenceRecordSchema);
    const evidenceById = new Map(
      evidence.filter((record) => record.scopeKey === parsed.scopeKey).map((record) => [record.id, record]),
    );
    const missingEvidenceIds = evidenceIds.filter((id) => !evidenceById.has(id));
    if (missingEvidenceIds.length) {
      return this.claimDecision({
        claimId,
        evidenceIds,
        operation: 'DEFER',
        outcome: 'deferred',
        publicReason: `Evidence is not available in this scope: ${missingEvidenceIds.join(', ')}`,
        runId,
        scopeKey: parsed.scopeKey,
      });
    }

    const [allClaims, allCorrections] = await Promise.all([
      this.readValid('memory_claims', memoryClaimSchema),
      this.readValid('memory_corrections', memoryCorrectionSchema),
    ]);
    const claims = allClaims.filter((record) => record.scopeKey === parsed.scopeKey);
    const supersededClaimIds = new Set(claims.flatMap((record) => record.supersedesRecordIds));
    const correctedValues = new Map<string, z.infer<typeof jsonValueSchema>>();
    for (const correction of allCorrections.filter((record) => record.scopeKey === parsed.scopeKey)) {
      correctedValues.set(correction.targetClaimId, correction.correctedValue);
    }
    const currentClaims = claims.filter((record) => !supersededClaimIds.has(record.id));
    const duplicate = currentClaims.find(
      (record) =>
        record.subject === parsed.subject &&
        record.predicate === parsed.predicate &&
        isDeepStrictEqual(correctedValues.get(record.id) ?? record.value, parsed.value),
    );
    if (duplicate) {
      return this.claimDecision({
        claimId: duplicate.id,
        evidenceIds,
        operation: 'NOOP',
        outcome: 'noop',
        publicReason: 'An equivalent evidence-backed claim already exists.',
        runId,
        scopeKey: parsed.scopeKey,
      });
    }

    if ((requestedOperation === 'UPDATE' || requestedOperation === 'SUPERSEDE') && !supersedesRecordIds.length) {
      return this.claimDecision({
        claimId,
        evidenceIds,
        operation: 'REJECT',
        outcome: 'rejected',
        publicReason: `${requestedOperation} requires at least one superseded claim ID.`,
        runId,
        scopeKey: parsed.scopeKey,
      });
    }

    if (requestedOperation === 'ADD' && supersedesRecordIds.length) {
      return this.claimDecision({
        claimId,
        evidenceIds,
        operation: 'REJECT',
        outcome: 'rejected',
        publicReason: 'ADD cannot carry superseded claim IDs; use UPDATE or SUPERSEDE.',
        runId,
        scopeKey: parsed.scopeKey,
      });
    }

    const claimIds = new Set(claims.map((record) => record.id));
    const missingClaimIds = supersedesRecordIds.filter((id) => !claimIds.has(id));
    if (missingClaimIds.length) {
      return this.claimDecision({
        claimId,
        evidenceIds,
        operation: 'DEFER',
        outcome: 'deferred',
        publicReason: `Superseded claims are not available in this scope: ${missingClaimIds.join(', ')}`,
        runId,
        scopeKey: parsed.scopeKey,
      });
    }

    const supersededClaims = claims.filter((record) => supersedesRecordIds.includes(record.id));
    const incompatibleClaimIds = supersededClaims
      .filter(
        (record) => record.subject !== parsed.subject || record.predicate !== parsed.predicate,
      )
      .map((record) => record.id);
    if (incompatibleClaimIds.length) {
      return this.claimDecision({
        claimId,
        evidenceIds,
        operation: 'REJECT',
        outcome: 'rejected',
        publicReason: `A claim can only supersede the same subject and predicate: ${incompatibleClaimIds.join(', ')}`,
        runId,
        scopeKey: parsed.scopeKey,
      });
    }

    const conflictingCurrentClaims = currentClaims.filter(
      (record) => record.subject === parsed.subject && record.predicate === parsed.predicate,
    );
    if (!supersedesRecordIds.length && conflictingCurrentClaims.length) {
      return this.claimDecision({
        claimId,
        evidenceIds,
        operation: 'DEFER',
        outcome: 'deferred',
        publicReason: `A current claim already exists; explicitly supersede it: ${conflictingCurrentClaims.map((record) => record.id).join(', ')}`,
        runId,
        scopeKey: parsed.scopeKey,
      });
    }

    const claim = memoryClaimSchema.parse({
      ...parsed,
      id: claimId,
      operation: requestedOperation,
      evidenceIds,
      supersedesRecordIds,
      validFrom: parsed.validFrom ?? now,
      validTo: null,
      createdAt: now,
    });
    const storedClaim = await this.appendUnique('memory_claims', claim, memoryClaimSchema);
    const result = await this.claimDecision({
      claimId: storedClaim.id,
      evidenceIds,
      operation: requestedOperation,
      outcome: 'applied',
      publicReason: 'Claim accepted with in-scope evidence.',
      runId,
      scopeKey: parsed.scopeKey,
    });
    return { claim: storedClaim, decision: result.decision };
  }

  async recordCorrection(
    input: GrilloCorrectionInput,
    runId = this.idFactory('run'),
  ): Promise<GrilloCorrectionDecision> {
    const parsed = correctionInputSchema.parse(input);
    const correctionId = parsed.id ?? this.idFactory('correction');
    const evidenceIds = uniqueIds(parsed.evidenceIds);
    if (!evidenceIds.length) {
      return this.correctionDecision({
        correctionId,
        evidenceIds,
        operation: 'REJECT',
        outcome: 'rejected',
        publicReason: 'A correction requires evidence.',
        runId,
        scopeKey: parsed.scopeKey,
      });
    }

    const [evidence, claims] = await Promise.all([
      this.readValid('evidence_records', evidenceRecordSchema),
      this.readValid('memory_claims', memoryClaimSchema),
    ]);
    const knownEvidence = new Set(
      evidence.filter((record) => record.scopeKey === parsed.scopeKey).map((record) => record.id),
    );
    const missingEvidenceIds = evidenceIds.filter((id) => !knownEvidence.has(id));
    const targetExists = claims.some(
      (record) => record.scopeKey === parsed.scopeKey && record.id === parsed.targetClaimId,
    );
    if (missingEvidenceIds.length || !targetExists) {
      return this.correctionDecision({
        correctionId,
        evidenceIds,
        operation: 'DEFER',
        outcome: 'deferred',
        publicReason: missingEvidenceIds.length
          ? `Correction evidence is not available in this scope: ${missingEvidenceIds.join(', ')}`
          : `Target claim is not available in this scope: ${parsed.targetClaimId}`,
        runId,
        scopeKey: parsed.scopeKey,
      });
    }

    const correction = memoryCorrectionSchema.parse({
      ...parsed,
      id: correctionId,
      evidenceIds,
      createdAt: this.nextTimestamp(),
    });
    const storedCorrection = await this.appendUnique(
      'memory_corrections',
      correction,
      memoryCorrectionSchema,
    );
    const result = await this.correctionDecision({
      correctionId: storedCorrection.id,
      evidenceIds,
      operation: 'UPDATE',
      outcome: 'applied',
      publicReason: 'Correction accepted with in-scope evidence.',
      runId,
      scopeKey: parsed.scopeKey,
    });
    return { correction: storedCorrection, decision: result.decision };
  }

  async replay(scopeKey: string): Promise<GrilloLedgerReplay> {
    const normalizedScopeKey = scopeKeySchema.parse(scopeKey);
    const [evidenceResult, claimsResult, correctionsResult, decisionsResult] = await Promise.all([
      this.readValidWithInvalid('evidence_records', evidenceRecordSchema),
      this.readValidWithInvalid('memory_claims', memoryClaimSchema),
      this.readValidWithInvalid('memory_corrections', memoryCorrectionSchema),
      this.readValidWithInvalid('worker_decisions', workerDecisionSchema),
    ]);
    const evidence = sortedForScope(evidenceResult.valid, normalizedScopeKey);
    const claims = sortedForScope(claimsResult.valid, normalizedScopeKey);
    const corrections = sortedForScope(correctionsResult.valid, normalizedScopeKey);
    const decisions = sortedForScope(decisionsResult.valid, normalizedScopeKey);
    const states = new Map<string, GrilloClaimState>();

    for (const claim of claims) {
      states.set(claim.id, {
        claim,
        effectiveValue: claim.value,
        status: 'active',
        validTo: claim.validTo,
      });
      for (const supersededId of claim.supersedesRecordIds) {
        const previous = states.get(supersededId);
        if (previous) {
          states.set(supersededId, {
            ...previous,
            status: 'superseded',
            validTo: claim.validFrom,
          });
        }
      }
    }
    for (const correction of corrections) {
      const previous = states.get(correction.targetClaimId);
      if (previous && previous.status !== 'superseded') {
        states.set(correction.targetClaimId, {
          ...previous,
          effectiveValue: correction.correctedValue,
          status: 'corrected',
          validTo: correction.createdAt,
        });
      }
    }

    const claimStates = [...states.values()];
    return {
      scopeKey: normalizedScopeKey,
      evidence,
      claims,
      corrections,
      decisions,
      claimStates,
      activeClaims: claimStates.filter((state) => state.status !== 'superseded'),
      invalidRecordIds: uniqueIds([
        ...evidenceResult.invalidIds,
        ...claimsResult.invalidIds,
        ...correctionsResult.invalidIds,
        ...decisionsResult.invalidIds,
      ]),
    };
  }

  private async claimDecision(
    input: Omit<
      GrilloWorkerDecision,
      'id' | 'targetType' | 'targetId' | 'createdAt'
    > & { claimId: string },
  ): Promise<GrilloClaimDecision> {
    const decision = await this.appendDecision({
      ...input,
      targetId: input.claimId,
      targetType: 'claim',
    });
    return { claim: null, decision };
  }

  private async correctionDecision(
    input: Omit<
      GrilloWorkerDecision,
      'id' | 'targetType' | 'targetId' | 'createdAt'
    > & { correctionId: string },
  ): Promise<GrilloCorrectionDecision> {
    const decision = await this.appendDecision({
      ...input,
      targetId: input.correctionId,
      targetType: 'correction',
    });
    return { correction: null, decision };
  }

  private async appendDecision(
    input: Omit<GrilloWorkerDecision, 'id' | 'createdAt'>,
  ) {
    const decision = workerDecisionSchema.parse({
      ...input,
      id: this.idFactory('decision'),
      createdAt: this.nextTimestamp(),
    });
    return this.appendUnique('worker_decisions', decision, workerDecisionSchema);
  }

  private async appendUnique<T extends { id: string }>(
    entity: LedgerEntity,
    record: T,
    schema: z.ZodType<T>,
  ) {
    const records = await this.readValid(entity, schema);
    const existing = records.find((entry) => entry.id === record.id);
    if (existing) {
      if (isDeepStrictEqual(existing, record)) return existing;
      throw new Error(`GRILLO ledger ID conflict in ${entity}: ${record.id}`);
    }
    await this.memory.appendGrilloRecord(entity, { ...record });
    return record;
  }

  private async readValid<T>(entity: LedgerEntity, schema: z.ZodType<T>) {
    return (await this.readValidWithInvalid(entity, schema)).valid;
  }

  private async readValidWithInvalid<T>(entity: LedgerEntity, schema: z.ZodType<T>) {
    const records = await this.memory.readGrilloRecords<Record<string, unknown>>(entity);
    const valid: T[] = [];
    const invalidIds: string[] = [];
    for (const record of records) {
      const parsed = schema.safeParse(record);
      if (parsed.success) valid.push(parsed.data);
      else invalidIds.push(String(record['id'] ?? `${entity}:unknown`));
    }
    return { valid, invalidIds };
  }

  private nextTimestamp() {
    const timestamp = Math.max(this.nowMs(), this.lastCreatedAt + 1);
    this.lastCreatedAt = timestamp;
    return timestamp;
  }
}

function uniqueIds(ids: string[]) {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

function sortedForScope<T extends { id: string; scopeKey: string; createdAt: number }>(
  records: T[],
  scopeKey: string,
) {
  return records
    .filter((record) => record.scopeKey === scopeKey)
    .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id));
}
