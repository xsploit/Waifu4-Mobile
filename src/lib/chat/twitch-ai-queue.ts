import type { ChatTurn } from './chat-turn';

export const TWITCH_AI_QUEUE_MAX_PENDING_JOBS = 8;
export const TWITCH_AI_QUEUE_MAX_BATCH_MESSAGES = 120;

export type TwitchAiQueueJob = {
  id: string;
  mode: 'direct' | 'batch';
  activeChatterCount: number;
  context: ChatTurn[];
  firstTimeChatter?: boolean;
  messages: ChatTurn[];
};

export type TwitchAiQueueBackpressureResult = {
  coalescedBatch: boolean;
  droppedJobs: TwitchAiQueueJob[];
  droppedMessageCount: number;
  maxBatchMessages: number;
  maxPendingJobs: number;
  queueLength: number;
  trimmedBatchMessageCount: number;
};

type EnqueueTwitchAiJobOptions = {
  maxBatchMessages?: number;
  maxPendingJobs?: number;
};

function findFirstBatchJobIndex(queue: readonly TwitchAiQueueJob[]) {
  return queue.findIndex((entry) => entry.mode === 'batch');
}

function findLastBatchJobIndex(queue: readonly TwitchAiQueueJob[]) {
  for (let index = queue.length - 1; index >= 0; index -= 1) {
    if (queue[index]?.mode === 'batch') {
      return index;
    }
  }

  return -1;
}

function removeBackpressureVictim(queue: TwitchAiQueueJob[], incoming: TwitchAiQueueJob) {
  const batchIndex = incoming.mode === 'direct' ? findFirstBatchJobIndex(queue) : -1;
  const removeIndex = batchIndex >= 0 ? batchIndex : 0;
  return queue.splice(removeIndex, 1)[0] ?? null;
}

export function enqueueTwitchAiJobWithBackpressure(
  queue: TwitchAiQueueJob[],
  job: TwitchAiQueueJob,
  options: EnqueueTwitchAiJobOptions = {},
): TwitchAiQueueBackpressureResult {
  const maxPendingJobs = Math.max(
    1,
    Math.floor(options.maxPendingJobs ?? TWITCH_AI_QUEUE_MAX_PENDING_JOBS),
  );
  const maxBatchMessages = Math.max(
    1,
    Math.floor(options.maxBatchMessages ?? TWITCH_AI_QUEUE_MAX_BATCH_MESSAGES),
  );
  const droppedJobs: TwitchAiQueueJob[] = [];
  let coalescedBatch = false;
  let trimmedBatchMessageCount = 0;

  if (queue.length >= maxPendingJobs && job.mode === 'batch') {
    const batchIndex = findLastBatchJobIndex(queue);
    const pendingBatch = batchIndex >= 0 ? queue[batchIndex] : null;
    if (pendingBatch) {
      const mergedMessages = [...pendingBatch.messages, ...job.messages];
      const retainedMessages = mergedMessages.slice(-maxBatchMessages);
      trimmedBatchMessageCount = mergedMessages.length - retainedMessages.length;
      queue[batchIndex] = {
        ...pendingBatch,
        activeChatterCount: Math.max(pendingBatch.activeChatterCount, job.activeChatterCount),
        context: job.context,
        id: job.id,
        messages: retainedMessages,
      };
      coalescedBatch = true;

      return {
        coalescedBatch,
        droppedJobs,
        droppedMessageCount: 0,
        maxBatchMessages,
        maxPendingJobs,
        queueLength: queue.length,
        trimmedBatchMessageCount,
      };
    }
  }

  while (queue.length >= maxPendingJobs) {
    const dropped = removeBackpressureVictim(queue, job);
    if (!dropped) {
      break;
    }
    droppedJobs.push(dropped);
  }

  queue.push(job);

  return {
    coalescedBatch,
    droppedJobs,
    droppedMessageCount: droppedJobs.reduce((total, dropped) => total + dropped.messages.length, 0),
    maxBatchMessages,
    maxPendingJobs,
    queueLength: queue.length,
    trimmedBatchMessageCount,
  };
}

export function describeTwitchAiQueueBackpressure(
  result: TwitchAiQueueBackpressureResult,
): string | null {
  const actions: string[] = [];

  if (result.coalescedBatch) {
    actions.push('merged a new batch into the latest pending batch');
  }

  if (result.trimmedBatchMessageCount > 0) {
    actions.push(
      `trimmed ${result.trimmedBatchMessageCount} stale batch message${
        result.trimmedBatchMessageCount === 1 ? '' : 's'
      }`,
    );
  }

  if (result.droppedJobs.length > 0) {
    actions.push(
      `dropped ${result.droppedJobs.length} stale pending job${
        result.droppedJobs.length === 1 ? '' : 's'
      } containing ${result.droppedMessageCount} message${
        result.droppedMessageCount === 1 ? '' : 's'
      }`,
    );
  }

  if (actions.length === 0) {
    return null;
  }

  return `Queue backpressure ${actions.join('; ')}. Pending jobs=${result.queueLength}/${result.maxPendingJobs}.`;
}
