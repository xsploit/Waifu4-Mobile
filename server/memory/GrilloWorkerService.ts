import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type {
  LadybugEmotionStateRecord,
  LadybugMemoryService,
  LadybugSemanticMemoryRecord,
  LadybugMemorySlotPatchRecord,
  LadybugMemorySlotRecord,
} from './LadybugMemoryService.js';
import {
  GrilloEvidenceLedger,
  type GrilloClaimInput,
  type GrilloLedgerReplay,
} from './GrilloEvidenceLedger.js';
import { GrilloRepairQueue, type GrilloRepairTask } from './GrilloRepairQueue.js';
import { assessGrilloMemorySufficiency } from './GrilloRetrievalController.js';
import {
  buildGrilloLedgerProjection,
  type GrilloLedgerProjection,
  type GrilloProjectedClaim,
} from './GrilloLedgerProjector.js';
import {
  executeGrilloMigrationPlan,
  type GrilloMigrationApplyInput,
  type GrilloMigrationApplyResult,
} from './GrilloMigrationExecutor.js';
import { buildGrilloMigrationPlan } from './GrilloMigrationPlan.js';
import {
  auditGrilloProjectionCoverage,
} from './GrilloProjectionAudit.js';
import { buildGrilloShadowComparison } from './GrilloShadowComparison.js';
import type {
  GrilloContextPacket,
  GrilloContextProvenanceReceipt,
  GrilloEmbeddingIdentity,
  GrilloProvenanceDrop,
  GrilloRecallItem,
} from '../../src/shared/grilloContext.js';
import type {
  ChatProviderMessage,
  ChatProviderResponseFormat,
} from '../ai/ChatProvider.js';

export type GrilloTurnIngestInput = {
  assistantName?: unknown;
  assistantText?: unknown;
  authorName?: unknown;
  channelId?: unknown;
  createdAt?: unknown;
  interfacePath?: unknown;
  participantKey?: unknown;
  scopeKey?: unknown;
  source?: unknown;
  userText?: unknown;
};

export type GrilloManualRunInput = {
  beatType?: unknown;
  candidate?: unknown;
  diary?: unknown;
  participantKey?: unknown;
  responseText?: unknown;
  scopeKey?: unknown;
  slot?: unknown;
  trace?: unknown;
};

export type GrilloManualRunResult = {
  activityId: string;
  beatType: string;
  candidateIds: string[];
  diaryIds: string[];
  slotIds: string[];
  traceId: string;
  writes: number;
};

export type GrilloMemoryFeedbackInput = {
  content?: unknown;
  participantKey?: unknown;
  scopeKey?: unknown;
  source?: unknown;
};

export type GrilloMemoryCorrectionInput = GrilloMemoryFeedbackInput & {
  correctedValue?: unknown;
  reason?: unknown;
  targetClaimId?: unknown;
};

export type GrilloContextPacketInput = {
  embeddingModel?: unknown;
  embeddingProvider?: unknown;
  embeddingVersion?: unknown;
  includeProvenanceReceipt?: unknown;
  participantKeys?: unknown;
  query?: unknown;
  queryEmbedding?: unknown;
  scopeKey?: unknown;
};

export type { GrilloContextPacket } from '../../src/shared/grilloContext.js';

type GrilloWorkerToolName =
  | 'core.worker_memory_read'
  | 'core.worker_memory_search'
  | 'core.worker_candidate_list'
  | 'core.worker_candidate_write'
  | 'core.worker_claim_propose'
  | 'core.worker_diary_write'
  | 'core.worker_memory_write'
  | 'core.worker_profile_patch'
  | 'core.worker_emotion_read'
  | 'core.worker_emotion_update'
  | 'core.worker_repair_list'
  | 'core.worker_repair_transition'
  | 'core.worker_memory_insert_archival';

export type GrilloWorkerToolInput = {
  args?: unknown;
  name?: unknown;
  participantKey?: unknown;
  scopeKey?: unknown;
};

export type GrilloWorkerToolExecution = {
  durationMs: number;
  error?: string;
  name: string;
  ok: boolean;
  result: unknown;
  telemetryId: string;
};

export type GrilloWorkerRuntimeOptions = {
  enabled?: unknown;
  intervalMs?: unknown;
};

export type GrilloWorkerTickInput = {
  beatType?: unknown;
  reason?: unknown;
  scopeKey?: unknown;
};

export type GrilloWorkerCompletionRequest = {
  disableState: true;
  maxTokens: number;
  maxToolRounds: number;
  messages: ChatProviderMessage[];
  responseFormat: ChatProviderResponseFormat;
  stateKey: string;
  stateScope: 'memory';
  temperature: number;
  toolChoiceMode: 'auto';
};

export type GrilloWorkerCompletionResult = {
  meta?: Record<string, unknown> | null;
  text: string;
};

export type GrilloWorkerCompletion = (
  request: GrilloWorkerCompletionRequest,
) => Promise<GrilloWorkerCompletionResult | string>;

export type GrilloWorkerEmbeddingRequest = {
  input: string;
  model?: unknown;
  provider?: unknown;
};

export type GrilloWorkerEmbeddingResult =
  | {
      embedding?: number[] | null;
      model?: unknown;
      provider?: unknown;
    }
  | number[]
  | null;

export type GrilloWorkerEmbedding = (
  request: GrilloWorkerEmbeddingRequest,
) => Promise<GrilloWorkerEmbeddingResult>;

export type GrilloWorkerTickOptions = {
  completion?: GrilloWorkerCompletion;
  embedding?: GrilloWorkerEmbedding;
  embeddingModel?: unknown;
  embeddingProvider?: unknown;
  maxRounds?: unknown;
  maxToolRounds?: unknown;
  model?: unknown;
  provider?: unknown;
};

type GrilloWorkerTickResult = {
  beatType: string;
  durationMs: number;
  noOpReason: string;
  ok: boolean;
  reason: string;
  running: boolean;
  scopeKey: string;
  tickId: string;
  writes: number;
};

type GrilloWorkerRuntimeState = {
  enabled: boolean;
  lastBeatType: string;
  intervalMs: number;
  lastNoOpReason: string;
  lastTickAt: number;
  lastTickDurationMs: number;
  lastTickId: string;
  lastTickReason: string;
  lastToolCalls: number;
  running: boolean;
  started: boolean;
  startedAt: number;
};

type GrilloWorkerTickTask = (input: {
  reason: string;
  scopeKey: string;
}) => Promise<GrilloWorkerTaskResult>;

type GrilloWorkerTaskResult = {
  beatType?: string;
  noOpReason?: string;
  statePatch?: Record<string, unknown>;
  toolCalls?: number;
  writes?: number;
};

