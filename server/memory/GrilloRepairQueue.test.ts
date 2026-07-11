import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { GrilloRepairQueue } from './GrilloRepairQueue';
import { LadybugMemoryService } from './LadybugMemoryService';

const paths: string[] = [];

afterEach(async () => {
  const { rm } = await import('node:fs/promises');
  await Promise.all(paths.splice(0).map((path) => rm(path, { force: true, recursive: true })));
});

describe('GrilloRepairQueue', () => {
  it('replays immutable queue events into scoped task state', async () => {
    const dbPath = join(tmpdir(), `webwaifu4-repair-queue-${process.pid}-${Date.now()}.db`);
    paths.push(dbPath, `${dbPath}.json`);
    const memory = new LadybugMemoryService(dbPath);
    let now = 10;
    const queue = new GrilloRepairQueue(memory, { nowMs: () => now++ });
    try {
      await queue.enqueue({
        id: 'event:enqueue',
        taskId: 'repair:evidence:feedback',
        scopeKey: 'local:persona:hikari-chan',
        participantKey: 'local:local:subsect',
        signalKind: 'feedback',
        summary: 'The answer ignored a remembered preference.',
        evidenceIds: ['evidence:feedback'],
        sourceRecordIds: ['turn:user', 'turn:assistant'],
      });
      await queue.transition({
        action: 'defer',
        id: 'event:defer',
        taskId: 'repair:evidence:feedback',
        scopeKey: 'local:persona:hikari-chan',
        participantKey: 'local:local:subsect',
        signalKind: 'feedback',
        summary: 'Needs another corroborating turn.',
        evidenceIds: ['evidence:feedback'],
        sourceRecordIds: ['turn:assistant'],
      });
      await queue.enqueue({
        id: 'event:other-scope',
        taskId: 'repair:evidence:twitch',
        scopeKey: 'twitch:other-channel:hikari-chan',
        signalKind: 'unresolved_question',
        summary: 'A Twitch question remains open.',
        evidenceIds: [],
        sourceRecordIds: ['turn:twitch'],
      });

      expect(await queue.list('local:persona:hikari-chan')).toEqual([
        expect.objectContaining({
          taskId: 'repair:evidence:feedback',
          status: 'deferred',
          eventIds: ['event:enqueue', 'event:defer'],
          sourceRecordIds: ['turn:user', 'turn:assistant'],
        }),
      ]);
      expect(await queue.list('local:persona:hikari-chan', 'open')).toEqual([]);
      expect(await queue.list('twitch:other-channel:hikari-chan', 'open')).toHaveLength(1);
    } finally {
      await memory.close();
    }
  });

  it('ignores orphan transitions and malformed stored events', async () => {
    const dbPath = join(tmpdir(), `webwaifu4-repair-invalid-${process.pid}-${Date.now()}.db`);
    paths.push(dbPath, `${dbPath}.json`);
    const memory = new LadybugMemoryService(dbPath);
    const queue = new GrilloRepairQueue(memory);
    try {
      await memory.appendGrilloRecord('repair_queue_events', {
        id: 'event:orphan',
        taskId: 'repair:missing',
        scopeKey: 'local:persona:hikari-chan',
        action: 'resolve',
        signalKind: 'feedback',
        summary: 'No enqueue exists.',
        evidenceIds: [],
        sourceRecordIds: [],
        createdAt: 1,
      });
      await memory.appendGrilloRecord('repair_queue_events', {
        id: 'event:bad',
        scopeKey: 'local:persona:hikari-chan',
        createdAt: 2,
      });
      expect(await queue.list('local:persona:hikari-chan')).toEqual([]);
    } finally {
      await memory.close();
    }
  });
});
