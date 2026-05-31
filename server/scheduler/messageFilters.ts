import type { TwitchChatMessage } from '../twitch/TwitchChatSource.js';

const REPEATED_EMOTE_PATTERN = /^(\S+)(?:\s+\1){4,}$/i;

export function normalizeAlias(alias: string) {
  return alias.trim().toLowerCase().replace(/^@/, '');
}

export function mentionsBot(text: string, aliases: readonly string[]) {
  const lowerText = text.toLowerCase();
  return aliases.some((alias) => {
    const normalized = normalizeAlias(alias);
    return normalized.length > 0 && lowerText.includes(`@${normalized}`);
  });
}

export function isLowSignalMessage(message: TwitchChatMessage) {
  const text = message.text.trim();
  if (text.length < 2) {
    return true;
  }
  if (REPEATED_EMOTE_PATTERN.test(text)) {
    return true;
  }
  const uniqueWords = new Set(text.toLowerCase().split(/\s+/));
  return text.length > 80 && uniqueWords.size <= 2;
}

export function selectMeaningfulMessages(messages: readonly TwitchChatMessage[]) {
  return messages.filter((message) => !isLowSignalMessage(message));
}