export class GrilloWorkerService {
  private readonly evidenceLedger: GrilloEvidenceLedger;
  private readonly repairQueue: GrilloRepairQueue;
  private readonly migrationQueues = new Map<string, Promise<void>>();
  private readonly quarantineSignatures = new Map<string, string>();
  private readonly projectionCache = new WeakMap<GrilloLedgerReplay, GrilloLedgerProjection>();
  private activeTickPromise: Promise<GrilloWorkerTickResult> | null = null;
  private runtime: GrilloWorkerRuntimeState = {
    enabled: false,
    lastBeatType: '',
    intervalMs: 60_000,
    lastNoOpReason: 'not_started',
    lastTickAt: 0,
    lastTickDurationMs: 0,
    lastTickId: '',
    lastTickReason: '',
    lastToolCalls: 0,
    running: false,
    started: false,
    startedAt: 0,
  };
  private tickTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly memory: LadybugMemoryService,
    private readonly nowMs: () => number = () => Date.now(),
    private readonly idFactory: () => string = () => randomUUID(),
    private readonly tickTask?: GrilloWorkerTickTask,
  ) {
    this.evidenceLedger = new GrilloEvidenceLedger(memory, {
      nowMs,
      idFactory: () => idFactory(),
    });
    this.repairQueue = new GrilloRepairQueue(memory, { nowMs, idFactory });
  }

  start(options: GrilloWorkerRuntimeOptions = {}) {
    const intervalMs = clampInteger(options.intervalMs, 5_000, 60 * 60 * 1000, this.runtime.intervalMs);
    const enabled = options.enabled === true;
    if (!this.runtime.started) {
      this.runtime.startedAt = this.nowMs();
    }
    this.runtime = {
      ...this.runtime,
      enabled,
      intervalMs,
      lastNoOpReason: enabled ? this.runtime.lastNoOpReason : 'disabled',
      started: true,
    };
    this.resetTimer();
    return this.getRuntimeStatus();
  }

  stop() {
    this.resetTimer();
    this.runtime = {
      ...this.runtime,
      enabled: false,
      lastNoOpReason: 'stopped',
      running: Boolean(this.activeTickPromise),
      started: false,
    };
    return this.getRuntimeStatus();
  }

  getRuntimeStatus() {
    return {
      ...this.runtime,
      running: Boolean(this.activeTickPromise),
    };
  }

  getEvidenceLedgerReplay(scopeKey: unknown) {
    return this.evidenceLedger.replay(normalizeKey(scopeKey, 'local:persona:default'));
  }

  async getEvidenceLedgerProjection(scopeKey: unknown) {
    return this.projectLedgerReplay(await this.getEvidenceLedgerReplay(scopeKey));
  }

  async getEvidenceProjectionCoverage(scopeKey: unknown) {
    const normalizedScopeKey = normalizeKey(scopeKey, 'local:persona:default');
    const [projection, memoryBlocks, memorySlots, relationshipProfiles] = await Promise.all([
      this.getEvidenceLedgerProjection(normalizedScopeKey),
      this.memory.readGrilloRecords<Record<string, unknown>>('memory_blocks'),
      this.memory.readGrilloRecords<Record<string, unknown>>('memory_slots'),
      this.memory.loadRelationshipProfiles(),
    ]);
    return auditGrilloProjectionCoverage(projection, {
      memoryBlocks,
      memorySlots,
      relationshipProfile: asRecord(asRecord(relationshipProfiles)[normalizedScopeKey]),
      scopeKey: normalizedScopeKey,
    });
  }

  /**
   * Read-only shadow report comparing the legacy relationship-memory prompt
   * lane against the ledger projection. Never mutates memory and is not part
   * of live prompt injection.
   */
  // fallow-ignore-next-line unused-class-member
  async getPromptShadowComparison(scopeKey: unknown, participantKeys?: unknown) {
    const normalizedScopeKey = normalizeKey(scopeKey, 'local:persona:default');
    const [replay, turnEvents, memoryBlocks, memorySlots, relationshipProfiles] =
      await Promise.all([
        this.evidenceLedger.replay(normalizedScopeKey),
        this.memory.readGrilloRecords<Record<string, unknown>>('turn_events'),
        this.memory.readGrilloRecords<Record<string, unknown>>('memory_blocks'),
        this.memory.readGrilloRecords<Record<string, unknown>>('memory_slots'),
        this.memory.loadRelationshipProfiles(),
      ]);
    return buildGrilloShadowComparison({
      generatedAt: this.nowMs(),
      memoryBlocks,
      memorySlots,
      relationshipProfile: asRecord(asRecord(relationshipProfiles)[normalizedScopeKey]),
      replay,
      scopeKey: normalizedScopeKey,
      turnEvents,
      participantKeys: readStringArray(participantKeys),
    });
  }

  /** Read-only plan. It does not backfill evidence or write claims. */
  async getEvidenceMigrationPlan(scopeKey: unknown) {
    const normalizedScopeKey = normalizeKey(scopeKey, 'local:persona:default');
    const [replay, turnEvents, relationshipProfiles] = await Promise.all([
      this.evidenceLedger.replay(normalizedScopeKey),
      this.memory.readGrilloRecords<Record<string, unknown>>('turn_events'),
      this.memory.loadRelationshipProfiles(),
    ]);
    return buildGrilloMigrationPlan({
      relationshipProfile: asRecord(asRecord(relationshipProfiles)[normalizedScopeKey]),
      replay,
      scopeKey: normalizedScopeKey,
      turnEvents,
    });
  }

  applyEvidenceMigration(
    scopeKey: unknown,
    input: GrilloMigrationApplyInput,
  ): Promise<GrilloMigrationApplyResult> {
    const normalizedScopeKey = normalizeKey(scopeKey, 'local:persona:default');
    return this.withMigrationQueue(normalizedScopeKey, async () => {
      const plan = await this.getEvidenceMigrationPlan(normalizedScopeKey);
      return executeGrilloMigrationPlan(plan, input, {
        appendEvidence: (record) => this.evidenceLedger.appendEvidence(record),
        appendReceipt: (receipt) => this.memory.appendGrilloRecord('migration_receipts', receipt),
        idFactory: this.idFactory,
        nowMs: this.nowMs,
      });
    });
  }

  runTick(input: GrilloWorkerTickInput = {}) {
    return this.runTickWithOptions(input);
  }

  runTickWithOptions(input: GrilloWorkerTickInput = {}, options: GrilloWorkerTickOptions = {}) {
    if (this.activeTickPromise) {
      const scopeKey = normalizeKey(input.scopeKey, 'local:persona:default');
      const reason = normalizeText(input.reason) || 'manual';
      const beatType = normalizeWorkerBeatType(input.beatType);
      return Promise.resolve({
        beatType,
        durationMs: 0,
        noOpReason: 'tick_already_running',
        ok: true,
        reason,
        running: true,
        scopeKey,
        tickId: '',
        writes: 0,
      } satisfies GrilloWorkerTickResult);
    }
    this.activeTickPromise = this.runTickNow(input, options).finally(() => {
      this.activeTickPromise = null;
      this.runtime.running = false;
    });
    this.runtime.running = true;
    return this.activeTickPromise;
  }

  async ingestTurnPair(input: GrilloTurnIngestInput) {
    const scopeKey = normalizeKey(input.scopeKey, 'local:persona:default');
    const participantKey = normalizeKey(input.participantKey, '');
    const channelId = normalizeKey(input.channelId, inferChannel(scopeKey));
    const source = normalizeKey(input.source, inferSource(scopeKey));
    const interfacePath = normalizeKey(input.interfacePath, `${source}/${channelId}`);
    const createdAt = numberOrNow(input.createdAt, this.nowMs);
    const writtenTurnIds: string[] = [];

    const userText = normalizeText(input.userText);
    if (userText) {
      const turnId = this.idFactory();
      await this.memory.appendGrilloRecord('turn_events', {
        author_name: normalizeText(input.authorName) || 'User',
        channel_id: channelId,
        content: userText,
        created_at: createdAt,
        interface_path: interfacePath,
        participant_key: participantKey,
        role: 'user',
        scope_key: scopeKey,
        source,
        turn_id: turnId,
        user_id: scopeKey,
      });
      await this.evidenceLedger.appendEvidence({
        id: turnId,
        content: userText,
        createdAt,
        kind: 'turn',
        metadata: {
          authorName: normalizeText(input.authorName) || 'User',
          channelId,
          interfacePath,
        },
        participantKey: participantKey || undefined,
        role: 'user',
        scopeKey,
        source,
        sourceRecordIds: [turnId],
      });
      writtenTurnIds.push(turnId);
    }

    const assistantText = normalizeText(input.assistantText);
    if (assistantText) {
      const turnId = this.idFactory();
      await this.memory.appendGrilloRecord('turn_events', {
        author_name: normalizeText(input.assistantName) || 'Assistant',
        channel_id: channelId,
        content: assistantText,
        created_at: createdAt + 1,
        interface_path: interfacePath,
        role: 'assistant',
        scope_key: scopeKey,
        source,
        turn_id: turnId,
        user_id: scopeKey,
      });
      await this.evidenceLedger.appendEvidence({
        id: turnId,
        content: assistantText,
        createdAt: createdAt + 1,
        kind: 'turn',
        metadata: {
          authorName: normalizeText(input.assistantName) || 'Assistant',
          channelId,
          interfacePath,
        },
        participantKey: participantKey || undefined,
        role: 'assistant',
        scopeKey,
        source,
        sourceRecordIds: [turnId],
      });
      writtenTurnIds.push(turnId);
    }

    return {
      scopeKey,
      turnIds: writtenTurnIds,
      writes: writtenTurnIds.length,
    };
  }

  async runManualExtraction(input: GrilloManualRunInput): Promise<GrilloManualRunResult> {
    const scopeKey = normalizeKey(input.scopeKey, 'local:persona:default');
    const participantKey = normalizeKey(input.participantKey, '');
    const beatType = normalizeKey(input.beatType, 'extraction');
    const createdAt = this.nowMs();
    const candidateIds: string[] = [];
    const diaryIds: string[] = [];
    const slotIds: string[] = [];
    let writes = 0;

    const trace = asRecord(input.trace);
    const traceId = this.idFactory();
    await this.memory.appendGrilloRecord('worker_context_traces', {
      beat_type: beatType,
      created_at: createdAt,
      model: normalizeText(trace['model']),
      prompt: normalizeText(trace['prompt']),
      provider: normalizeText(trace['provider']),
      scope_key: scopeKey,
      system_prompt: normalizeText(trace['systemPrompt'] ?? trace['system_prompt']),
      task_type: 'manual_extraction',
      trace_id: traceId,
      user_id: scopeKey,
    });

    const candidate = asRecord(input.candidate);
    const candidateContent = normalizeText(candidate['content']);
    const candidateSummary = normalizeText(candidate['summary']);
    if (candidateContent && candidateSummary) {
      const candidateId = this.idFactory();
      await this.memory.appendGrilloRecord('memory_candidates', {
        candidate_id: candidateId,
        confidence: clampNumber(candidate['confidence'], 0, 1, 0.7),
        content: candidateContent,
        created_at: createdAt + 1,
        evidence_turn_ids: readStringArray(candidate['sourceTurnIds'] ?? candidate['source_turn_ids']),
        participant_key: participantKey,
        scope_key: scopeKey,
        source: normalizeText(candidate['source']) || 'manual',
        summary: candidateSummary,
        tags: readStringArray(candidate['tags']),
        type: normalizeCandidateType(candidate['type']),
        user_id: scopeKey,
      });
      candidateIds.push(candidateId);
      writes += 1;
    }

    const diary = asRecord(input.diary);
    const diarySummary = normalizeText(diary['summary']);
    const personalThought = normalizeText(diary['personalThought'] ?? diary['personal_thought']);
    if (diarySummary && personalThought) {
      const diaryId = this.idFactory();
      await this.memory.appendGrilloRecord('diary_entries', {
        beat_type: normalizeText(diary['beatType'] ?? diary['beat_type']) || beatType,
        created_at: createdAt + 2,
        diary_id: diaryId,
        interaction_summary: normalizeText(diary['interactionSummary'] ?? diary['interaction_summary']),
        participant_key: participantKey,
        personal_thought: personalThought,
        scope_key: scopeKey,
        source_turn_ids: readStringArray(diary['sourceTurnIds'] ?? diary['source_turn_ids']),
        summary: diarySummary,
        tags: readStringArray(diary['tags']),
        user_id: scopeKey,
      });
      diaryIds.push(diaryId);
      writes += 1;
    }

    const slot = asRecord(input.slot);
    const slotName = normalizeText(slot['slotName'] ?? slot['slot_name']);
    const slotItems = readStringArray(slot['items']);
    if (slotName && slotItems.length > 0) {
      const slotId = normalizeText(slot['slotId'] ?? slot['slot_id']) || `${scopeKey}:${slotName}`;
      const sourceCandidateIds = readStringArray(
        slot['sourceCandidateIds'] ?? slot['source_candidate_ids'],
      );
      const slotRecord: LadybugMemorySlotRecord & {
        participant_key: string;
        scope_key: string;
      } = {
        content_json: JSON.stringify(slotItems),
        participant_key: participantKey,
        schema_version: '1.0.0',
        slot_id: slotId,
        slot_name: slotName,
        scope_key: scopeKey,
        source_candidate_ids_json: JSON.stringify(sourceCandidateIds),
        updated_at: String(createdAt + 3),
        user_id: scopeKey,
      };
      await this.memory.upsertGrilloMemorySlot(slotRecord);

      const patchRecord: LadybugMemorySlotPatchRecord & {
        participant_key: string;
        scope_key: string;
      } = {
        created_at: String(createdAt + 3),
        operation: normalizeSlotOperation(slot['operation']),
        participant_key: participantKey,
        patch_id: this.idFactory(),
        patch_json: JSON.stringify({ items: slotItems }),
        schema_version: '1.0.0',
        slot_id: slotId,
        slot_name: slotName,
        scope_key: scopeKey,
        source_candidate_ids_json: JSON.stringify(sourceCandidateIds),
        user_id: scopeKey,
      };
      await this.memory.appendGrilloMemorySlotPatch(patchRecord);
      slotIds.push(slotId);
      writes += 1;
    }

    const activityId = this.idFactory();
    await this.memory.appendGrilloRecord('grillo_activity_log', {
      activity_id: activityId,
      beat_type: beatType,
      created_at: createdAt + 4,
      response_text:
        normalizeText(input.responseText) ||
        (writes > 0 ? `Manual extraction wrote ${writes} memory update(s).` : 'Manual extraction found no writes.'),
      scope_key: scopeKey,
      user_id: scopeKey,
    });

    return {
      activityId,
      beatType,
      candidateIds,
      diaryIds,
      slotIds,
      traceId,
      writes,
    };
  }

  async runWorkerTool(input: GrilloWorkerToolInput): Promise<GrilloWorkerToolExecution> {
    const name = normalizeText(input.name);
    const args = asRecord(input.args);
    const scopeKey = normalizeKey(input.scopeKey, 'local:persona:default');
    const participantKey = normalizeKey(input.participantKey, defaultParticipantKey(scopeKey));
    const startedAt = this.nowMs();
    const telemetryId = this.idFactory();

    try {
      if (!isWorkerToolName(name)) {
        throw new Error(`Unsupported GRILLO worker tool: ${name || 'unknown'}`);
      }
      const result = await this.executeWorkerTool(name, scopeKey, participantKey, args);
      const durationMs = Math.max(0, this.nowMs() - startedAt);
      await this.appendWorkerToolTelemetry({
        args,
        durationMs,
        error: '',
        name,
        ok: true,
        result,
        scopeKey,
        telemetryId,
      });
      return { durationMs, name, ok: true, result, telemetryId };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const durationMs = Math.max(0, this.nowMs() - startedAt);
      const result = { ok: false, error: message };
      await this.appendWorkerToolTelemetry({
        args,
        durationMs,
        error: message,
        name,
        ok: false,
        result,
        scopeKey,
        telemetryId,
      });
      return { durationMs, error: message, name, ok: false, result, telemetryId };
    }
  }

  private resetTimer() {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    if (this.runtime.started && this.runtime.enabled) {
      this.tickTimer = setInterval(() => {
        void this.runTick({ reason: 'interval' });
      }, this.runtime.intervalMs);
      this.tickTimer.unref?.();
    }
  }

  private async runTickNow(
    input: GrilloWorkerTickInput,
    options: GrilloWorkerTickOptions = {},
  ): Promise<GrilloWorkerTickResult> {
    const scopeKey = normalizeKey(input.scopeKey, 'local:persona:default');
    const reason = normalizeText(input.reason) || 'manual';
    const beatType = normalizeWorkerBeatType(input.beatType);
    const startedAt = this.nowMs();
    const tickId = this.idFactory();
    const taskResult = await (this.tickTask
      ? this.tickTask({ reason, scopeKey })
      : beatType === 'extraction'
        ? this.runExtractionTick({ reason, scopeKey }, options)
        : beatType === 'semantic_indexing'
          ? this.runSemanticIndexingTick({ reason, scopeKey }, options)
          : this.runMemoryBeatTick({ beatType, reason, scopeKey }, options));
    const writes = clampInteger(taskResult.writes, 0, 100_000, 0);
    const taskBeatType = normalizeWorkerBeatType(taskResult.beatType ?? beatType);
    const toolCalls = clampInteger(taskResult.toolCalls, 0, 100_000, 0);
    const noOpReason = writes > 0 ? '' : normalizeText(taskResult.noOpReason) || 'no_writes';
    const durationMs = Math.max(0, this.nowMs() - startedAt);
    this.runtime = {
      ...this.runtime,
      lastBeatType: taskBeatType,
      lastNoOpReason: noOpReason,
      lastTickAt: this.nowMs(),
      lastTickDurationMs: durationMs,
      lastTickId: tickId,
      lastTickReason: reason,
      lastToolCalls: toolCalls,
      running: true,
    };
    const previousWorkerState = asRecord(
      await this.memory.getGrilloSingleton('memory_worker_state'),
    );
    const previousScopes = asRecord(previousWorkerState['scopes']);
    const scopeState = {
      ...asRecord(previousScopes[scopeKey]),
      ...this.runtime,
      ...asRecord(taskResult.statePatch),
      lastTickId: tickId,
      scopeKey,
      updatedAt: this.nowMs(),
    };
    await this.memory.setGrilloSingleton('memory_worker_state', {
      ...this.runtime,
      ...(asRecord(taskResult.statePatch)),
      lastTickId: tickId,
      scopeKey,
      scopes: {
        ...previousScopes,
        [scopeKey]: scopeState,
      },
      updatedAt: this.nowMs(),
    });
    await this.memory.appendGrilloRecord('grillo_activity_log', {
      activity_id: tickId,
      beat_type: 'worker_tick',
      task_beat_type: taskBeatType,
      created_at: this.nowMs(),
      duration_ms: durationMs,
      no_op_reason: noOpReason,
      ok: true,
      reason,
      response_text: noOpReason
        ? `GRILLO ${taskBeatType} tick no-op: ${noOpReason}`
        : `GRILLO ${taskBeatType} tick wrote ${writes} update(s) through ${toolCalls} tool call(s).`,
      scope_key: scopeKey,
      tool_calls: toolCalls,
      user_id: scopeKey,
      writes,
    });
    return {
      beatType: taskBeatType,
      durationMs,
      noOpReason,
      ok: true,
      reason,
      running: false,
      scopeKey,
      tickId,
      writes,
    };
  }

  private async runExtractionTick(input: {
    reason: string;
    scopeKey: string;
  }, options: GrilloWorkerTickOptions = {}): Promise<GrilloWorkerTaskResult> {
    const previousState = workerScopeState(
      asRecord(await this.memory.getGrilloSingleton('memory_worker_state')),
      input.scopeKey,
    );
    const processedTurnIds = new Set(readStringArray(previousState['processedTurnIds']));
    const turns = (await this.memory.readGrilloRecords<Record<string, unknown>>('turn_events'))
      .filter((record) => recordScopeKey(record) === input.scopeKey)
      .sort((left, right) => recordTimestamp(left) - recordTimestamp(right));
    if (turns.length === 0) {
      return {
        noOpReason: 'no_turns',
        statePatch: { processedTurnIds: [] },
        writes: 0,
      };
    }

    const pairs = buildUnprocessedTurnPairs(turns, processedTurnIds).slice(0, 3);
    if (pairs.length === 0) {
      return {
        noOpReason: 'no_new_turn_pairs',
        statePatch: { processedTurnIds: [...processedTurnIds].slice(-2000) },
        writes: 0,
      };
    }

    if (options.completion) {
      return this.runLlmExtractionTick(input, pairs, processedTurnIds, options);
    }

    const traceId = this.idFactory();
    await this.memory.appendGrilloRecord('worker_context_traces', {
      beat_type: 'extraction',
      created_at: this.nowMs(),
      model: 'native-extraction',
      prompt: pairs.map(formatExtractionPairForTrace).join('\n\n'),
      provider: 'backend',
      scope_key: input.scopeKey,
      system_prompt: 'Backend GRILLO extraction processes completed user/assistant turn pairs into candidate, diary, and slot memory writes.',
      task_type: 'extraction',
      trace_id: traceId,
      user_id: input.scopeKey,
    });

    let writes = 0;
    for (const pair of pairs) {
      const participantKey = recordParticipantKey(pair.user) || defaultParticipantKey(input.scopeKey);
      const userText = normalizeText(pair.user['content'] ?? pair.user['text']);
      const assistantText = normalizeText(pair.assistant['content'] ?? pair.assistant['text']);
      const author = normalizeText(pair.user['authorName'] ?? pair.user['author_name']) || 'User';
      const summary = compactText(`${author} discussed: ${userText}`, 180);
      const content = compactText(
        `User: ${userText}\nAssistant: ${assistantText}`,
        900,
      );
      const sourceTurnIds = [recordTurnId(pair.user), recordTurnId(pair.assistant)].filter(Boolean);
      const candidate = await this.runWorkerTool({
        args: {
          confidence: 0.62,
          content,
          source_turn_ids: sourceTurnIds,
          summary,
          tags: ['extraction', inferSource(input.scopeKey)],
          type: 'thread',
        },
        name: 'core.worker_candidate_write',
        participantKey,
        scopeKey: input.scopeKey,
      });
      const candidateId = normalizeText(asRecord(candidate.result)['candidate_id']);
      await this.runWorkerTool({
        args: {
          beat_type: 'extraction',
          personal_thought: compactText(`I should remember this recent exchange with ${author}: ${userText}`, 220),
          source_turn_ids: sourceTurnIds,
          summary: compactText(`Processed a recent exchange with ${author}.`, 160),
          tags: ['extraction'],
        },
        name: 'core.worker_diary_write',
        participantKey,
        scopeKey: input.scopeKey,
      });
      await this.runWorkerTool({
        args: {
          block_name: 'open_threads',
          items: [summary],
          operation: 'merge',
          reason: 'backend extraction tick',
          source_candidate_ids: candidateId ? [candidateId] : [],
        },
        name: 'core.worker_memory_write',
        participantKey,
        scopeKey: input.scopeKey,
      });
      writes += 3;
      for (const turnId of sourceTurnIds) {
        processedTurnIds.add(turnId);
      }
    }

    return {
      statePatch: {
        lastExtractionAt: this.nowMs(),
        lastExtractionTurnCount: pairs.length,
        lastExtractionTraceId: traceId,
        processedTurnIds: [...processedTurnIds].slice(-2000),
      },
      toolCalls: writes,
      writes,
    };
  }

  private async runLlmExtractionTick(
    input: {
      reason: string;
      scopeKey: string;
    },
    pairs: Array<{ assistant: Record<string, unknown>; user: Record<string, unknown> }>,
    processedTurnIds: Set<string>,
    options: GrilloWorkerTickOptions,
  ): Promise<GrilloWorkerTaskResult> {
    const completion = options.completion;
    if (!completion) {
      return { noOpReason: 'missing_completion', writes: 0 };
    }

    const maxRounds = clampInteger(options.maxRounds, 1, 8, 4);
    const maxToolRounds = clampInteger(options.maxToolRounds, 1, 30, 15);
    const participantKey =
      pairs.map((pair) => recordParticipantKey(pair.user)).find(Boolean) ||
      defaultParticipantKey(input.scopeKey);
    const sourceTurnIds = pairs.flatMap((pair) =>
      [recordTurnId(pair.user), recordTurnId(pair.assistant)].filter(Boolean),
    );
    const systemPrompt = buildBackendWorkerSystemPrompt();
    const userPrompt = buildBackendExtractionPrompt(input.scopeKey, pairs);
    const messages: ChatProviderMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];
    let writes = 0;
    let lastTraceId = '';
    let lastProvider = normalizeText(options.provider) || 'runtime-provider';
    let lastModel = normalizeText(options.model) || 'runtime-model';
    let lastNotes = '';
    let candidateWrites = 0;
    let diaryWrites = 0;
    let recoveryAttempted = false;
    let toolCalls = 0;

    for (let round = 1; round <= maxRounds; round += 1) {
      const rawResult = await completion({
        disableState: true,
        maxTokens: 900,
        maxToolRounds,
        messages,
        responseFormat: BACKEND_GRILLO_WORKER_RESPONSE_FORMAT,
        stateKey: `memory:${input.scopeKey}`,
        stateScope: 'memory',
        temperature: 0.25,
        toolChoiceMode: 'auto',
      });
      const result =
        typeof rawResult === 'string'
          ? { text: rawResult }
          : { meta: rawResult.meta ?? null, text: rawResult.text };
      const rawText = normalizeText(result.text);
      const meta = asRecord(result.meta);
      lastProvider = normalizeText(meta['provider']) || lastProvider;
      lastModel = normalizeText(meta['model']) || lastModel;
      lastTraceId = this.idFactory();
      await this.memory.appendGrilloRecord('worker_context_traces', {
        beat_type: 'extraction',
        created_at: this.nowMs(),
        model: lastModel,
        prompt: userPrompt,
        provider: lastProvider,
        response_text: rawText,
        round,
        scope_key: input.scopeKey,
        system_prompt: systemPrompt,
        task_type: 'extraction',
        trace_id: lastTraceId,
        user_id: input.scopeKey,
      });

      const parsed = parseWorkerJson(rawText);
      lastNotes = normalizeText(parsed['notes']);
      const calls = normalizeWorkerToolCalls(parsed, sourceTurnIds);
      if (calls.length === 0) {
        if (parsed['done'] === true) {
          if (
            !recoveryAttempted &&
            shouldRunWorkerDebriefRecovery({
              candidateWrites,
              diaryWrites,
              pairs,
              writes,
            })
          ) {
            recoveryAttempted = true;
            messages.push({ role: 'assistant', content: rawText });
            messages.push({
              role: 'user',
              content: buildBackendWorkerDebriefPrompt({
                candidateWrites,
                diaryWrites,
                pairs,
                writes,
              }),
            });
            continue;
          }
          for (const turnId of sourceTurnIds) {
            processedTurnIds.add(turnId);
          }
          break;
        }
        return {
          noOpReason: writes > 0 ? undefined : 'worker_no_tool_calls',
          statePatch: {
            lastExtractionTraceId: lastTraceId,
            lastExtractionWorkerNotes: lastNotes,
            processedTurnIds: [...processedTurnIds].slice(-2000),
          },
          toolCalls,
          writes,
        };
      }

      messages.push({ role: 'assistant', content: rawText });
      for (const call of calls) {
        toolCalls += 1;
        const execution = await this.runWorkerTool({
          args: call.args,
          name: call.name,
          participantKey,
          scopeKey: input.scopeKey,
        });
        if (execution.ok) {
          writes += workerToolWriteCount(call.name, execution.result);
          candidateWrites += call.name === 'core.worker_candidate_write' ? 1 : 0;
          diaryWrites += call.name === 'core.worker_diary_write' ? 1 : 0;
        }
        messages.push({
          role: 'user',
          content: JSON.stringify({
            ok: execution.ok,
            result: execution.result,
            tool: call.name,
          }),
        });
      }
      messages.push({
        role: 'user',
        content:
          'Continue the GRILLO worker loop. Use more worker tools if needed. If complete, return JSON with done=true and toolCalls=[].',
      });
    }

    for (const turnId of sourceTurnIds) {
      processedTurnIds.add(turnId);
    }
    return {
      noOpReason: writes > 0 ? undefined : 'worker_no_writes',
      statePatch: {
        lastExtractionCandidateWrites: candidateWrites,
        lastExtractionDiaryWrites: diaryWrites,
        lastExtractionAt: this.nowMs(),
        lastExtractionModel: lastModel,
        lastExtractionProvider: lastProvider,
        lastExtractionRecoveryAttempted: recoveryAttempted,
        lastExtractionTraceId: lastTraceId,
        lastExtractionTurnCount: pairs.length,
        lastExtractionWorkerNotes: lastNotes,
        processedTurnIds: [...processedTurnIds].slice(-2000),
      },
      toolCalls,
      writes,
    };
  }

  private async runMemoryBeatTick(
    input: {
      beatType: string;
      reason: string;
      scopeKey: string;
    },
    options: GrilloWorkerTickOptions = {},
  ): Promise<GrilloWorkerTaskResult> {
    const completion = options.completion;
    if (!completion) {
      return {
        beatType: input.beatType,
        noOpReason: 'beat_requires_provider',
        writes: 0,
      };
    }

    const maxRounds = clampInteger(options.maxRounds, 1, 8, 4);
    const maxToolRounds = clampInteger(options.maxToolRounds, 1, 30, 15);
    const contextPacket = await this.buildContextPacket({ scopeKey: input.scopeKey });
    const recentTurns = (await this.memory.readGrilloRecords<Record<string, unknown>>('turn_events'))
      .filter((record) => recordScopeKey(record) === input.scopeKey)
      .sort((left, right) => recordTimestamp(right) - recordTimestamp(left))
      .slice(0, 8);
    const participantKey =
      recentTurns.map(recordParticipantKey).find(Boolean) || defaultParticipantKey(input.scopeKey);
    const sourceTurnIds = recentTurns.map(recordTurnId).filter(Boolean);
    const systemPrompt = buildBackendWorkerSystemPrompt();
    const userPrompt = buildBackendBeatPrompt({
      beatType: input.beatType,
      contextPacket,
      recentTurns,
      scopeKey: input.scopeKey,
    });
    const messages: ChatProviderMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];
    let writes = 0;
    let toolCalls = 0;
    let lastTraceId = '';
    let lastProvider = normalizeText(options.provider) || 'runtime-provider';
    let lastModel = normalizeText(options.model) || 'runtime-model';
    let lastNotes = '';

    for (let round = 1; round <= maxRounds; round += 1) {
      const rawResult = await completion({
        disableState: true,
        maxTokens: 900,
        maxToolRounds,
        messages,
        responseFormat: BACKEND_GRILLO_WORKER_RESPONSE_FORMAT,
        stateKey: `memory:${input.scopeKey}`,
        stateScope: 'memory',
        temperature: input.beatType === 'relationship' ? 0.2 : 0.35,
        toolChoiceMode: 'auto',
      });
      const result =
        typeof rawResult === 'string'
          ? { text: rawResult }
          : { meta: rawResult.meta ?? null, text: rawResult.text };
      const rawText = normalizeText(result.text);
      const meta = asRecord(result.meta);
      lastProvider = normalizeText(meta['provider']) || lastProvider;
      lastModel = normalizeText(meta['model']) || lastModel;
      lastTraceId = this.idFactory();
      await this.memory.appendGrilloRecord('worker_context_traces', {
        beat_type: input.beatType,
        created_at: this.nowMs(),
        model: lastModel,
        prompt: userPrompt,
        provider: lastProvider,
        response_text: rawText,
        round,
        scope_key: input.scopeKey,
        system_prompt: systemPrompt,
        task_type: input.beatType,
        trace_id: lastTraceId,
        user_id: input.scopeKey,
      });

      const parsed = parseWorkerJson(rawText);
      lastNotes = normalizeText(parsed['notes']);
      const calls = normalizeWorkerToolCalls(parsed, sourceTurnIds);
      if (calls.length === 0) {
        if (parsed['done'] === true) {
          break;
        }
        return {
          beatType: input.beatType,
          noOpReason: writes > 0 ? undefined : 'worker_no_tool_calls',
          statePatch: {
            lastBeatNotes: lastNotes,
            lastBeatTraceId: lastTraceId,
            lastBeatType: input.beatType,
          },
          toolCalls,
          writes,
        };
      }

      messages.push({ role: 'assistant', content: rawText });
      for (const call of calls) {
        toolCalls += 1;
        const execution = await this.runWorkerTool({
          args: call.args,
          name: call.name,
          participantKey,
          scopeKey: input.scopeKey,
        });
        if (execution.ok) {
          writes += workerToolWriteCount(call.name, execution.result);
        }
        messages.push({
          role: 'user',
          content: JSON.stringify({
            ok: execution.ok,
            result: execution.result,
            tool: call.name,
          }),
        });
      }
      messages.push({
        role: 'user',
        content:
          'Continue this GRILLO beat. Use more worker tools if needed. If complete, return JSON with done=true and toolCalls=[].',
      });
    }

    return {
      beatType: input.beatType,
      noOpReason: writes > 0 ? undefined : 'worker_no_writes',
      statePatch: {
        lastBeatAt: this.nowMs(),
        lastBeatModel: lastModel,
        lastBeatNotes: lastNotes,
        lastBeatProvider: lastProvider,
        lastBeatTraceId: lastTraceId,
        lastBeatType: input.beatType,
      },
      toolCalls,
      writes,
    };
  }

  private async runSemanticIndexingTick(
    input: {
      reason: string;
      scopeKey: string;
    },
    options: GrilloWorkerTickOptions = {},
  ): Promise<GrilloWorkerTaskResult> {
    const embedding = options.embedding;
    if (!embedding) {
      return {
        beatType: 'semantic_indexing',
        noOpReason: 'semantic_indexing_requires_embedding',
        writes: 0,
      };
    }

    const previousState = workerScopeState(
      asRecord(await this.memory.getGrilloSingleton('memory_worker_state')),
      input.scopeKey,
    );
    const indexedTurnIds = new Set(readStringArray(previousState['semanticIndexedTurnIds']));
    const turns = (await this.memory.readGrilloRecords<Record<string, unknown>>('turn_events'))
      .filter((record) => recordScopeKey(record) === input.scopeKey)
      .sort((left, right) => recordTimestamp(left) - recordTimestamp(right));
    if (turns.length === 0) {
      return {
        beatType: 'semantic_indexing',
        noOpReason: 'no_turns',
        statePatch: { semanticIndexedTurnIds: [] },
        writes: 0,
      };
    }

    const pairs = buildUnprocessedTurnPairs(turns, indexedTurnIds).slice(0, 4);
    if (pairs.length === 0) {
      return {
        beatType: 'semantic_indexing',
        noOpReason: 'no_new_turn_pairs',
        statePatch: { semanticIndexedTurnIds: [...indexedTurnIds].slice(-2000) },
        writes: 0,
      };
    }

    const existingRecords = await this.memory.loadSemanticRecords(input.scopeKey);
    const records = [...(existingRecords ?? [])];
    const existingCount = records.length;
    const seenTexts = new Set(records.map((record) => normalizeText(record.text)));
    const indexedNow: string[] = [];
    let lastModel = normalizeText(options.embeddingModel) || 'runtime-embedding-model';
    let lastProvider =
      normalizeText(options.embeddingProvider) || normalizeText(options.provider) || 'runtime-provider';
    let attempted = 0;
    let failed = 0;

    for (const pair of pairs) {
      const semanticText = formatSemanticIndexingPair(pair);
      const sourceTurnIds = [recordTurnId(pair.user), recordTurnId(pair.assistant)].filter(Boolean);
      if (!semanticText || seenTexts.has(semanticText)) {
        indexedNow.push(...sourceTurnIds);
        continue;
      }
      attempted += 1;
      const result = await embedding({
        input: semanticText,
        model: options.embeddingModel,
        provider: options.embeddingProvider ?? options.provider,
      })
        .then(normalizeEmbeddingResult)
        .catch(() => {
          failed += 1;
          return { embedding: [], model: '', provider: '' };
        });
      lastModel = result.model || lastModel;
      lastProvider = result.provider || lastProvider;
      if (!result.embedding.length) {
        failed += 1;
        continue;
      }
      records.unshift({
        assistantText: normalizeSemanticIndexText(pair.assistant, 1200),
        createdAt: Math.max(recordTimestamp(pair.assistant), recordTimestamp(pair.user), this.nowMs()),
        embedding: result.embedding,
        embeddingModel: result.model || lastModel,
        embeddingProvider: result.provider || lastProvider,
        embeddingVersion: 'provider-managed',
        id: this.idFactory(),
        participantKeys: Array.from(
          new Set(
            [recordParticipantKey(pair.user), recordParticipantKey(pair.assistant)].filter(Boolean),
          ),
        ),
        personaId: inferPersona(input.scopeKey),
        scopeKey: input.scopeKey,
        sourceTurnIds,
        text: semanticText,
        userText: normalizeSemanticIndexText(pair.user, 1200),
      });
      seenTexts.add(semanticText);
      indexedNow.push(...sourceTurnIds);
    }

    for (const turnId of indexedNow) {
      indexedTurnIds.add(turnId);
    }
    const nextRecords = records.slice(0, 160);
    const writes = Math.max(0, nextRecords.length - existingCount);
    if (writes > 0) {
      await this.memory.saveSemanticRecords(input.scopeKey, nextRecords);
    }

    const traceId = this.idFactory();
    await this.memory.appendGrilloRecord('worker_context_traces', {
      beat_type: 'semantic_indexing',
      created_at: this.nowMs(),
      model: lastModel,
      prompt: pairs.map(formatExtractionPairForTrace).join('\n\n'),
      provider: lastProvider,
      response_text: `indexed=${indexedNow.length} attempted=${attempted} failed=${failed}`,
      round: 1,
      scope_key: input.scopeKey,
      system_prompt:
        'Backend GRILLO semantic indexing embeds completed turn pairs into Ladybug semantic memory.',
      task_type: 'semantic_indexing',
      trace_id: traceId,
      user_id: input.scopeKey,
    });

    return {
      beatType: 'semantic_indexing',
      noOpReason:
        writes > 0 ? undefined : failed > 0 ? 'semantic_embedding_failed' : 'semantic_already_indexed',
      statePatch: {
        lastBeatAt: this.nowMs(),
        lastBeatModel: lastModel,
        lastBeatNotes: `semantic indexing attempted ${attempted}, failed ${failed}`,
        lastBeatProvider: lastProvider,
        lastBeatTraceId: traceId,
        lastBeatType: 'semantic_indexing',
        lastSemanticIndexingAt: this.nowMs(),
        lastSemanticIndexingFailed: failed,
        lastSemanticIndexingWrites: writes,
        semanticIndexedTurnIds: [...indexedTurnIds].slice(-2000),
      },
      toolCalls: attempted,
      writes,
    };
  }

  async buildContextPacket(input: GrilloContextPacketInput): Promise<GrilloContextPacket> {
    const scopeKey = normalizeKey(input.scopeKey, 'local:persona:default');
    const participantKeys = readStringArray(input.participantKeys).map((key) => key.toLowerCase());
    const participantSet = new Set(participantKeys);
    const includeParticipant = (participantKey: unknown) => {
      const normalized = normalizeText(participantKey).toLowerCase();
      return participantSet.size === 0 || participantSet.has(normalized);
    };
    const includeClaimParticipant = (participantKey: unknown) => {
      const normalized = normalizeText(participantKey).toLowerCase();
      return normalized === '' || includeParticipant(normalized);
    };
    const inScope = (record: Record<string, unknown>) => recordScopeKey(record) === scopeKey;
    const query = normalizeText(input.query);
    const queryEmbedding = normalizeEmbeddingArray(input.queryEmbedding);
    const queryEmbeddingIdentity = createEmbeddingIdentity({
      dimensions: queryEmbedding.length,
      model: normalizeText(input.embeddingModel),
      provider: normalizeText(input.embeddingProvider),
      version: normalizeText(input.embeddingVersion),
    });
    const [
      ledgerReplay,
      turns,
      diary,
      semanticRecords,
      semanticVectorMatches,
    ] = await Promise.all([
      this.evidenceLedger.replay(scopeKey, { stableClaimsOnly: true }),
      this.memory.readGrilloRecords<Record<string, unknown>>('turn_events', { scopeKey }),
      this.memory.readGrilloRecords<Record<string, unknown>>('diary_entries', { scopeKey }),
      this.memory.loadSemanticRecords(scopeKey),
      queryEmbedding.length > 0
        ? this.memory.querySemanticVectors(scopeKey, queryEmbedding, participantSet.size > 0 ? 32 : 8, {
            model: normalizeText(input.embeddingModel),
            provider: normalizeText(input.embeddingProvider),
            version: normalizeText(input.embeddingVersion),
          })
        : Promise.resolve([]),
    ]);
    const sortedScopeTurns = turns
      .filter(inScope)
      .sort((left, right) => recordTimestamp(left) - recordTimestamp(right));
    const scopedTurns = sortedScopeTurns.slice(-14);
    const sortedScopeDiary = diary
      .filter(inScope)
      .sort((left, right) => recordTimestamp(right) - recordTimestamp(left));
    const participantDiary = sortedScopeDiary.filter((record) =>
      includeParticipant(recordParticipantKey(record)),
    );
    const scopedDiary = participantDiary.slice(0, 5);
    const normalizedSemanticRecords = (semanticRecords ?? []).filter((record) =>
      semanticRecordMatchesParticipants(record, participantSet),
    );
    const semanticRecordById = new Map(normalizedSemanticRecords.map((record) => [record.id, record]));
    const vectorSemantic = semanticVectorMatches
      .map((match) => ({
        ...match,
        ...(semanticRecordById.get(match.id) ?? {}),
        score: match.score,
      }))
      .filter((record) => semanticRecordMatchesParticipants(record, participantSet))
      .slice(0, 8);
    const lexicalSemantic = query
      ? normalizedSemanticRecords
          .map((record) => ({ ...record, score: Math.min(1, lexicalScore(record.text, query)) }))
          .filter((record) => record.score > 0)
          .sort((left, right) => right.score - left.score || right.createdAt - left.createdAt)
          .slice(0, 8)
      : [];
    const semanticStrategy =
      vectorSemantic.length > 0
        ? 'semantic_vector'
        : lexicalSemantic.length > 0
          ? 'lexical_fallback'
          : 'none';
    const semantic =
      vectorSemantic.length > 0
        ? vectorSemantic
        : lexicalSemantic.length > 0
          ? lexicalSemantic
          : [];

    const ledgerProjection = this.projectLedgerReplay(ledgerReplay);
    const ledgerProjectionIsValid =
      ledgerProjection.provenance.integrityIssues.length === 0 &&
      ledgerProjection.provenance.invalidRecordIds.length === 0;
    this.reportLedgerQuarantine(scopeKey, ledgerProjection);
    const allProjectedRelationshipItems = ledgerProjectionIsValid
      ? ledgerProjection.slots.map((slot) => ({
          claimId: slot.current.claimId,
          confidence: slot.current.confidence,
          item: formatProjectedClaimItem(slot.current),
          participantKey: slot.current.participantKey,
          validFrom: slot.current.validFrom,
        }))
      : [];
    const projectedRelationshipItems = allProjectedRelationshipItems
      .filter(({ participantKey }) => includeClaimParticipant(participantKey))
      .sort(
        (left, right) =>
          right.validFrom - left.validFrom ||
          right.confidence - left.confidence ||
          left.claimId.localeCompare(right.claimId),
      );
    const excludedProjectedRelationshipItems = allProjectedRelationshipItems
      .filter(({ participantKey }) => !includeClaimParticipant(participantKey))
      .map(({ item }) => item);
    const includeProvenanceReceipt = input.includeProvenanceReceipt === true;
    const requestedRelationshipItems = includeProvenanceReceipt
      ? allProjectedRelationshipItems.map(({ item }) => item)
      : [];
    const eligibleRelationshipItems = projectedRelationshipItems.map(({ item }) => item);
    const relationshipItems = eligibleRelationshipItems.slice(0, 16);
    const relationshipMemory = relationshipItems.map((item) => item.text);
    const channelItems = scopedTurns.map(formatTurnEventItem);
    const thoughtItems = scopedDiary.map(formatDiaryEntryItem);
    const recallSelection = selectRecallItems(
      semantic.map((record) => formatSemanticRecallItem(record, scopeKey)).filter((item) => item.text.trim()),
      12,
    );
    const requestedSemanticItems = includeProvenanceReceipt
      ? (vectorSemantic.length > 0
          ? vectorSemantic
          : query
            ? normalizedSemanticRecords.map((record) => ({
                ...record,
                score: Math.min(1, lexicalScore(record.text, query)),
              }))
            : []
        ).map((record) => formatSemanticRecallItem(record, scopeKey))
      : [];
    const provenanceReceipt = includeProvenanceReceipt
      ? buildServerContextProvenance({
          channel: {
            dropped: droppedItems(
              sortedScopeTurns.slice(0, Math.max(0, sortedScopeTurns.length - 14)).map(formatTurnEventItem),
              'lane_limit',
            ),
            included: channelItems,
            requested: sortedScopeTurns.map(formatTurnEventItem),
          },
          recalled: {
            dropped: [
              ...(vectorSemantic.length === 0 && query
                ? requestedSemanticItems
                    .filter((item) => (item.score ?? 0) <= 0)
                    .map((item) => provenanceDrop(item.id, 'semantic_filter'))
                : []),
              ...(vectorSemantic.length === 0 && query
                ? requestedSemanticItems
                    .filter((item) => (item.score ?? 0) > 0)
                    .sort(
                      (left, right) =>
                        (right.score ?? 0) - (left.score ?? 0) || right.createdAt - left.createdAt,
                    )
                    .slice(8)
                    .map((item) => provenanceDrop(item.id, 'semantic_limit'))
                : []),
              ...recallSelection.receipt.droppedIds.map((id) => provenanceDrop(id, 'lane_limit')),
              ...recallSelection.receipt.duplicateIds.map((id) => provenanceDrop(id, 'duplicate')),
            ],
            duplicateIds: recallSelection.receipt.duplicateIds,
            included: recallSelection.items.map((item) => ({ id: item.id, text: item.text })),
            requested: requestedSemanticItems.map((item) => ({
              id: item.id,
              text: item.text,
            })),
          },
          relationship: {
            dropped: [
              ...droppedItems(excludedProjectedRelationshipItems, 'participant_filter'),
              ...droppedItems(eligibleRelationshipItems.slice(16), 'lane_limit'),
            ],
            included: relationshipItems,
            requested: requestedRelationshipItems,
          },
          thoughts: {
            dropped: [
              ...droppedItems(
                sortedScopeDiary
                  .filter((record) => !includeParticipant(recordParticipantKey(record)))
                  .map(formatDiaryEntryItem),
                'participant_filter',
              ),
              ...droppedItems(participantDiary.slice(5).map(formatDiaryEntryItem), 'record_limit'),
            ],
            included: thoughtItems,
            requested: sortedScopeDiary.map(formatDiaryEntryItem),
          },
        })
      : undefined;

    const packet: GrilloContextPacket = {
      background_information: [
        `scope_key: ${scopeKey}`,
        `source: ${inferSource(scopeKey)}`,
        `channel: ${inferChannel(scopeKey)}`,
        `participant_filter: ${participantKeys.length > 0 ? participantKeys.join(', ') : 'all'}`,
        `stored_turn_events: ${turns.filter(inScope).length}`,
        `semantic_records: ${semanticRecords?.length ?? 0}`,
        `semantic_retrieval: ${semanticStrategy}`,
        `memory_authority: ${ledgerProjectionIsValid ? 'evidence_ledger' : 'evidence_ledger_quarantined'}`,
        ledgerProjection.provenance.invalidRecordIds.length > 0
          ? `quarantined_invalid_records: ${ledgerProjection.provenance.invalidRecordIds.length}`
          : '',
        ledgerProjection.provenance.integrityIssues.length > 0
          ? `ledger_integrity_issues: ${ledgerProjection.provenance.integrityIssues.length}`
          : '',
        `active_ledger_claims: ${projectedRelationshipItems.length}`,
        query ? `query: ${query}` : '',
      ].filter(Boolean),
      channel_history: channelItems.map((item) => item.text),
      generatedAt: this.nowMs(),
      output_description: [
        'Use this GRILLO packet as scoped memory/context for the current reply.',
        'Treat channel_history as transcript, relationship_memory as durable participant context, recalled_memories as recall, and thoughts as private reflection.',
        ...(projectedRelationshipItems.length > 0
          ? [
              'Evidence-backed [claim:] entries are the authoritative durable memory for this reply.',
            ]
          : []),
        'If memory conflicts with the current user turn, trust the current user turn first.',
      ],
      ...(provenanceReceipt ? { provenance_receipt: provenanceReceipt } : {}),
      recalled_memories: recallSelection.items,
      relationship_memory: relationshipMemory,
      retrieval_receipt: {
        embedding: queryEmbeddingIdentity,
        lanes: {
          recalled_memories: recallSelection.receipt,
        },
        query,
        strategy: semanticStrategy,
      },
      scopeKey,
      thoughts: thoughtItems.map((item) => item.text),
    };
    return packet;
  }

  private reportLedgerQuarantine(scopeKey: string, projection: GrilloLedgerProjection) {
    const invalidRecordIds = projection.provenance.invalidRecordIds;
    const integrityIssues = projection.provenance.integrityIssues;
    if (invalidRecordIds.length === 0 && integrityIssues.length === 0) {
      this.quarantineSignatures.delete(scopeKey);
      return;
    }
    const signature = JSON.stringify({ integrityIssues, invalidRecordIds });
    if (this.quarantineSignatures.get(scopeKey) === signature) return;
    this.quarantineSignatures.set(scopeKey, signature);
    console.warn('[GRILLO] ledger quarantined', { integrityIssues, invalidRecordIds, scopeKey });
  }

  private projectLedgerReplay(replay: GrilloLedgerReplay) {
    const cached = this.projectionCache.get(replay);
    if (cached) return cached;
    const projection = buildGrilloLedgerProjection(replay);
    this.projectionCache.set(replay, projection);
    return projection;
  }

  async diagnoseContextPacket(input: GrilloContextPacketInput) {
    const query = normalizeText(input.query);
    const packet = await this.buildContextPacket({
      ...input,
      includeProvenanceReceipt: true,
    });
    return {
      packet,
      receipt: assessGrilloMemorySufficiency(query, packet),
    };
  }

  private async executeWorkerTool(
    name: GrilloWorkerToolName,
    scopeKey: string,
    participantKey: string,
    args: Record<string, unknown>,
  ) {
    if (name === 'core.worker_memory_read') {
      return this.readWorkerMemory(scopeKey, participantKey, args);
    }
    if (name === 'core.worker_memory_search') {
      return this.searchWorkerMemory(scopeKey, participantKey, args);
    }
    if (name === 'core.worker_candidate_list') {
      return this.listWorkerCandidates(scopeKey, participantKey, args);
    }
    if (name === 'core.worker_candidate_write') {
      return this.writeWorkerCandidate(scopeKey, participantKey, args);
    }
    if (name === 'core.worker_claim_propose') {
      return this.proposeWorkerClaim(scopeKey, participantKey, args);
    }
    if (name === 'core.worker_diary_write') {
      return this.writeWorkerDiary(scopeKey, participantKey, args);
    }
    if (name === 'core.worker_memory_write') {
      return this.writeWorkerMemory(scopeKey, participantKey, args);
    }
    if (name === 'core.worker_profile_patch') {
      return this.patchWorkerProfile(scopeKey, args);
    }
    if (name === 'core.worker_emotion_read') {
      return this.readWorkerEmotion(scopeKey);
    }
    if (name === 'core.worker_emotion_update') {
      return this.updateWorkerEmotion(scopeKey, args);
    }
    if (name === 'core.worker_repair_list') {
      const status = normalizeText(args['status']);
      const tasks = await this.repairQueue.list(
        scopeKey,
        status === 'deferred' || status === 'resolved' ? status : 'open',
      );
      return {
        tasks: tasks.filter(
          (task) => !task.participantKey || !participantKey || task.participantKey === participantKey,
        ),
      };
    }
    if (name === 'core.worker_repair_transition') {
      return this.transitionWorkerRepair(scopeKey, participantKey, args);
    }
    return this.insertWorkerArchivalMemory(scopeKey, participantKey, args);
  }

  private async transitionWorkerRepair(
    scopeKey: string,
    participantKey: string,
    args: Record<string, unknown>,
  ) {
    const taskId = normalizeText(args['task_id']);
    const action = normalizeText(args['action']);
    const summary = normalizeText(args['summary']);
    const task = (await this.repairQueue.list(scopeKey)).find((item) => item.taskId === taskId);
    if (!task) throw new Error('repair task was not found in the worker scope');
    if (task.participantKey && participantKey && task.participantKey !== participantKey) {
      throw new Error('repair task participant does not match the worker participant');
    }
    if (task.status === 'resolved') throw new Error('repair task is already resolved');
    const event = await this.repairQueue.transition({
      action: action === 'resolve' ? 'resolve' : 'defer',
      taskId: task.taskId,
      scopeKey,
      ...(task.participantKey ? { participantKey: task.participantKey } : {}),
      signalKind: task.signalKind,
      summary,
      evidenceIds: task.evidenceIds,
      sourceRecordIds: task.sourceRecordIds,
    });
    return { action: event.action, eventId: event.id, taskId: task.taskId };
  }

  private async readWorkerMemory(
    scopeKey: string,
    participantKey: string,
    args: Record<string, unknown>,
  ) {
    const blockName = normalizeText(args['block_name']);
    const [blocks, slots, projection] = await Promise.all([
      this.memory.readGrilloRecords<Record<string, unknown>>('memory_blocks'),
      this.memory.readGrilloRecords<Record<string, unknown>>('memory_slots'),
      this.getEvidenceLedgerProjection(scopeKey),
    ]);
    const inWorkerScope = (record: Record<string, unknown>) =>
      recordScopeKey(record) === scopeKey && workerParticipantMatches(record, participantKey);
    const blockMatches = (record: Record<string, unknown>) =>
      !blockName || normalizeText(record['blockName'] ?? record['block_name']) === blockName;
    const slotMatches = (record: Record<string, unknown>) =>
      !blockName || normalizeText(record['slotName'] ?? record['slot_name']) === blockName;
    return {
      memory_blocks: blocks.filter((record) => inWorkerScope(record) && blockMatches(record)).slice(-20),
      slots: slots
        .filter((record) => inWorkerScope(record) && slotMatches(record))
        .map((slot) => ({
          items: readJsonArray(slot['contentJson'] ?? slot['content_json']),
          slot_name: normalizeText(slot['slotName'] ?? slot['slot_name']),
          updated_at: normalizeText(slot['updatedAt'] ?? slot['updated_at']),
        })),
      claims: projection.slots
        .filter(
          (slot) =>
            !participantKey ||
            !slot.current.participantKey ||
            slot.current.participantKey === participantKey,
        )
        .map((slot) => slot.current),
    };
  }

  private async searchWorkerMemory(
    scopeKey: string,
    participantKey: string,
    args: Record<string, unknown>,
  ) {
    const query = normalizeText(args['query']);
    const limit = clampInteger(args['limit'], 1, 20, 5);
    if (!query) {
      return { results: [] };
    }
    const [candidates, diary, blocks, slots, semanticRecords, projection] = await Promise.all([
      this.memory.readGrilloRecords<Record<string, unknown>>('memory_candidates'),
      this.memory.readGrilloRecords<Record<string, unknown>>('diary_entries'),
      this.memory.readGrilloRecords<Record<string, unknown>>('memory_blocks'),
      this.memory.readGrilloRecords<Record<string, unknown>>('memory_slots'),
      this.memory.loadSemanticRecords(scopeKey),
      this.getEvidenceLedgerProjection(scopeKey),
    ]);
    const scoped = (record: Record<string, unknown>) =>
      recordScopeKey(record) === scopeKey && workerParticipantMatches(record, participantKey);
    const results = [
      ...candidates.filter(scoped).map((record) => ({
        id: normalizeText(record['candidateId'] ?? record['candidate_id']),
        metadata: { source: 'candidate', type: normalizeText(record['type']) },
        text: `${normalizeText(record['summary'])} ${normalizeText(record['content'])}`.trim(),
      })),
      ...diary.filter(scoped).map((record) => ({
        id: normalizeText(record['diaryId'] ?? record['diary_id']),
        metadata: { source: 'diary', beat_type: normalizeText(record['beatType'] ?? record['beat_type']) },
        text: `${normalizeText(record['summary'])} ${normalizeText(record['personalThought'] ?? record['personal_thought'])}`.trim(),
      })),
      ...blocks.filter(scoped).map((record) => ({
        id: normalizeText(record['blockId'] ?? record['block_id']),
        metadata: { source: 'memory_block', block_name: normalizeText(record['blockName'] ?? record['block_name']) },
        text: readJsonArray(record['itemsJson'] ?? record['items_json'] ?? record['items']).join(' '),
      })),
      ...slots.filter(scoped).map((record) => ({
        id: normalizeText(record['slotId'] ?? record['slot_id']),
        metadata: { source: 'memory_slot', slot_name: normalizeText(record['slotName'] ?? record['slot_name']) },
        text: readJsonArray(record['contentJson'] ?? record['content_json']).join(' '),
      })),
      ...(semanticRecords ?? [])
        .filter((record) =>
          semanticRecordMatchesParticipants(
            record,
            new Set(participantKey ? [participantKey.toLowerCase()] : []),
          ),
        )
        .map((record) => ({
          id: record.id,
          metadata: { source: 'semantic', persona_id: record.personaId },
          text: normalizeText(record.text),
        })),
      ...projection.slots
        .filter(
          (slot) =>
            !participantKey ||
            !slot.current.participantKey ||
            slot.current.participantKey === participantKey,
        )
        .map((slot) => ({
          id: slot.current.claimId,
          metadata: {
            source: 'ledger_claim',
            kind: slot.current.kind,
            predicate: slot.current.predicate,
            status: slot.current.status,
          },
          text: `${slot.current.subject} ${slot.current.predicate} ${JSON.stringify(slot.current.effectiveValue)}`,
        })),
    ]
      .filter((record) => record.id && record.text)
      .map((record) => ({ ...record, score: lexicalScore(record.text, query) }))
      .filter((record) => record.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);
    return { results };
  }

  private async listWorkerCandidates(
    scopeKey: string,
    participantKey: string,
    args: Record<string, unknown>,
  ) {
    const limit = clampInteger(args['limit'], 1, 100, 20);
    const typeFilter = normalizeText(args['type_filter']);
    const candidates = await this.memory.readGrilloRecords<Record<string, unknown>>('memory_candidates');
    return {
      candidates: candidates
        .filter((record) => recordScopeKey(record) === scopeKey && workerParticipantMatches(record, participantKey))
        .filter((record) => !typeFilter || normalizeText(record['type']) === typeFilter)
        .sort((left, right) => recordTimestamp(right) - recordTimestamp(left))
        .slice(0, limit),
    };
  }

  private async writeWorkerCandidate(
    scopeKey: string,
    participantKey: string,
    args: Record<string, unknown>,
  ) {
    const content = normalizeText(args['content']);
    const summary = normalizeText(args['summary']);
    if (!content || !summary) {
      throw new Error('candidate content and summary are required');
    }
    const candidateId = this.idFactory();
    await this.memory.appendGrilloRecord('memory_candidates', {
      candidate_id: candidateId,
      confidence: clampNumber(args['confidence'], 0, 1, 0.7),
      content,
      created_at: this.nowMs(),
      evidence_turn_ids: readStringArray(args['evidence_turn_ids'] ?? args['source_turn_ids']),
      origin_turn_id: normalizeText(args['origin_turn_id']),
      participant_key: participantKey,
      scope_key: scopeKey,
      source: normalizeText(args['source']) || 'worker_tool',
      summary,
      tags: readStringArray(args['tags']),
      type: normalizeCandidateType(args['type']),
      user_id: scopeKey,
    });
    return { candidate_id: candidateId };
  }

  private async proposeWorkerClaim(
    scopeKey: string,
    participantKey: string,
    args: Record<string, unknown>,
  ) {
    const result = await this.evidenceLedger.evaluateClaim({
      confidence: clampNumber(args['confidence'], 0, 1, 0.7),
      evidenceIds: readStringArray(args['evidence_turn_ids'] ?? args['source_turn_ids']),
      kind: normalizeClaimKind(args['kind']),
      operation: normalizeClaimOperation(args['operation']),
      participantKey,
      predicate: normalizeText(args['predicate']),
      scopeKey,
      subject: normalizeText(args['subject']) || participantKey,
      supersedesRecordIds: readStringArray(
        args['supersedes_claim_ids'] ?? args['supersedes_record_ids'],
      ),
      value: args['value'] as GrilloClaimInput['value'],
    });
    return {
      claim_id: result.claim?.id ?? null,
      decision_id: result.decision.id,
      evidence_ids: result.decision.evidenceIds,
      operation: result.decision.operation,
      outcome: result.decision.outcome,
      public_reason: result.decision.publicReason,
      target_id: result.decision.targetId,
    };
  }

  private async writeWorkerDiary(scopeKey: string, participantKey: string, args: Record<string, unknown>) {
    const summary = normalizeText(args['summary']);
    const personalThought = normalizeText(args['personal_thought'] ?? args['personalThought']);
    if (!summary || !personalThought) {
      throw new Error('diary summary and personal_thought are required');
    }
    const diaryId = this.idFactory();
    await this.memory.appendGrilloRecord('diary_entries', {
      beat_type: normalizeText(args['beat_type'] ?? args['beatType']) || 'reflection',
      content: normalizeText(args['content']),
      context_tags: readStringArray(args['context_tags']),
      created_at: this.nowMs(),
      diary_id: diaryId,
      emotions: readEmotionArray(args['emotions']),
      interaction_summary: normalizeText(args['interaction_summary']),
      involved_users: readStringArray(args['involved_users']),
      participant_key: participantKey,
      personal_thought: personalThought,
      scope_key: scopeKey,
      source_turn_ids: readStringArray(args['source_turn_ids']),
      summary,
      tags: readStringArray(args['tags']),
      user_id: scopeKey,
      user_message: normalizeText(args['user_message']),
    });
    return { diary_id: diaryId };
  }

  private async writeWorkerMemory(scopeKey: string, participantKey: string, args: Record<string, unknown>) {
    const blockName = normalizeMemoryBlockName(args['block_name']);
    const items = dedupeStrings(readStringArray(args['items']));
    if (!blockName || items.length === 0) {
      throw new Error('block_name and non-empty items are required');
    }
    const operation = normalizeText(args['operation']) === 'replace' ? 'replace' : 'merge';
    const sourceCandidateIds = dedupeStrings(readStringArray(args['source_candidate_ids']));
    const now = this.nowMs();
    const slots = await this.memory.readGrilloRecords<Record<string, unknown>>('memory_slots');
    const existingSlot = slots.find(
      (slot) =>
        recordScopeKey(slot) === scopeKey &&
        workerParticipantMatches(slot, participantKey) &&
        normalizeText(slot['slotName'] ?? slot['slot_name']) === blockName,
    );
    const existingItems = readJsonArray(existingSlot?.['contentJson'] ?? existingSlot?.['content_json']);
    const nextItems = operation === 'replace' ? items : dedupeStrings([...existingItems, ...items]);
    const slotId = normalizeText(existingSlot?.['slotId'] ?? existingSlot?.['slot_id']) || `${scopeKey}:${participantKey}:${blockName}`;
    const existingSourceIds = readJsonArray(
      existingSlot?.['sourceCandidateIdsJson'] ?? existingSlot?.['source_candidate_ids_json'],
    );
    const nextSourceIds = dedupeStrings([...existingSourceIds, ...sourceCandidateIds]);
    await this.memory.upsertGrilloMemorySlot({
      content_json: JSON.stringify(nextItems),
      participant_key: participantKey,
      schema_version: '1.0.0',
      slot_id: slotId,
      slot_name: blockName,
      scope_key: scopeKey,
      source_candidate_ids_json: JSON.stringify(nextSourceIds),
      updated_at: String(now),
      user_id: scopeKey,
    } as LadybugMemorySlotRecord & { participant_key: string; scope_key: string });
    await this.memory.appendGrilloMemorySlotPatch({
      created_at: String(now),
      operation: operation === 'replace' ? 'set' : 'merge',
      participant_key: participantKey,
      patch_id: this.idFactory(),
      patch_json: JSON.stringify({ items, reason: normalizeText(args['reason']) }),
      schema_version: '1.0.0',
      slot_id: slotId,
      slot_name: blockName,
      scope_key: scopeKey,
      source_candidate_ids_json: JSON.stringify(sourceCandidateIds),
      user_id: scopeKey,
    } as LadybugMemorySlotPatchRecord & { participant_key: string; scope_key: string });
    const blockId = this.idFactory();
    await this.memory.appendGrilloRecord('memory_blocks', {
      block_id: blockId,
      block_name: blockName,
      created_at: now,
      items,
      items_json: JSON.stringify(items),
      operation,
      participant_key: participantKey,
      reason: normalizeText(args['reason']),
      scope_key: scopeKey,
      source_candidate_ids: sourceCandidateIds,
      source_candidate_ids_json: JSON.stringify(sourceCandidateIds),
      updated_at: now,
      user_id: scopeKey,
    });
    return { block_id: blockId, block_name: blockName, item_count: nextItems.length, slot_id: slotId };
  }

  private async patchWorkerProfile(scopeKey: string, args: Record<string, unknown>) {
    const field = normalizeProfilePatchField(args['field']);
    const operation = normalizeText(args['operation']) === 'remove' ? 'remove' : 'add';
    const value = normalizeText(args['value']);
    if (!field || !value) {
      throw new Error('profile patch field and value are required');
    }
    await this.memory.updateRelationshipProfile(scopeKey, (profile) => {
      const currentValues = readStringArray(profile[field]);
      const nextValues =
        operation === 'remove'
          ? currentValues.filter((item) => item !== value)
          : dedupeStrings([...currentValues, value]);
      return {
        ...profile,
        [field]: nextValues,
        updatedAt: this.nowMs(),
      };
    });
    return { field, ok: true, operation, value };
  }

  private async readWorkerEmotion(scopeKey: string) {
    return { emotion_state: await this.getCurrentEmotionState(scopeKey) };
  }

  private async updateWorkerEmotion(scopeKey: string, args: Record<string, unknown>) {
    const operation = normalizeText(args['operation']) === 'replace' ? 'replace' : 'merge';
    const incoming = readEmotionIntensityMap(args['intensities'] ?? args['emotions']);
    if (Object.keys(incoming).length === 0 && operation !== 'replace') {
      throw new Error('emotion update requires intensities or operation="replace"');
    }
    const current = await this.getCurrentEmotionState(scopeKey);
    const previous = readEmotionIntensityMap(current.intensities);
    const intensities = operation === 'replace' ? incoming : { ...previous, ...incoming };
    const now = this.nowMs();
    const source =
      normalizeText(args['last_signal_source'] ?? args['lastSignalSource'] ?? args['source']) ||
      'worker_tool';
    const record = await this.memory.upsertGrilloEmotionState(scopeKey, {
      intensities,
      lastSignalAt: now,
      lastSignalSource: source,
      updatedAt: now,
    });
    return {
      emotion_state: toWorkerEmotionState(record),
      emotion_state_id: record.emotion_state_id,
      ok: true,
      operation,
    };
  }

  private async getCurrentEmotionState(scopeKey: string) {
    const records = await this.memory.readGrilloRecords<Record<string, unknown>>('emotion_states');
    const current = records
      .filter((record) => recordScopeKey(record) === scopeKey)
      .sort((left, right) => recordUpdatedAt(right) - recordUpdatedAt(left))[0];
    return toWorkerEmotionState(current ?? {
      emotion_state_id: `emotion:${scopeKey}`,
      intensities: {},
      last_signal_at: '',
      last_signal_source: '',
      scope_key: scopeKey,
      updated_at: '',
    });
  }

  private async insertWorkerArchivalMemory(
    scopeKey: string,
    participantKey: string,
    args: Record<string, unknown>,
  ) {
    const text = normalizeText(args['text']);
    if (!text) {
      throw new Error('archival memory text is required');
    }
    const id = this.idFactory();
    const records = await this.memory.loadSemanticRecords(scopeKey);
    await this.memory.saveSemanticRecords(scopeKey, [
      ...(records ?? []),
      {
        assistantText: '',
        createdAt: this.nowMs(),
        embedding: null,
        id,
        participantKeys: participantKey ? [participantKey] : [],
        personaId: inferPersona(scopeKey),
        scopeKey,
        text,
        userText: '',
      },
    ]);
    return { id, ok: true };
  }

  private async appendWorkerToolTelemetry(input: {
    args: Record<string, unknown>;
    durationMs: number;
    error: string;
    name: string;
    ok: boolean;
    result: unknown;
    scopeKey: string;
    telemetryId: string;
  }) {
    await this.memory.appendGrilloRecord('grillo_activity_log', {
      activity_id: input.telemetryId,
      args_summary: summarizeToolArgs(input.args),
      beat_type: 'worker_tool',
      created_at: this.nowMs(),
      duration_ms: input.durationMs,
      error: input.error,
      ok: input.ok,
      response_text: input.ok ? `${input.name} ok` : `${input.name || 'unknown'} failed: ${input.error}`,
      result_json: JSON.stringify(truncateToolResult(input.result)),
      scope_key: input.scopeKey,
      tool_name: input.name,
      user_id: input.scopeKey,
    });
  }

  async recordMemoryFeedback(input: GrilloMemoryFeedbackInput) {
    const scopeKey = normalizeKey(input.scopeKey, 'local:persona:default');
    const content = normalizeText(input.content);
    if (!content) throw new Error('feedback content is required');
    const participantKey = normalizeKey(input.participantKey, '');
    const evidence = await this.evidenceLedger.appendEvidence({
      id: this.idFactory(),
      content,
      createdAt: this.nowMs(),
      kind: 'feedback',
      metadata: {},
      ...(participantKey ? { participantKey } : {}),
      role: 'user',
      scopeKey,
      source: normalizeKey(input.source, 'manual-feedback'),
      sourceRecordIds: [],
    });
    await this.repairQueue.enqueue({
      id: `repair-event:${evidence.id}:enqueue`,
      taskId: `repair:${evidence.id}`,
      scopeKey,
      ...(participantKey ? { participantKey } : {}),
      signalKind: 'feedback',
      summary: content,
      evidenceIds: [evidence.id],
      sourceRecordIds: evidence.sourceRecordIds,
    });
    return evidence;
  }

  async recordMemoryCorrection(input: GrilloMemoryCorrectionInput) {
    const scopeKey = normalizeKey(input.scopeKey, 'local:persona:default');
    const targetClaimId = normalizeText(input.targetClaimId);
    const reason = normalizeText(input.reason);
    const content = normalizeText(input.content) || reason;
    if (!targetClaimId) throw new Error('correction targetClaimId is required');
    if (!reason) throw new Error('correction reason is required');
    if (input.correctedValue === undefined) throw new Error('correction correctedValue is required');
    const correctedValue = z.json().parse(input.correctedValue);
    const participantKey = normalizeKey(input.participantKey, '');
    const evidence = await this.evidenceLedger.appendEvidence({
      id: this.idFactory(),
      content,
      createdAt: this.nowMs(),
      kind: 'correction',
      metadata: { targetClaimId },
      ...(participantKey ? { participantKey } : {}),
      role: 'user',
      scopeKey,
      source: normalizeKey(input.source, 'manual-correction'),
      sourceRecordIds: [],
    });
    const result = await this.evidenceLedger.recordCorrection({
      correctedValue,
      evidenceIds: [evidence.id],
      ...(participantKey ? { participantKey } : {}),
      reason,
      scopeKey,
      targetClaimId,
    });
    await this.repairQueue.enqueue({
      id: `repair-event:${evidence.id}:enqueue`,
      taskId: `repair:${evidence.id}`,
      scopeKey,
      ...(participantKey ? { participantKey } : {}),
      signalKind: 'correction',
      summary: reason,
      evidenceIds: [evidence.id],
      sourceRecordIds: [targetClaimId],
    });
    return result;
  }

  listRepairQueue(scopeKey: string, status?: GrilloRepairTask['status']) {
    return this.repairQueue.list(normalizeKey(scopeKey, 'local:persona:default'), status);
  }

  private withMigrationQueue<T>(scopeKey: string, task: () => Promise<T>) {
    const previous = this.migrationQueues.get(scopeKey) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(task);
    const settled = run.then(
      () => undefined,
      () => undefined,
    );
    this.migrationQueues.set(scopeKey, settled);
    return run.finally(() => {
      if (this.migrationQueues.get(scopeKey) === settled) {
        this.migrationQueues.delete(scopeKey);
      }
    });
  }
}

