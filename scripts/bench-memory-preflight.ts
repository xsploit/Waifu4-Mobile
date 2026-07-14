import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { GrilloWorkerService } from '../server/memory/GrilloWorkerService.js';
import { LadybugMemoryService } from '../server/memory/LadybugMemoryService.js';

const scopeKey = 'local:persona:benchmark';
const dbPath = join(tmpdir(), `webwaifu4-memory-benchmark-${process.pid}-${Date.now()}.db`);
const memory = new LadybugMemoryService(dbPath);
let nextId = 0;
const grillo = new GrilloWorkerService(
  memory,
  () => Date.now(),
  () => `benchmark-turn-${++nextId}`,
);

async function timed(run: () => Promise<unknown>) {
  const startedAt = performance.now();
  await run();
  return performance.now() - startedAt;
}

async function average(samples: number, run: () => Promise<unknown>) {
  const durations: number[] = [];
  for (let index = 0; index < samples; index += 1) durations.push(await timed(run));
  return durations.reduce((sum, duration) => sum + duration, 0) / durations.length;
}

try {
  for (let index = 0; index < 1_000; index += 1) {
    await memory.appendGrilloRecord('evidence_records', {
      content: `Benchmark evidence ${index}`,
      createdAt: index + 1,
      id: `benchmark-evidence-${index}`,
      kind: 'turn',
      metadata: {},
      role: index % 2 === 0 ? 'user' : 'assistant',
      scopeKey,
      source: 'local',
      sourceRecordIds: [],
    });
  }
  for (let index = 0; index < 64; index += 1) {
    await memory.appendGrilloRecord('memory_claims', {
      confidence: 0.8 + (index % 10) / 100,
      createdAt: index + 1,
      evidenceIds: [`benchmark-evidence-${index}`],
      id: `benchmark-claim-${index}`,
      kind: 'fact',
      operation: 'ADD',
      participantKey: index % 3 === 0 ? undefined : 'local:local:benchmark',
      predicate: `benchmark_fact_${index}`,
      scopeKey,
      subject: 'benchmark',
      supersedesRecordIds: [],
      validFrom: index + 1,
      validTo: null,
      value: `value-${index}`,
    });
  }

  const buildPacket = () => grillo.buildContextPacket({ scopeKey });
  const coldMs = await timed(buildPacket);
  const warmMs = await average(10, buildPacket);
  await grillo.ingestTurnPair({
    assistantText: 'The new turn should not invalidate the stable claim projection.',
    participantKey: 'local:local:benchmark',
    scopeKey,
    source: 'local',
    userText: 'Measure context latency after ordinary chat evidence arrives.',
  });
  const afterChatMs = await average(10, buildPacket);

  console.table([
    {
      afterChatMs: afterChatMs.toFixed(2),
      claims: 64,
      coldMs: coldMs.toFixed(2),
      evidence: 1_002,
      warmMs: warmMs.toFixed(2),
    },
  ]);
} finally {
  await memory.close();
  await Promise.all([
    rm(dbPath, { force: true }),
    rm(`${dbPath}.wal`, { force: true }),
    rm(`${dbPath}.json`, { force: true }),
  ]);
}
