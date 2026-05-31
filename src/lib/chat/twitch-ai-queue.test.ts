import { describe, expect, it } from 'vitest';
import type { ChatTurn } from './chat-turn';
import {
  describeTwitchAiQueueBackpressure,
  enqueueTwitchAiJobWithBackpressure,
  type TwitchAiQueueJob,
} from './twitch-ai-queue';

function turn(id: string): ChatTurn {
  return {
    id,
    source: 'twitch',
    channel: 'subsect',
    login: id,
    displayName: id,
    text: `message ${id}`,
    timestamp: 1000,
    badges: [],
    isMod: false,
    isBroadcaster: false,
    isLocal: false,
    isTrustedController: false,
  };
}

function job(id: string, mode: TwitchAiQueueJob['mode'] = 'direct'): TwitchAiQueueJob {
  return {
    id,
    mode,
    activeChatterCount: mode === 'batch' ? 25 : 1,
    context: [turn(`${id}-context`)],
    messages: [turn(`${id}-message`)],
  };
}

describe('enqueueTwitchAiJobWithBackpressure', () => {
  it('keeps direct replies fresh by dropping stale pending work once capped', () => {
    const queue = [job('old-direct-a'), job('old-batch', 'batch'), job('old-direct-b')];

    const result = enqueueTwitchAiJobWithBackpressure(queue, job('new-direct'), {
      maxPendingJobs: 3,
    });

    expect(queue.map((entry) => entry.id)).toEqual([
      'old-direct-a',
      'old-direct-b',
      'new-direct',
    ]);
    expect(result.droppedJobs.map((entry) => entry.id)).toEqual(['old-batch']);
    expect(describeTwitchAiQueueBackpressure(result)).toContain('dropped 1 stale pending job');
  });

  it('coalesces batch work instead of letting slow AI replies build a batch backlog', () => {
    const queue = [job('direct-a'), job('batch-a', 'batch'), job('direct-b')];

    const result = enqueueTwitchAiJobWithBackpressure(queue, job('batch-b', 'batch'), {
      maxBatchMessages: 5,
      maxPendingJobs: 3,
    });

    expect(queue).toHaveLength(3);
    expect(queue[1]?.id).toBe('batch-b');
    expect(queue[1]?.messages.map((entry) => entry.id)).toEqual([
      'batch-a-message',
      'batch-b-message',
    ]);
    expect(result.coalescedBatch).toBe(true);
    expect(describeTwitchAiQueueBackpressure(result)).toContain(
      'merged a new batch into the latest pending batch',
    );
  });

  it('trims oldest messages when repeated batch coalescing exceeds the batch message cap', () => {
    const queue = [job('direct-a'), job('batch-a', 'batch')];
    queue[1] = {
      ...queue[1]!,
      messages: ['a', 'b', 'c'].map(turn),
    };

    const incoming = {
      ...job('batch-b', 'batch'),
      messages: ['d', 'e', 'f'].map(turn),
    };
    const result = enqueueTwitchAiJobWithBackpressure(queue, incoming, {
      maxBatchMessages: 4,
      maxPendingJobs: 2,
    });

    expect(queue[1]?.messages.map((entry) => entry.id)).toEqual(['c', 'd', 'e', 'f']);
    expect(result.trimmedBatchMessageCount).toBe(2);
  });
});