function createEmbeddingIdentity(input: {
  dimensions: number;
  model?: string;
  provider?: string;
  version?: string;
}): GrilloEmbeddingIdentity | null {
  if (input.dimensions <= 0) {
    return null;
  }
  const model = input.model?.trim() || 'unknown-model';
  const provider = input.provider?.trim() || 'unknown-provider';
  const version = input.version?.trim() || 'unversioned';
  return {
    dimensions: input.dimensions,
    generation: `${provider}:${model}:${version}:${input.dimensions}`,
    model,
    provider,
    version,
  };
}

function formatSemanticRecallItem(
  record: LadybugSemanticMemoryRecord & { score?: number },
  scopeKey: string,
): GrilloRecallItem {
  const dimensions = normalizeEmbeddingArray(record.embedding).length;
  const embedding = createEmbeddingIdentity({
    dimensions,
    model: record.embeddingModel,
    provider: record.embeddingProvider,
    version: record.embeddingVersion,
  });
  return {
    createdAt: record.createdAt,
    ...(embedding ? { embedding } : {}),
    evidenceIds: dedupeStrings(record.sourceTurnIds ?? []),
    id: record.id,
    score:
      typeof record.score === 'number' && Number.isFinite(record.score)
        ? clampNumber(record.score, 0, 1, 0)
        : undefined,
    scopeKey: record.scopeKey || scopeKey,
    source: 'semantic',
    text: `[semantic:${record.personaId || 'unknown'}] ${normalizeText(record.text)}`,
  };
}

