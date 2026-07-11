import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { LadybugMemoryService } from './LadybugMemoryService.js';

const idSchema = z.string().trim().min(1).max(240);
const scopeKeySchema = z.string().trim().min(1).max(180);

const repairQueueEventSchema = z.object({
  id: idSchema,
  taskId: idSchema,
  scopeKey: scopeKeySchema,
  participantKey: z.string().trim().max(180).optional(),
  action: z.enum(['enqueue', 'resolve', 'defer']),
  signalKind: z.enum([
    'correction',
    'feedback',
    'weak_grounding',
    'missing_lane',
    'dropped_evidence',
    'unresolved_question',
  ]),
  summary: z.string().trim().min(1).max(2_000),
  evidenceIds: z.array(idSchema).max(100).default([]),
  sourceRecordIds: z.array(idSchema).max(100).default([]),
  createdAt: z.number().int().nonnegative(),
});

export type GrilloRepairQueueEvent = z.infer<typeof repairQueueEventSchema>;
export type GrilloRepairTask = {
  taskId: string;
  scopeKey: string;
  participantKey?: string;
  signalKind: GrilloRepairQueueEvent['signalKind'];
  summary: string;
  evidenceIds: string[];
  sourceRecordIds: string[];
  status: 'open' | 'resolved' | 'deferred';
  createdAt: number;
  updatedAt: number;
  eventIds: string[];
};

type QueueOptions = {
  nowMs?: () => number;
  idFactory?: () => string;
};

export class GrilloRepairQueue {
  private readonly nowMs: () => number;
  private readonly idFactory: () => string;

  constructor(
    private readonly memory: LadybugMemoryService,
    options: QueueOptions = {},
  ) {
    this.nowMs = options.nowMs ?? (() => Date.now());
    this.idFactory = options.idFactory ?? (() => randomUUID());
  }

  enqueue(
    input: Omit<GrilloRepairQueueEvent, 'action' | 'createdAt' | 'id'> &
      Partial<Pick<GrilloRepairQueueEvent, 'createdAt' | 'id'>>,
  ) {
    return this.append({ ...input, action: 'enqueue' });
  }

  transition(input: {
    action: 'resolve' | 'defer';
    evidenceIds?: string[];
    id?: string;
    participantKey?: string;
    scopeKey: string;
    signalKind: GrilloRepairQueueEvent['signalKind'];
    sourceRecordIds?: string[];
    summary: string;
    taskId: string;
  }) {
    return this.append({
      ...input,
      evidenceIds: input.evidenceIds ?? [],
      sourceRecordIds: input.sourceRecordIds ?? [],
    });
  }

  async list(scopeKey: string, status?: GrilloRepairTask['status']) {
    const normalizedScopeKey = scopeKeySchema.parse(scopeKey);
    const raw = await this.memory.readGrilloRecords<Record<string, unknown>>('repair_queue_events');
    const events = raw
      .map((record) => repairQueueEventSchema.safeParse(record))
      .filter((result): result is z.ZodSafeParseSuccess<GrilloRepairQueueEvent> => result.success)
      .map((result) => result.data)
      .filter((event) => event.scopeKey === normalizedScopeKey)
      .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id));
    const tasks = new Map<string, GrilloRepairTask>();
    for (const event of events) {
      const previous = tasks.get(event.taskId);
      if (!previous && event.action !== 'enqueue') continue;
      if (!previous) {
        tasks.set(event.taskId, {
          taskId: event.taskId,
          scopeKey: event.scopeKey,
          ...(event.participantKey ? { participantKey: event.participantKey } : {}),
          signalKind: event.signalKind,
          summary: event.summary,
          evidenceIds: event.evidenceIds,
          sourceRecordIds: event.sourceRecordIds,
          status: 'open',
          createdAt: event.createdAt,
          updatedAt: event.createdAt,
          eventIds: [event.id],
        });
        continue;
      }
      tasks.set(event.taskId, {
        ...previous,
        summary: event.summary,
        evidenceIds: unique([...previous.evidenceIds, ...event.evidenceIds]),
        sourceRecordIds: unique([...previous.sourceRecordIds, ...event.sourceRecordIds]),
        status: event.action === 'resolve' ? 'resolved' : event.action === 'defer' ? 'deferred' : 'open',
        updatedAt: event.createdAt,
        eventIds: [...previous.eventIds, event.id],
      });
    }
    return [...tasks.values()]
      .filter((task) => !status || task.status === status)
      .sort((left, right) => right.updatedAt - left.updatedAt || left.taskId.localeCompare(right.taskId));
  }

  private async append(
    input: Omit<GrilloRepairQueueEvent, 'createdAt' | 'id'> &
      Partial<Pick<GrilloRepairQueueEvent, 'createdAt' | 'id'>>,
  ) {
    const event = repairQueueEventSchema.parse({
      ...input,
      id: input.id ?? `repair-event:${this.idFactory()}`,
      createdAt: input.createdAt ?? this.nowMs(),
      evidenceIds: unique(input.evidenceIds ?? []),
      sourceRecordIds: unique(input.sourceRecordIds ?? []),
    });
    await this.memory.appendGrilloRecord('repair_queue_events', event);
    return event;
  }
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
