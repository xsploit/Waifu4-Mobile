import type { DiscordInterruptionPolicy } from './types';

export type DiscordInterruptionAction = 'none' | 'stop-speaking' | 'barge-in';

export function resolveDiscordInterruptionAction(
  policy: DiscordInterruptionPolicy,
  assistantActive: boolean,
): DiscordInterruptionAction {
  if (!assistantActive || policy === 'ignore') {
    return 'none';
  }
  return policy;
}