function selectRecallItems(items: GrilloRecallItem[], limit: number) {
  const requestedIds = items.map((item) => item.id);
  const duplicateIds: string[] = [];
  const seen = new Set<string>();
  const unique = items
    .sort(
      (left, right) =>
        (right.score ?? 0) - (left.score ?? 0) || right.createdAt - left.createdAt,
    )
    .filter((item) => {
      if (seen.has(item.id)) {
        duplicateIds.push(item.id);
        return false;
      }
      seen.add(item.id);
      return true;
    });
  const included = unique.slice(0, Math.max(0, limit));
  const includedIds = included.map((item) => item.id);
  const includedSet = new Set(includedIds);
  return {
    items: included,
    receipt: {
      droppedIds: unique.map((item) => item.id).filter((id) => !includedSet.has(id)),
      duplicateIds: dedupeStrings(duplicateIds),
      includedIds,
      requestedIds,
    },
  };
}

type ServerProvenanceItem = {
  id: string;
  text: string;
};

type ServerProvenanceLaneInput = {
  dropped: GrilloProvenanceDrop[];
  duplicateIds?: string[];
  included: ServerProvenanceItem[];
  requested: ServerProvenanceItem[];
};

function buildServerContextProvenance(input: {
  channel: ServerProvenanceLaneInput;
  recalled: ServerProvenanceLaneInput;
  relationship: ServerProvenanceLaneInput;
  thoughts: ServerProvenanceLaneInput;
}): GrilloContextProvenanceReceipt {
  return {
    lanes: {
      channel_history: provenanceLaneReceipt(input.channel),
      recalled_memories: provenanceLaneReceipt(input.recalled),
      relationship_memory: provenanceLaneReceipt(input.relationship),
      thoughts: provenanceLaneReceipt(input.thoughts),
    },
    stage: 'server_context_packet',
    version: '1.0.0',
  };
}

