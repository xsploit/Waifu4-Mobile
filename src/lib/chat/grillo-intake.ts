import type { ChatTurn } from './chat-turn';
import type { PersonaProfile, TwitchSettings } from './types';

export type ChatJobMemoryMode = 'direct' | 'batch';

export type GrilloIntakeSignal =
  | 'local_turn'
  | 'trusted_twitch_role'
  | 'direct_persona_mention'
  | 'explicit_memory_cue'
  | 'emotional_relationship_signal'
  | 'stream_event_relevance'
  | 'repeated_topic_thread';

export type GrilloIntakeScore = {
  score: number;
  shouldIngest: boolean;
  signals: GrilloIntakeSignal[];
};

const DIRECT_TWITCH_MEMORY_THRESHOLD = 45;
const STOPWORDS = new Set([
  'about',
  'after',
  'again',
  'also',
  'because',
  'chat',
  'from',
  'have',
  'just',
  'like',
  'that',
  'this',
  'with',
  'what',
  'when',
  'where',
  'will',
  'would',
  'your',
]);

function normalizeMentionTag(value: string) {
  return value
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/[^a-z0-9_]+/g, '');
}

export function chatTextMentionsPersona(text: string, persona: PersonaProfile | null) {
  const mentions = new Set(
    Array.from(text.matchAll(/@([a-z0-9_][a-z0-9_-]*)/gi)).map((match) =>
      normalizeMentionTag(match[1] ?? ''),
    ),
  );
  if (mentions.size === 0) return false;
  const candidates = [
    'riko',
    'rico',
    persona?.name,
    persona?.id,
    persona?.name.replace(/-?chan$/i, ''),
    persona?.name.replace(/\s+/g, ''),
  ]
    .map((value) => normalizeMentionTag(value ?? ''))
    .filter(Boolean);
  return candidates.some((candidate) => mentions.has(candidate));
}

