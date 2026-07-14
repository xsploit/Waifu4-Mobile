import { describe, expect, it, vi } from 'vitest';
import { executeBackendGrilloCadence } from './backend-grillo-cadence';

describe('executeBackendGrilloCadence', () => {
  it('runs each backend memory beat exactly once in order', async () => {
    const runBeat = vi.fn(async (beatType: string) => ({ beatType, writes: 1 }));

    const results = await executeBackendGrilloCadence({
      reason: 'chat_cadence',
      runBeat,
      stateKey: 'local:persona:hikari-chan',
    });

    expect(runBeat.mock.calls).toEqual([
      ['extraction', 'chat_cadence_extraction', 'local:persona:hikari-chan'],
      ['relationship', 'chat_cadence_relationship', 'local:persona:hikari-chan'],
      ['reflection', 'chat_cadence_reflection', 'local:persona:hikari-chan'],
    ]);
    expect(results.map((entry) => entry.beatType)).toEqual([
      'extraction',
      'relationship',
      'reflection',
    ]);
  });

  it('stops immediately when a beat fails', async () => {
    const runBeat = vi.fn(async (beatType: string) => {
      if (beatType === 'relationship') throw new Error('relationship failed');
      return { beatType, writes: 1 };
    });

    await expect(
      executeBackendGrilloCadence({
        reason: 'manual',
        runBeat,
        stateKey: 'local:persona:hikari-chan',
      }),
    ).rejects.toThrow('relationship failed');
    expect(runBeat).toHaveBeenCalledTimes(2);
  });
});