function provenanceLaneReceipt(input: ServerProvenanceLaneInput) {
  const requestedOccurrences = input.requested.map((item) => item.id);
  const includedOccurrences = input.included.map((item) => item.id);
  return {
    dropped: dedupeProvenanceDrops(input.dropped),
    droppedIds: dedupeStrings(input.dropped.map((item) => item.id)),
    duplicateIds: dedupeStrings(input.duplicateIds ?? findDuplicateIds(requestedOccurrences)),
    includedIds: dedupeStrings(includedOccurrences),
    includedOccurrences,
    requestedIds: dedupeStrings(requestedOccurrences),
    requestedOccurrences,
  };
}

function findDuplicateIds(ids: string[]) {
  const seen = new Set<string>();
  return ids.filter((id) => {
    if (seen.has(id)) return true;
    seen.add(id);
    return false;
  });
}

function droppedItems(
  items: ServerProvenanceItem[],
  reason: GrilloProvenanceDrop['reason'],
) {
  return items.map((item) => provenanceDrop(item.id, reason));
}

function provenanceDrop(
  id: string,
  reason: GrilloProvenanceDrop['reason'],
): GrilloProvenanceDrop {
  return { id, reason, stage: 'server_context_packet' };
}

function dedupeProvenanceDrops(items: GrilloProvenanceDrop[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.id}\u0000${item.reason}\u0000${item.stage}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

type NormalizedWorkerToolCall = {
  args: Record<string, unknown>;
  name: GrilloWorkerToolName;
};

const WORKER_TOOL_NAME_VALUES = [
  'core.worker_memory_read',
  'core.worker_memory_search',
  'core.worker_candidate_list',
  'core.worker_candidate_write',
  'core.worker_claim_propose',
  'core.worker_diary_write',
  'core.worker_memory_write',
  'core.worker_profile_patch',
  'core.worker_emotion_read',
  'core.worker_emotion_update',
  'core.worker_repair_list',
  'core.worker_repair_transition',
  'core.worker_memory_insert_archival',
] as const satisfies readonly GrilloWorkerToolName[];

const WorkerToolNameSchema = z.enum(WORKER_TOOL_NAME_VALUES);
const TextishSchema = z.union([z.string(), z.number(), z.boolean()]);
export const BackendGrilloWorkerResponseSchema = z
  .object({
    done: z.boolean(),
    notes: z.string(),
    toolCalls: z.array(z.object({
      args: z.string().describe('A JSON-encoded object containing the tool arguments.'),
      name: WorkerToolNameSchema,
    })),
  })
  .strict();
const WorkerResponseSchema = z
  .object({
    candidate: z.unknown().optional(),
    diary: z.unknown().optional(),
    done: z.boolean().optional(),
    memory: z.unknown().optional(),
    notes: z.string().optional(),
    relationship: z.unknown().optional(),
    tool_calls: z.array(z.unknown()).optional(),
    toolCalls: z.array(z.unknown()).optional(),
  })
  .passthrough();
const WorkerToolCallSchema = z
  .object({
    args: z.union([z.record(z.string(), z.unknown()), z.string()]).optional(),
    name: WorkerToolNameSchema,
  })
  .passthrough();
const OpenAiWorkerToolCallSchema = z
  .object({
    args: z.unknown().optional(),
    arguments: z.unknown().optional(),
    function: z
      .object({
        arguments: z.unknown().optional(),
        name: z.string().optional(),
      })
      .passthrough()
      .optional(),
    name: z.string().optional(),
  })
  .passthrough();
const CandidateWriteArgsSchema = z
  .object({
    confidence: z.number().optional(),
    content: TextishSchema,
    summary: TextishSchema,
    type: z.enum(['preference', 'fact', 'goal', 'boundary', 'bond_signal', 'thread']).optional(),
  })
  .passthrough();
const ClaimProposeArgsSchema = z
  .object({
    confidence: z.number().min(0).max(1).optional(),
    evidence_turn_ids: z.array(z.string().min(1)).max(100).optional(),
    kind: z.enum([
      'fact',
      'preference',
      'opinion',
      'relationship',
      'decision',
      'goal',
      'boundary',
      'thread',
      'bond_signal',
    ]),
    operation: z.enum(['ADD', 'UPDATE', 'SUPERSEDE']).optional(),
    predicate: z.string().trim().min(1).max(240),
    subject: z.string().trim().min(1).max(500).optional(),
    supersedes_claim_ids: z.array(z.string().min(1)).max(100).optional(),
    value: z.json(),
  })
  .passthrough();
const DiaryWriteArgsSchema = z
  .object({
    personalThought: TextishSchema.optional(),
    personal_thought: TextishSchema.optional(),
    summary: TextishSchema,
  })
  .passthrough()
  .superRefine((value, context) => {
    if (value.personal_thought === undefined && value.personalThought === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'diary personal_thought is required',
      });
    }
  });