function normalizeChatText(value: string) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function hasExplicitMemoryCue(text: string) {
  const value = normalizeChatText(text);
  return [
    /\b(i|we)\s+(prefer|like|love|hate|want|need|plan|promise|usually|always|never)\b/i,
    /\b(i|we)\s+(am|work|live|use|main|play|stream|make|build)\b/i,
    /\bmy\s+(favorite|goal|name|pronouns?|job|work|schedule|boundary|preference)\b/i,
    /\b(do not|don't|never|stop)\s+(call|say|mention|ask|use|do)\b/i,
    /\bremember\s+(that|this|me)\b/i,
    /\b(for context|fyi)\b/i,
  ].some((pattern) => pattern.test(value));
}

function hasEmotionalRelationshipSignal(text: string) {
  const value = normalizeChatText(text);
  return [
    /\b(i|we)\s+(feel|felt|am|love|hate|miss|trust|appreciate|worry)\b/i,
    /\b(i|we)'m\s+(happy|sad|mad|angry|upset|excited|scared|anxious|proud|grateful)\b/i,
    /\byou\s+(made|make|helped|saved|hurt|annoyed|cheered)\s+(me|my|us|our)\b/i,
    /\b(thank you|thanks for|i appreciate)\b/i,
  ].some((pattern) => pattern.test(value));
}

function hasStreamEventRelevance(turn: ChatTurn) {
  if (turn.firstTimeChatter) {
    return true;
  }
  return turn.badges.some((badge) =>
    /^(subscriber|founder|vip|bits|sub-gifter|staff|partner|artist-badge)\//i.test(badge),
  );
}

function topicTokens(text: string) {
  return new Set(
    normalizeChatText(text)
      .replace(/https?:\/\/\S+/g, ' ')
      .split(/[^a-z0-9_]+/i)
      .map((token) => token.trim())
      .filter((token) => token.length >= 4 && !STOPWORDS.has(token)),
  );
}

function hasRepeatedTopicThread(turns: ChatTurn[]) {
  const tokenSources = new Map<string, Set<string>>();
  for (const turn of turns) {
    if (turn.source !== 'twitch') {
      continue;
    }
    const source = turn.login || turn.id;
    for (const token of topicTokens(turn.text)) {
      const sources = tokenSources.get(token) ?? new Set<string>();
      sources.add(source);
      tokenSources.set(token, sources);
    }
  }
  return Array.from(tokenSources.values()).some((sources) => sources.size >= 2);
}

export function scoreChatTurnForGrilloIntake(
  turn: ChatTurn,
  persona: PersonaProfile | null,
  twitchSettings: TwitchSettings,
): GrilloIntakeScore {
  if (turn.source === 'local') {
    return { score: 100, shouldIngest: true, signals: ['local_turn'] };
  }
  if (!twitchSettings.streamModeEnabled) {
    return { score: 0, shouldIngest: false, signals: [] };
  }

  let score = 0;
  const signals: GrilloIntakeSignal[] = [];
  const addSignal = (signal: GrilloIntakeSignal, points: number) => {
    if (!signals.includes(signal)) {
      signals.push(signal);
      score += points;
    }
  };

  if (turn.isTrustedController || turn.isBroadcaster || turn.isMod) {
    addSignal('trusted_twitch_role', 80);
  }
  if (chatTextMentionsPersona(turn.text, persona)) {
    addSignal('direct_persona_mention', 55);
  }
  if (hasExplicitMemoryCue(turn.text)) {
    addSignal('explicit_memory_cue', 45);
  }
  if (hasEmotionalRelationshipSignal(turn.text)) {
    addSignal('emotional_relationship_signal', 45);
  }
  if (hasStreamEventRelevance(turn)) {
    addSignal('stream_event_relevance', 45);
  }

  return {
    score,
    shouldIngest: score >= DIRECT_TWITCH_MEMORY_THRESHOLD,
    signals,
  };
}

export function scoreChatJobForGrilloIntake(
  mode: ChatJobMemoryMode,
  turns: ChatTurn[],
  persona: PersonaProfile | null,
  twitchSettings: TwitchSettings,
): GrilloIntakeScore {
  if (turns.length === 0) {
    return { score: 0, shouldIngest: false, signals: [] };
  }
  if (turns.some((turn) => turn.source === 'local')) {
    return { score: 100, shouldIngest: true, signals: ['local_turn'] };
  }
  if (!twitchSettings.streamModeEnabled) {
    return { score: 0, shouldIngest: false, signals: [] };
  }

  const turnScores = turns.map((turn) =>
    scoreChatTurnForGrilloIntake(turn, persona, twitchSettings),
  );
  const bestTurnScore = turnScores.reduce<GrilloIntakeScore>(
    (best, current) => (current.score > best.score ? current : best),
    { score: 0, shouldIngest: false, signals: [] },
  );
  if (bestTurnScore.shouldIngest || mode === 'direct') {
    return bestTurnScore;
  }

  if (hasRepeatedTopicThread(turns)) {
    return {
      score: Math.max(bestTurnScore.score, DIRECT_TWITCH_MEMORY_THRESHOLD),
      shouldIngest: true,
      signals: Array.from(new Set([...bestTurnScore.signals, 'repeated_topic_thread'])),
    };
  }

  return bestTurnScore;
}

export function shouldIngestChatTurnToGrillo(
  turn: ChatTurn,
  persona: PersonaProfile | null,
  twitchSettings: TwitchSettings,
) {
  return scoreChatTurnForGrilloIntake(turn, persona, twitchSettings).shouldIngest;
}

export function shouldIngestChatJobToGrillo(
  mode: ChatJobMemoryMode,
  turns: ChatTurn[],
  persona: PersonaProfile | null,
  twitchSettings: TwitchSettings,
) {
  return scoreChatJobForGrilloIntake(mode, turns, persona, twitchSettings).shouldIngest;
}
