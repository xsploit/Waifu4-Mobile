import { describe, expect, it } from 'vitest';
import { resolveDiscordInterruptionAction } from './discord-interruption';

describe('Discord interruption policy', () => {
  it('only interrupts an active assistant and preserves each configured action', () => {
    expect(resolveDiscordInterruptionAction('ignore', true)).toBe('none');
    expect(resolveDiscordInterruptionAction('stop-speaking', true)).toBe('stop-speaking');
    expect(resolveDiscordInterruptionAction('barge-in', true)).toBe('barge-in');
    expect(resolveDiscordInterruptionAction('barge-in', false)).toBe('none');
  });
});