const WorkerToolArgSchemas = {
  'core.worker_candidate_list': z
    .object({
      limit: z.number().optional(),
      type_filter: TextishSchema.optional(),
    })
    .passthrough(),
  'core.worker_candidate_write': CandidateWriteArgsSchema,
  'core.worker_claim_propose': ClaimProposeArgsSchema,
  'core.worker_diary_write': DiaryWriteArgsSchema,
  'core.worker_emotion_read': z.object({}).passthrough(),
  'core.worker_emotion_update': z
    .object({
      emotions: z.unknown().optional(),
      intensities: z.record(z.string(), z.number()).optional(),
      operation: z.enum(['merge', 'replace']).optional(),
    })
    .passthrough()
    .superRefine((value, context) => {
      if (
        value.operation !== 'replace' &&
        value.intensities === undefined &&
        value.emotions === undefined
      ) {
        context.addIssue({
          code: 'custom',
          message: 'emotion update requires intensities or emotions',
        });
      }
    }),
  'core.worker_memory_insert_archival': z.object({ text: TextishSchema }).passthrough(),
  'core.worker_memory_read': z.object({ block_name: TextishSchema.optional() }).passthrough(),
  'core.worker_memory_search': z.object({ query: TextishSchema }).passthrough(),
  'core.worker_repair_list': z
    .object({ status: z.enum(['open', 'deferred', 'resolved']).optional() })
    .passthrough(),
  'core.worker_repair_transition': z
    .object({
      action: z.enum(['resolve', 'defer']),
      summary: z.string().trim().min(1).max(2_000),
      task_id: z.string().trim().min(1).max(240),
    })
    .passthrough(),
  'core.worker_memory_write': z
    .object({
      block_name: TextishSchema,
      items: z.array(TextishSchema).min(1),
      operation: z.enum(['merge', 'replace']).optional(),
    })
    .passthrough(),
  'core.worker_profile_patch': z
    .object({
      field: z.enum(['tone_preferences', 'interaction_style', 'boundaries', 'active_threads']),
      operation: z.enum(['add', 'remove']).optional(),
      value: TextishSchema,
    })
    .passthrough(),
} satisfies Record<GrilloWorkerToolName, z.ZodType<Record<string, unknown>>>;

