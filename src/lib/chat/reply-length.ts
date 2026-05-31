import type { ReplyLengthMode } from './types';

export const REPLY_LENGTH_MODES: ReplyLengthMode[] = ['short', 'balanced', 'yap'];

export function normalizeReplyLengthMode(value: unknown): ReplyLengthMode {
  return value === 'short' || value === 'yap' ? value : 'balanced';
}

export function getReplyLengthLabel(mode: ReplyLengthMode) {
  switch (mode) {
    case 'short':
      return 'Short';
    case 'yap':
      return 'Yap';
    default:
      return 'Balanced';
  }
}

export function getReplyLengthInstruction(mode: ReplyLengthMode) {
  switch (mode) {
    case 'short':
      return 'Keep the visible spoken reply tight: 1-2 natural sentences unless the current turn explicitly asks for detail.';
    case 'yap':
      return 'Let the character yap when there is real material: use 3-7 lively spoken sentences with reactions, jokes, callbacks, or a quick tangent. Do not pad empty or low-signal turns.';
    default:
      return 'Use a balanced live-stream reply by default: usually 2-4 natural spoken sentences, with room for a small riff when the turn gives you something to react to.';
  }
}

export function getTurnReplyLengthInstruction(mode: ReplyLengthMode, turnKind: 'direct' | 'batch') {
  const base = getReplyLengthInstruction(mode);
  if (turnKind === 'batch') {
    return `${base} For busy chat batches, answer the strongest shared thread instead of line-by-line responding.`;
  }
  return `${base} Reply directly to the target participant by display name when the metadata provides one.`;
}