const BACKEND_GRILLO_WORKER_RESPONSE_FORMAT: ChatProviderResponseFormat = {
  type: 'json_object',
};

function buildBackendWorkerSystemPrompt() {
  return [
    'You are the private backend GRILLO memory worker for Web Waifu 4.',
    'You are not writing a user-facing chat reply.',
    'Return only JSON matching the schema.',
    'Use worker tools by returning toolCalls. Do not claim a write happened unless you call a write tool.',
    'For every toolCalls item, encode args as a JSON object string. The backend parses and validates it before execution.',
    'Extract durable memory only when the transcript contains a preference, fact, goal, boundary, bond signal, or ongoing thread.',
    'Write diary entries only when the exchange meaningfully changes mood, relationship, goals, or stream context.',
    'Diary personal_thought is private first-person avatar reflection, not a mechanical receipt.',
    'Reflection beats synthesize higher-order insight from clusters of turns and memories; they do not restate isolated facts.',
    'A useful reflection explains what pattern is emerging, what changed emotionally or relationally, and how future replies should adapt.',
    'Use memory_write only for grounded consolidated slots such as open_threads, ongoing_threads, preferences, boundaries, verified_facts, or relationship_state.',
    'Candidate, block, slot, and profile writes remain compatibility projections. Use worker_claim_propose for the canonical claim when a stable subject, predicate, and JSON value are grounded.',
    'For claim evidence, use only canonical turn IDs supplied as source_turn_ids or returned with existing claims. Never invent evidence or claim IDs.',
    '',
    'Available tools:',
    '- core.worker_memory_read args: {"block_name"?: string}',
    '- core.worker_memory_search args: {"query": string, "limit"?: number}',
    '- core.worker_candidate_list args: {"limit"?: number, "type_filter"?: string}',
    '- core.worker_candidate_write args: {"type": "preference|fact|goal|boundary|bond_signal|thread", "content": string, "summary": string, "confidence": number, "tags"?: string[], "source_turn_ids"?: string[]}',
    '- core.worker_claim_propose args: {"kind": "fact|preference|opinion|relationship|decision|goal|boundary|thread|bond_signal", "subject"?: string, "predicate": string, "value": JSON, "confidence"?: number, "evidence_turn_ids"?: string[], "operation"?: "ADD|UPDATE|SUPERSEDE", "supersedes_claim_ids"?: string[]}',
    '- core.worker_diary_write args: {"summary": string, "personal_thought": string, "tags"?: string[], "beat_type"?: string, "source_turn_ids"?: string[]}',
    '- core.worker_memory_write args: {"block_name": string, "items": string[], "operation": "merge|replace", "reason"?: string, "source_candidate_ids"?: string[]}',
    '- core.worker_profile_patch args: {"field": "tone_preferences|interaction_style|boundaries|active_threads", "operation": "add|remove", "value": string}',
    '- core.worker_emotion_read args: {}',
    '- core.worker_emotion_update args: {"intensities": {"emotion_name": number}, "operation"?: "merge|replace", "last_signal_source"?: string}',
    '- core.worker_repair_list args: {"status"?: "open|deferred|resolved"}',
    '- core.worker_repair_transition args: {"task_id": string, "action": "resolve|defer", "summary": string}',
    '- core.worker_memory_insert_archival args: {"text": string}',
    '',
    'First read or search memory if needed. Then call write tools. When finished, return done=true and toolCalls=[].',
  ].join('\n');
}

function buildBackendExtractionPrompt(
  scopeKey: string,
  pairs: Array<{ assistant: Record<string, unknown>; user: Record<string, unknown> }>,
) {
  const transcript = pairs
    .map((pair, index) => {
      const sourceTurnIds = [recordTurnId(pair.user), recordTurnId(pair.assistant)].filter(Boolean);
      return [
        `Pair ${index + 1}`,
        `source_turn_ids: ${JSON.stringify(sourceTurnIds)}`,
        `participant_key: ${recordParticipantKey(pair.user) || defaultParticipantKey(scopeKey)}`,
        formatExtractionPairForTrace(pair),
      ].join('\n');
    })
    .join('\n\n');
  return [
    `scopeKey: ${scopeKey}`,
    `currentTimeMs: ${Date.now()}`,
    '',
    'Completed turn pairs to process:',
    transcript,
    '',
    'Write only memories grounded in these turns. For each durable candidate, also call core.worker_claim_propose when you can state a stable subject, predicate, and JSON value. Use the supplied source_turn_ids as evidence_turn_ids. If nothing durable is present, return done=true with no tool calls.',
  ].join('\n');
}

function buildBackendBeatPrompt({
  beatType,
  contextPacket,
  recentTurns,
  scopeKey,
}: {
  beatType: string;
  contextPacket: GrilloContextPacket;
  recentTurns: Array<Record<string, unknown>>;
  scopeKey: string;
}) {
  const taskLines =
    beatType === 'relationship'
      ? [
          'This is a relationship beat.',
          'Review durable relationship_memory, recalled_memories, thoughts, and recent channel_history.',
          'Use core.worker_memory_read or core.worker_memory_search if you need more context.',
          'Write private diary reflection if the relationship/mood changed.',
          'Use core.worker_memory_write with block_name="relationship_state" for grounded relationship updates.',
          'Use core.worker_profile_patch for grounded boundaries, interaction_style, tone_preferences, or active_threads.',
        ]
      : beatType === 'consolidation'
        ? [
            'This is a consolidation beat.',
            'Review candidates, slots, blocks, thoughts, recalled_memories, and recent channel_history.',
            'Use core.worker_candidate_list, core.worker_memory_read, or core.worker_memory_search before writing if useful.',
            'Promote repeated or high-confidence grounded candidates into durable memory slots or blocks.',
            'Use core.worker_memory_write with operation="merge" for durable preferences, boundaries, verified_facts, relationship_state, or ongoing_threads.',
            'Write a diary reflection only if the consolidation changes the private interpretation of the relationship or persona context.',
            'Do not delete raw records during consolidation.',
          ]
        : beatType === 'curiosity'
          ? [
              'This is a curiosity beat.',
              'Review recent channel_history, thoughts, recalled_memories, relationship_memory, and open threads.',
              'Identify useful unresolved questions, interests, or follow-up threads that would improve future replies.',
              'Use core.worker_memory_read or core.worker_memory_search before writing if useful.',
              'Use core.worker_memory_write for grounded open_threads, ongoing_threads, or working_scratchpad updates.',
              'Use core.worker_profile_patch for grounded active_threads only when the curiosity is tied to a participant or relationship.',
              'Do not trigger external actions, messages, searches, or autonomous speech from this beat.',
            ]
          : beatType === 'tag_elaboration'
            ? [
                'This is a tag elaboration beat.',
                'Review candidates, recalled_memories, slots, and recent channel_history for weakly organized memory.',
                'Use core.worker_candidate_list to inspect candidate types and tags before writing if useful.',
                'Write concise tag-organized summaries into durable slots or blocks when they improve future retrieval.',
                'Use core.worker_candidate_write only for newly clarified grounded facts, preferences, goals, boundaries, bond signals, or threads.',
                'Use core.worker_memory_write with operation="merge" for grouped preferences, boundaries, verified_facts, relationship_state, or ongoing_threads.',
                'Do not invent tags or summaries that are not grounded in existing memory or recent turns.',
              ]
        : beatType === 'compaction'
          ? [
              'This is a compaction beat.',
              'Review noisy open_threads, working_scratchpad, recalled_memories, thoughts, and recent channel_history.',
              'Use core.worker_memory_read or core.worker_memory_search to find redundant or stale working memory.',
              'Compact noisy or overlapping memory into concise durable memory slots or blocks.',
              'Use core.worker_memory_write with operation="replace" only when the replacement is clearly grounded and shorter.',
              'Use core.worker_memory_insert_archival only for valuable long-form context that should stay searchable but not prompt-visible.',
              'Do not delete raw records during compaction.',
            ]
          : [
              'This is a reflection beat.',
              'Synthesize higher-order insight, not a literal transcript summary.',
              'Compare recent channel_history with thoughts, recalled_memories, relationship_memory, and emotion state.',
              'Look for repeated patterns: user preferences, recurring tension, trust or guard shifts, unresolved goals, bits that should continue, and community mood.',
              'Use core.worker_emotion_read first when emotional continuity is relevant.',
              'Use core.worker_memory_search before writing if a pattern may already exist.',
              'Write a diary reflection only when you can state what the pattern means for future replies.',
              'Use core.worker_memory_write with block_name="relationship_state", "ongoing_threads", or "tone_preferences" only for grounded higher-order insights.',
              'Do not write diary text that only says what happened; write why it matters.',
            ];
  return [
    `scopeKey: ${scopeKey}`,
    `beatType: ${beatType}`,
    '',
    ...taskLines,
    '',
    'Canonical GRILLO context packet:',
    JSON.stringify(
      {
        background_information: contextPacket.background_information,
        channel_history: contextPacket.channel_history.slice(-10),
        output_description: contextPacket.output_description,
        recalled_memories: contextPacket.recalled_memories.slice(0, 8),
        relationship_memory: contextPacket.relationship_memory.slice(0, 12),
        thoughts: contextPacket.thoughts.slice(0, 8),
      },
      null,
      2,
    ),
    '',
    'Recent turn ids:',
    JSON.stringify(recentTurns.map((turn) => ({
      id: recordTurnId(turn),
      participantKey: recordParticipantKey(turn),
      role: recordRole(turn),
      text: compactText(normalizeText(turn['content'] ?? turn['text']), 220),
    }))),
    '',
    'If there is nothing useful to write, return done=true with no toolCalls.',
  ].join('\n');
}

function buildBackendWorkerDebriefPrompt({
  candidateWrites,
  diaryWrites,
  pairs,
  writes,
}: {
  candidateWrites: number;
  diaryWrites: number;
  pairs: Array<{ assistant: Record<string, unknown>; user: Record<string, unknown> }>;
  writes: number;
}) {
  return [
    'Debrief recovery:',
    `The worker reached done with writes=${writes}, candidateWrites=${candidateWrites}, diaryWrites=${diaryWrites}.`,
    'Re-audit the completed turn pairs once.',
    'If there is any durable preference, fact, goal, boundary, bond signal, or ongoing thread, call core.worker_candidate_write.',
    'If the exchange meaningfully affects relationship, mood, trust, stream context, or the avatar should privately reflect on it, call core.worker_diary_write.',
    'If a consolidated slot is clearly grounded, call core.worker_memory_write after candidate_write.',
    'If there is truly nothing durable or reflective here, return done=true with no toolCalls.',
    '',
    'Turn pairs:',
    pairs.map(formatExtractionPairForTrace).join('\n\n'),
  ].join('\n');
}

function shouldRunWorkerDebriefRecovery({
  candidateWrites,
  diaryWrites,
  pairs,
  writes,
}: {
  candidateWrites: number;
  diaryWrites: number;
  pairs: Array<{ assistant: Record<string, unknown>; user: Record<string, unknown> }>;
  writes: number;
}) {
  if (pairs.length === 0) {
    return false;
  }
  return writes === 0 || candidateWrites === 0 || diaryWrites === 0;
}

function parseWorkerJson(rawText: string): Record<string, unknown> {
  const parsed = safeJsonParse(rawText);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parseWorkerResponseRecord(parsed);
  }
  const start = rawText.indexOf('{');
  const end = rawText.lastIndexOf('}');
  if (start !== -1 && end > start) {
    const objectText = rawText.slice(start, end + 1);
    const objectParsed = safeJsonParse(objectText);
    if (objectParsed && typeof objectParsed === 'object' && !Array.isArray(objectParsed)) {
      return parseWorkerResponseRecord(objectParsed);
    }
  }
  return {};
}

function parseWorkerResponseRecord(value: unknown): Record<string, unknown> {
  const parsed = WorkerResponseSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

function normalizeWorkerToolCalls(
  parsed: Record<string, unknown>,
  sourceTurnIds: string[],
): NormalizedWorkerToolCall[] {
  const calls: NormalizedWorkerToolCall[] = [];
  for (const item of Array.isArray(parsed['toolCalls']) ? parsed['toolCalls'] : []) {
    const parsedCall = WorkerToolCallSchema.safeParse(item);
    if (!parsedCall.success) {
      continue;
    }
    const name = parsedCall.data.name;
    const rawArgs = parsedCall.data.args;
    const args = validateWorkerToolArgs(
      name,
      typeof rawArgs === 'string' ? asRecord(safeJsonParse(rawArgs)) : rawArgs ?? {},
    );
    if (!args) continue;
    calls.push({
      args: withSourceTurnIds(name, args, sourceTurnIds),
      name,
    });
  }

  for (const item of Array.isArray(parsed['tool_calls']) ? parsed['tool_calls'] : []) {
    const parsedCall = OpenAiWorkerToolCallSchema.safeParse(item);
    if (!parsedCall.success) {
      continue;
    }
    const record = parsedCall.data;
    const fn = record.function ?? {};
    const parsedName = WorkerToolNameSchema.safeParse(fn.name ?? record.name);
    if (!parsedName.success) {
      continue;
    }
    const rawArgs = fn.arguments ?? record.arguments ?? record.args;
    const args =
      typeof rawArgs === 'string'
        ? asRecord(safeJsonParse(rawArgs))
        : asRecord(rawArgs);
    const validArgs = validateWorkerToolArgs(parsedName.data, args);
    if (!validArgs) continue;
    calls.push({
      args: withSourceTurnIds(parsedName.data, validArgs, sourceTurnIds),
      name: parsedName.data,
    });
  }

  const candidate = asRecord(parsed['candidate']);
  const candidateArgs = validateWorkerToolArgs('core.worker_candidate_write', candidate);
  if (candidateArgs) {
    calls.push({
      args: withSourceTurnIds('core.worker_candidate_write', candidateArgs, sourceTurnIds),
      name: 'core.worker_candidate_write',
    });
  }

  const diary = asRecord(parsed['diary']);
  const diaryArgs = validateWorkerToolArgs('core.worker_diary_write', diary);
  if (diaryArgs) {
    calls.push({
      args: withSourceTurnIds('core.worker_diary_write', diaryArgs, sourceTurnIds),
      name: 'core.worker_diary_write',
    });
  }

  const memory = asRecord(parsed['memory']);
  const memoryArgs = validateWorkerToolArgs('core.worker_memory_write', memory);
  if (memoryArgs) {
    calls.push({
      args: memoryArgs,
      name: 'core.worker_memory_write',
    });
  }

  return calls.slice(0, 12);
}

function validateWorkerToolArgs(name: GrilloWorkerToolName, args: Record<string, unknown>) {
  const parsed = WorkerToolArgSchemas[name].safeParse(args);
  return parsed.success ? parsed.data : null;
}

function withSourceTurnIds(
  name: GrilloWorkerToolName,
  args: Record<string, unknown>,
  sourceTurnIds: string[],
) {
  if (
    (name === 'core.worker_candidate_write' || name === 'core.worker_diary_write') &&
    readStringArray(args['source_turn_ids']).length === 0 &&
    sourceTurnIds.length > 0
  ) {
    return {
      ...args,
      source_turn_ids: sourceTurnIds,
    };
  }
  if (
    name === 'core.worker_claim_propose' &&
    readStringArray(args['evidence_turn_ids']).length === 0 &&
    sourceTurnIds.length > 0
  ) {
    return {
      ...args,
      evidence_turn_ids: sourceTurnIds,
    };
  }
  return args;
}

function isWorkerWriteTool(name: GrilloWorkerToolName) {
  return (
    name === 'core.worker_candidate_write' ||
    name === 'core.worker_claim_propose' ||
    name === 'core.worker_diary_write' ||
    name === 'core.worker_memory_write' ||
    name === 'core.worker_profile_patch' ||
    name === 'core.worker_emotion_update' ||
    name === 'core.worker_repair_transition' ||
    name === 'core.worker_memory_insert_archival'
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function workerScopeState(state: Record<string, unknown>, scopeKey: string) {
  const scopes = asRecord(state['scopes']);
  const scoped = asRecord(scopes[scopeKey]);
  if (Object.keys(scoped).length > 0) return scoped;
  const legacyScopeKey = normalizeText(state['scopeKey'] ?? state['scope_key']);
  if (!legacyScopeKey || legacyScopeKey === scopeKey) return state;
  return {};
}

function normalizeText(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeKey(value: unknown, fallback: string) {
  return normalizeText(value) || fallback;
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => normalizeText(item)).filter(Boolean).slice(0, 24)
    : [];
}

function readEmotionArray(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((item) => asRecord(item))
        .map((item) => ({
          intensity: clampNumber(item['intensity'], 0, 10, 0),
          name: normalizeText(item['name']),
        }))
        .filter((item) => item.name)
        .slice(0, 12)
    : [];
}

function readEmotionIntensityMap(value: unknown) {
  const source = typeof value === 'string' ? safeJsonParse(value) : value;
  if (Array.isArray(source)) {
    const intensities: Record<string, number> = {};
    for (const item of source) {
      const record = asRecord(item);
      const name = normalizeText(record['name']);
      const intensity = clampNumber(record['intensity'], 0, 10, 0);
      if (!name || !Number.isFinite(intensity)) continue;
      intensities[name] = intensity;
    }
    return intensities;
  }
  if (!source || typeof source !== 'object') {
    return {};
  }
  const intensities: Record<string, number> = {};
  for (const [name, rawIntensity] of Object.entries(source as Record<string, unknown>)) {
    const normalizedName = normalizeText(name);
    const intensity = clampNumber(rawIntensity, 0, 10, 0);
    if (!normalizedName || !Number.isFinite(intensity)) continue;
    intensities[normalizedName] = intensity;
  }
  return intensities;
}

function toWorkerEmotionState(record: Record<string, unknown> | LadybugEmotionStateRecord) {
  const row = record as unknown as Record<string, unknown>;
  return {
    emotion_state_id: normalizeText(
      row['emotion_state_id'] ?? row['emotionStateId'] ?? row['id'],
    ),
    intensities: readEmotionIntensityMap(row['intensities'] ?? row['intensities_json']),
    last_signal_at: normalizeText(row['last_signal_at'] ?? row['lastSignalAt']),
    last_signal_source: normalizeText(row['last_signal_source'] ?? row['lastSignalSource']),
    scope_key: recordScopeKey(row),
    updated_at: normalizeText(row['updated_at'] ?? row['updatedAt']),
  };
}

function readJsonArray(value: unknown) {
  const parsed = typeof value === 'string' ? safeJsonParse(value) : value;
  return Array.isArray(parsed) ? parsed.map((item) => normalizeText(item)).filter(Boolean) : [];
}

function numberOrNow(value: unknown, nowMs: () => number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : nowMs();
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, numeric));
}

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  return Math.trunc(clampNumber(value, min, max, fallback));
}

function inferSource(scopeKey: string) {
  return scopeKey.split(':')[0] || 'local';
}

function inferChannel(scopeKey: string) {
  return scopeKey.split(':')[1] || 'local';
}

function inferPersona(scopeKey: string) {
  return scopeKey.split(':').slice(2).join(':') || 'default';
}

function defaultParticipantKey(scopeKey: string) {
  return `${inferSource(scopeKey)}:${inferChannel(scopeKey)}:local`;
}

function recordScopeKey(record: Record<string, unknown>) {
  return normalizeText(record['scopeKey'] ?? record['scope_key'] ?? record['user_id']);
}

function recordParticipantKey(record: Record<string, unknown>) {
  return normalizeText(record['participantKey'] ?? record['participant_key']);
}

function semanticRecordMatchesParticipants(
  record: LadybugSemanticMemoryRecord,
  participantSet: Set<string>,
) {
  if (participantSet.size === 0) {
    return true;
  }
  const recordParticipantKeys = readStringArray(record.participantKeys);
  if (recordParticipantKeys.length === 0) {
    return record.scopeKey.startsWith('local:');
  }
  return recordParticipantKeys.some((key) =>
    participantSet.has(key.toLowerCase()),
  );
}

function recordTurnId(record: Record<string, unknown>) {
  return normalizeText(record['turnId'] ?? record['turn_id'] ?? record['id']);
}

function recordRole(record: Record<string, unknown>) {
  return normalizeText(record['role']).toLowerCase();
}

function workerParticipantMatches(record: Record<string, unknown>, participantKey: string) {
  const recordParticipant = recordParticipantKey(record);
  return !recordParticipant || !participantKey || recordParticipant === participantKey;
}

function recordTimestamp(record: Record<string, unknown>) {
  return numberOrNow(record['createdAt'] ?? record['created_at'] ?? record['timestamp'], () => 0);
}

function recordUpdatedAt(record: Record<string, unknown>) {
  return numberOrNow(record['updatedAt'] ?? record['updated_at'] ?? recordTimestamp(record), () => 0);
}

function formatTurnEventItem(record: Record<string, unknown>): ServerProvenanceItem {
  const role = normalizeText(record['role']) || 'user';
  const author = normalizeText(record['authorName'] ?? record['author_name']) || role;
  const source = normalizeText(record['source']);
  const channel = normalizeText(record['channelId'] ?? record['channel_id']);
  const text = normalizeText(record['content'] ?? record['text']);
  const metadata = [
    source ? `source=${source}` : '',
    channel ? `channel=${channel}` : '',
    `role=${role}`,
    recordParticipantKey(record) ? `participant=${recordParticipantKey(record)}` : '',
  ]
    .filter(Boolean)
    .join(' ');
  return {
    id: recordTurnId(record)
      ? `turn:${recordTurnId(record)}`
      : provenanceFallbackId(record, 'turn'),
    text: `${author}: ${text}${metadata ? `\nmetadata: ${metadata}` : ''}`,
  };
}

function formatDiaryEntryItem(record: Record<string, unknown>): ServerProvenanceItem {
  const beatType = normalizeText(record['beatType'] ?? record['beat_type']) || 'reflection';
  const participantKey = recordParticipantKey(record) || 'unknown';
  const thought = normalizeText(record['personalThought'] ?? record['personal_thought']);
  const summary = normalizeText(record['summary']);
  return {
    id: provenanceRecordId(record, 'diary', ['diaryId', 'diary_id', 'id']),
    text: `[diary:${beatType} ${participantKey}] ${thought || summary}`,
  };
}

function formatProjectedClaimItem(claim: GrilloProjectedClaim): ServerProvenanceItem {
  const corrected = claim.status === 'corrected' ? ' (corrected)' : '';
  return {
    id: `claim:${claim.claimId}`,
    text: `[claim:${claim.kind} ${claim.participantKey ?? 'scope'}] ${claim.subject}.${claim.predicate} = ${JSON.stringify(claim.effectiveValue)}${corrected}`,
  };
}

function provenanceRecordId(
  record: Record<string, unknown>,
  prefix: string,
  keys: string[],
) {
  const sourceId = keys.map((key) => normalizeText(record[key])).find(Boolean);
  return sourceId ? `${prefix}:${sourceId}` : provenanceFallbackId(record, prefix);
}

function provenanceFallbackId(record: Record<string, unknown>, prefix: string) {
  const stableEntries = Object.keys(record)
    .sort()
    .map((key) => [key, record[key]]);
  const digest = createHash('sha256')
    .update(JSON.stringify([prefix, stableEntries]))
    .digest('hex')
    .slice(0, 24);
  return `${prefix}:fallback:${digest}`;
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeCandidateType(value: unknown) {
  const normalized = normalizeText(value);
  return ['preference', 'fact', 'goal', 'boundary', 'bond_signal', 'thread'].includes(normalized)
    ? normalized
    : 'thread';
}

function workerToolWriteCount(name: GrilloWorkerToolName, result: unknown) {
  if (!isWorkerWriteTool(name)) return 0;
  if (name !== 'core.worker_claim_propose') return 1;
  return normalizeText(asRecord(result)['outcome']) === 'applied' ? 1 : 0;
}

function normalizeClaimKind(value: unknown): GrilloClaimInput['kind'] {
  const normalized = normalizeText(value);
  if (
    normalized === 'fact' ||
    normalized === 'preference' ||
    normalized === 'opinion' ||
    normalized === 'relationship' ||
    normalized === 'decision' ||
    normalized === 'goal' ||
    normalized === 'boundary' ||
    normalized === 'thread' ||
    normalized === 'bond_signal'
  ) {
    return normalized;
  }
  return 'fact';
}

function normalizeClaimOperation(value: unknown): GrilloClaimInput['operation'] {
  const normalized = normalizeText(value).toUpperCase();
  if (normalized === 'UPDATE' || normalized === 'SUPERSEDE') return normalized;
  return normalized === 'ADD' ? 'ADD' : undefined;
}

function normalizeSlotOperation(value: unknown): LadybugMemorySlotPatchRecord['operation'] {
  const normalized = normalizeText(value);
  if (normalized === 'set' || normalized === 'remove') {
    return normalized;
  }
  return 'merge';
}

function normalizeWorkerBeatType(value: unknown) {
  const normalized = normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_');
  if (
    normalized === 'reflection' ||
    normalized === 'relationship' ||
    normalized === 'consolidation' ||
    normalized === 'compaction' ||
    normalized === 'curiosity' ||
    normalized === 'tag_elaboration' ||
    normalized === 'semantic_indexing'
  ) {
    return normalized;
  }
  return 'extraction';
}

function buildUnprocessedTurnPairs(
  turns: Array<Record<string, unknown>>,
  processedTurnIds: Set<string>,
) {
  const pairs: Array<{ assistant: Record<string, unknown>; user: Record<string, unknown> }> = [];
  for (let index = 0; index < turns.length; index += 1) {
    const user = turns[index];
    if (!user) {
      continue;
    }
    const userTurnId = recordTurnId(user);
    if (recordRole(user) !== 'user' || !userTurnId || processedTurnIds.has(userTurnId)) {
      continue;
    }
    const assistant = turns
      .slice(index + 1)
      .find((candidate) => recordRole(candidate) === 'assistant' && !processedTurnIds.has(recordTurnId(candidate)));
    if (!assistant) {
      continue;
    }
    pairs.push({ assistant, user });
  }
  return pairs;
}

function formatExtractionPairForTrace(pair: {
  assistant: Record<string, unknown>;
  user: Record<string, unknown>;
}) {
  const author = normalizeText(pair.user['authorName'] ?? pair.user['author_name']) || 'User';
  const assistant = normalizeText(pair.assistant['authorName'] ?? pair.assistant['author_name']) || 'Assistant';
  return [
    `${author}: ${compactText(normalizeText(pair.user['content'] ?? pair.user['text']), 600)}`,
    `${assistant}: ${compactText(normalizeText(pair.assistant['content'] ?? pair.assistant['text']), 600)}`,
  ].join('\n');
}

function formatSemanticIndexingPair(pair: {
  assistant: Record<string, unknown>;
  user: Record<string, unknown>;
}) {
  const assistant = normalizeText(pair.assistant['authorName'] ?? pair.assistant['author_name']) || 'Assistant';
  return [
    `User: ${normalizeSemanticIndexText(pair.user, 1200)}`,
    `${assistant}: ${normalizeSemanticIndexText(pair.assistant, 1200)}`,
  ]
    .filter((line) => !line.endsWith(': '))
    .join('\n')
    .slice(0, 2400);
}

function normalizeSemanticIndexText(record: Record<string, unknown>, maxLength: number) {
  return normalizeText(record['content'] ?? record['text']).slice(0, maxLength);
}

function normalizeEmbeddingResult(value: GrilloWorkerEmbeddingResult) {
  if (Array.isArray(value)) {
    return {
      embedding: normalizeEmbeddingArray(value),
      model: '',
      provider: '',
    };
  }
  const record = asRecord(value);
  return {
    embedding: normalizeEmbeddingArray(record['embedding']),
    model: normalizeText(record['model']),
    provider: normalizeText(record['provider']),
  };
}

function normalizeEmbeddingArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item))
    : [];
}

function compactText(value: string, maxLength: number) {
  const normalized = normalizeText(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

const WORKER_TOOL_NAMES = new Set<GrilloWorkerToolName>(WORKER_TOOL_NAME_VALUES);

function isWorkerToolName(value: string): value is GrilloWorkerToolName {
  return WORKER_TOOL_NAMES.has(value as GrilloWorkerToolName);
}

const MEMORY_BLOCK_NAMES = new Set([
  'preferences',
  'boundaries',
  'relationship_state',
  'ongoing_threads',
  'verified_facts',
  'open_threads',
  'core_identity',
  'working_scratchpad',
]);

function normalizeMemoryBlockName(value: unknown) {
  const normalized = normalizeText(value);
  return MEMORY_BLOCK_NAMES.has(normalized) ? normalized : '';
}

function normalizeProfilePatchField(value: unknown) {
  const normalized = normalizeText(value);
  return ['tone_preferences', 'interaction_style', 'boundaries', 'active_threads'].includes(normalized)
    ? normalized
    : '';
}

function dedupeStrings(items: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const normalized = normalizeText(item);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function lexicalScore(text: string, query: string) {
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase().trim();
  if (!needle) {
    return 0;
  }
  let score = haystack.includes(needle) ? 1 : 0;
  for (const part of needle.split(/\s+/).filter(Boolean)) {
    if (haystack.includes(part)) {
      score += 0.2;
    }
  }
  return score;
}

function summarizeToolArgs(args: Record<string, unknown>) {
  const keys = Object.keys(args).sort();
  return keys
    .slice(0, 8)
    .map((key) => `${key}=${summarizeToolValue(args[key])}`)
    .join(' ');
}

function summarizeToolValue(value: unknown) {
  if (Array.isArray(value)) {
    return `[${value.length}]`;
  }
  if (value && typeof value === 'object') {
    return '{object}';
  }
  return normalizeText(value).slice(0, 80);
}

function truncateToolResult(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.slice(0, 1200);
  }
  if (Array.isArray(value)) {
    return value.slice(0, 10).map(truncateToolResult);
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value).slice(0, 20)) {
      result[key] = truncateToolResult(item);
    }
    return result;
  }
  return value;
}
