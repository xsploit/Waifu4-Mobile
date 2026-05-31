import { buildGrilloContextPromptBlock } from './grillo-context';
import type { ChatTurn } from './chat-turn';
import type { GrilloMemoryPromptAdditions } from './grillo-memory';
import type { ChatMessage, PersonaProfile, RelationshipMemory } from './types';
import { buildYourWifeyPomlMessages } from './poml';
import type { PomlPromptMessage } from './poml';
import { buildReplyMetadataInstruction } from './reply-metadata';
import { getReplyLengthInstruction, normalizeReplyLengthMode } from './reply-length';
import type { ReplyLengthMode } from './types';
import { buildAffectBridgePromptBlock, normalizeAffectState } from './affect-bridge';

type CompletionMessage = PomlPromptMessage;
type PromptTurnContextValue = string | number | boolean | null | undefined;

const DIARY_CONTEXT_RELEVANCE_THRESHOLD = 0.18;
const DIARY_CONTEXT_RECENT_TURN_WINDOW = 4;
const DIARY_CONTEXT_HISTORY_LIMIT = 3;
const LOW_SIGNAL_RELATIONSHIP_MOODS = new Set(['curious', 'guarded']);

type BuildChatCompletionMessagesOptions = {
  channelHistory?: ChatTurn[];
  currentTurnContext?: string;
  grilloMemory?: GrilloMemoryPromptAdditions;
  history: ChatMessage[];
  animationCatalogContext?: string;
  maxHistoryMessages?: number;
  persona: PersonaProfile | null;
  relationshipMemory: RelationshipMemory;
  replyLength?: ReplyLengthMode;
  semanticMemoryContext?: string;
  turnContext?: Record<string, PromptTurnContextValue>;
  ttsExpressionTagsEnabled?: boolean;
  ttsProvider?: string;
};

function serializeTurnMetadataContext({
  history,
  persona,
  relationshipMemory,
  semanticMemoryContext,
  turnContext,
  ttsExpressionTagsEnabled,
  ttsProvider,
  diaryContext,
}: {
  diaryContext: string;
  history: ChatMessage[];
  persona: PersonaProfile | null;
  relationshipMemory: RelationshipMemory;
  semanticMemoryContext: string;
  turnContext?: Record<string, PromptTurnContextValue>;
  ttsExpressionTagsEnabled: boolean;
  ttsProvider: string;
}) {
  const now = new Date();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';
  const lastUserMessage = [...history].reverse().find((message) => message.role === 'user');
  const affectState = normalizeAffectState(relationshipMemory.affectState);
  const metadata: Record<string, PromptTurnContextValue> = {
    currentTimeIso: now.toISOString(),
    localTime: now.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'medium',
      timeZone: timezone === 'unknown' ? undefined : timezone,
    }),
    memoryStage: relationshipMemory.relationshipStage,
    privateDiary: diaryContext ? 'included' : relationshipMemory.diaryEntry ? 'withheld' : 'none',
    personaId: persona?.id,
    personaName: persona?.name,
    relationshipMood: relationshipMemory.mood,
    affectArousal: affectState.arousal.toFixed(2),
    affectDominance: affectState.dominance.toFixed(2),
    affectLabel: affectState.label,
    affectValence: affectState.valence.toFixed(2),
    semanticMemory: semanticMemoryContext.trim() ? 'present' : 'absent',
    timezone,
    ttsExpressionTags: ttsExpressionTagsEnabled,
    ttsProvider,
    ...turnContext,
  };

  if (lastUserMessage) {
    metadata['lastUserMessageAtIso'] = new Date(lastUserMessage.createdAt).toISOString();
  }

  const cleanMetadata = Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== undefined && value !== null),
  );

  return `Turn metadata: ${JSON.stringify(cleanMetadata)}`;
}

function readTurnContextValue(
  turnContext: Record<string, PromptTurnContextValue> | undefined,
  key: string,
) {
  const value = turnContext?.[key];
  return value === undefined || value === null ? '' : String(value).trim();
}

function buildDynamicPromptState({
  animationCatalogContext,
  diaryContext,
  persona,
  relationshipMemory,
  semanticMemoryContext,
  turnContext,
  ttsExpressionTagsEnabled,
  ttsProvider,
  replyLength,
}: {
  animationCatalogContext: string;
  diaryContext: string;
  persona: PersonaProfile | null;
  relationshipMemory: RelationshipMemory;
  semanticMemoryContext: string;
  turnContext?: Record<string, PromptTurnContextValue>;
  ttsExpressionTagsEnabled: boolean;
  ttsProvider: string;
  replyLength: ReplyLengthMode;
}) {
  const turnSource = readTurnContextValue(turnContext, 'source');
  const turnKind = readTurnContextValue(turnContext, 'turnKind');
  const conversationScope = readTurnContextValue(turnContext, 'conversationScope');
  const currentSpeaker =
    readTurnContextValue(turnContext, 'displayName') ||
    readTurnContextValue(turnContext, 'speaker') ||
    readTurnContextValue(turnContext, 'login') ||
    readTurnContextValue(turnContext, 'user') ||
    persona?.userNickname.trim() ||
    'current user';
  const relationshipMood = relationshipMemory.mood;
  const relationshipStage = relationshipMemory.relationshipStage;
  const affectState = normalizeAffectState(relationshipMemory.affectState);

  return {
    affectionate_state:
      relationshipMood === 'soft' ||
      relationshipMood === 'affectionate' ||
      relationshipMemory.attraction >= 12,
    animation_catalog_present: Boolean(animationCatalogContext.trim()),
    attraction_score: relationshipMemory.attraction,
    affect_arousal: affectState.arousal.toFixed(2),
    affect_dominance: affectState.dominance.toFixed(2),
    affect_label: affectState.label,
    affect_valence: affectState.valence.toFixed(2),
    close_relationship: relationshipStage === 'close',
    conversation_scope: conversationScope || 'chat',
    current_speaker: currentSpeaker,
    familiar_relationship: relationshipStage === 'familiar',
    guard_score: relationshipMemory.guard,
    guarded_state:
      relationshipMood === 'guarded' ||
      relationshipMood === 'cold' ||
      relationshipMemory.guard >= 12,
    has_animation_catalog: Boolean(animationCatalogContext.trim()),
    has_private_diary: Boolean(diaryContext.trim()),
    has_semantic_memory: Boolean(semanticMemoryContext.trim()),
    high_trust: relationshipMemory.trust >= 12,
    irritation_score: relationshipMemory.irritation,
    irritated_state: relationshipMood === 'annoyed' || relationshipMemory.irritation >= 10,
    is_batch_turn: turnKind === 'batch',
    is_local_turn: turnSource === 'local',
    is_twitch_turn: turnSource === 'twitch',
    jealous_state: relationshipMemory.jealousy >= 8,
    jealousy_score: relationshipMemory.jealousy,
    last_action_tag: relationshipMemory.lastActionTag,
    low_trust: relationshipMemory.trust < 7,
    medium_trust: relationshipMemory.trust >= 7 && relationshipMemory.trust < 12,
    new_relationship: relationshipStage === 'new',
    persona_name: persona?.name.trim() || 'Web Waifu 4',
    relationship_mood: relationshipMood,
    relationship_stage: relationshipStage,
    respect_score: relationshipMemory.respect,
    reply_length_instruction: getReplyLengthInstruction(replyLength),
    reply_length_mode: replyLength,
    trust_score: relationshipMemory.trust,
    tts_tags_enabled: ttsExpressionTagsEnabled && ttsProvider !== 'piper',
    turn_kind: turnKind || 'unknown',
    turn_source: turnSource || 'unknown',
    user_nickname: persona?.userNickname.trim() || '',
  };
}

function serializeDiaryContext(
  history: ChatMessage[],
  relationshipMemory: RelationshipMemory,
  turnContext?: Record<string, PromptTurnContextValue>,
) {
  const diaryEntries = getDiaryEntries(relationshipMemory);
  if (diaryEntries.length === 0) {
    return '';
  }

  const latestUserMessage = [...history].reverse().find((message) => message.role === 'user');
  const currentTurnText = readTurnContextValue(turnContext, 'currentTurnText');
  const score = scoreDiaryContext(
    currentTurnText || latestUserMessage?.content || '',
    relationshipMemory,
    turnContext,
  );
  if (score < DIARY_CONTEXT_RELEVANCE_THRESHOLD) {
    return '';
  }

  return [
    'Use these as private emotional continuity only. Do not quote or announce the diary unless the reply naturally calls for it.',
    ...diaryEntries.map((entry, index) => {
      const label = index === 0 ? 'Latest private note' : `Previous private note ${index}`;
      return `${label}: ${entry}`;
    }),
  ].join('\n');
}

function getDiaryEntries(relationshipMemory: RelationshipMemory) {
  const entries = [relationshipMemory.diaryEntry, ...relationshipMemory.diaryHistory]
    .map((entry) => entry.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  return entries
    .filter((entry) => {
      const key = entry.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, DIARY_CONTEXT_HISTORY_LIMIT);
}

function scoreDiaryContext(
  userText: string,
  relationshipMemory: RelationshipMemory,
  turnContext?: Record<string, PromptTurnContextValue>,
) {
  const diaryCorpus = [
    relationshipMemory.diaryEntry,
    ...relationshipMemory.diaryHistory,
    relationshipMemory.summary,
    ...relationshipMemory.facts,
  ].join('\n');
  const lexicalScore = jaccardSimilarity(
    tokenizeForRelevance(userText),
    tokenizeForRelevance(diaryCorpus),
  );
  const turnsSinceDiary =
    relationshipMemory.lastDiaryTurnCount > 0
      ? Math.max(0, relationshipMemory.turnCount - relationshipMemory.lastDiaryTurnCount)
      : Number.POSITIVE_INFINITY;
  const recencyScore = Number.isFinite(turnsSinceDiary)
    ? Math.max(0, 1 - turnsSinceDiary / DIARY_CONTEXT_RECENT_TURN_WINDOW)
    : 0;
  const moodScore = LOW_SIGNAL_RELATIONSHIP_MOODS.has(relationshipMemory.mood) ? 0 : 0.08;
  const statScore =
    Math.max(
      relationshipMemory.trust,
      relationshipMemory.attraction,
      relationshipMemory.irritation,
      relationshipMemory.jealousy,
      relationshipMemory.guard,
    ) / 20;
  const batchPenalty = turnContext?.['turnKind'] === 'batch' ? -0.08 : 0;

  return lexicalScore * 0.72 + recencyScore * 0.14 + statScore * 0.1 + moodScore + batchPenalty;
}

function tokenizeForRelevance(value: string) {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9_'-]+/g)
      .map((term) => term.trim())
      .filter((term) => term.length >= 4),
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>) {
  if (a.size === 0 || b.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const term of a) {
    if (b.has(term)) {
      overlap += 1;
    }
  }

  return overlap / (a.size + b.size - overlap);
}

export function trimChatHistory(history: ChatMessage[], limit = 36) {
  return history.slice(-limit);
}

export async function buildChatCompletionMessages({
  animationCatalogContext = '',
  channelHistory = [],
  currentTurnContext = '',
  grilloMemory,
  history,
  maxHistoryMessages = 12,
  persona,
  relationshipMemory,
  replyLength = 'balanced',
  semanticMemoryContext = '',
  turnContext,
  ttsExpressionTagsEnabled = false,
  ttsProvider = 'piper',
}: BuildChatCompletionMessagesOptions): Promise<CompletionMessage[]> {
  const normalizedReplyLength = normalizeReplyLengthMode(replyLength);
  const personaBlocks: string[] = [];

  if (persona) {
    personaBlocks.push(`You are ${persona.name}. Stay in character and reply naturally.`);

    if (persona.description.trim()) {
      personaBlocks.push(`Character description: ${persona.description.trim()}`);
    }

    if (persona.systemPrompt.trim()) {
      personaBlocks.push(persona.systemPrompt.trim());
    }

    if (persona.userNickname.trim()) {
      personaBlocks.push(
        `The local controller nickname is "${persona.userNickname.trim()}". In local/manual chat, talk directly to that person in second person. In Twitch chat, do not assume every chatter is the local controller; address the target viewer by their Twitch display name when provided.`,
      );
    }
  }

  const ttsContext =
    ttsExpressionTagsEnabled && ttsProvider !== 'piper'
      ? 'Speech expression tags are enabled for the active TTS engine. You may add short bracketed delivery tags sparingly inside spoken dialogue when they improve performance, such as [laughs], [sighs], [whispers], [excited], [sarcastic], [nervous], or [pause]. Keep replies as natural spoken dialogue, do not explain the tags, and do not use markdown or stage directions outside those short tags.'
      : '';

  const contextualHistory = history
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .slice(-maxHistoryMessages)
    .map(({ role, content }) => ({
      role,
      content,
    }));
  const diaryContext = serializeDiaryContext(history, relationshipMemory, turnContext);
  const hasNativeGrilloPacket = Boolean(grilloMemory?.contextPacket);
  const legacyDiaryContext = hasNativeGrilloPacket ? '' : diaryContext;
  const legacySemanticMemoryContext = hasNativeGrilloPacket ? '' : semanticMemoryContext;
  const grilloContext = buildGrilloContextPromptBlock({
    channelHistory,
    currentTurnText: currentTurnContext || readTurnContextValue(turnContext, 'currentTurnText'),
    diaryContext: legacyDiaryContext,
    memoryAdditions: grilloMemory,
    persona,
    relationshipMemory,
    semanticMemoryContext: legacySemanticMemoryContext,
    turnContext,
  });

  return await buildYourWifeyPomlMessages({
    animationCatalogContext,
    currentTurnContext,
    diaryContext: '',
    dynamicState: buildDynamicPromptState({
      animationCatalogContext,
      diaryContext: legacyDiaryContext,
      persona,
      relationshipMemory,
      semanticMemoryContext: legacySemanticMemoryContext,
      turnContext,
      ttsExpressionTagsEnabled,
      ttsProvider,
      replyLength: normalizedReplyLength,
    }),
    grilloContext,
    history: contextualHistory,
    personaContext: personaBlocks.join('\n\n'),
    relationshipMemoryContext: buildAffectBridgePromptBlock(relationshipMemory.affectState),
    replyMetadataInstruction: buildReplyMetadataInstruction(),
    semanticMemoryContext: '',
    turnMetadataContext: serializeTurnMetadataContext({
      diaryContext: legacyDiaryContext,
      history,
      persona,
      relationshipMemory,
      semanticMemoryContext: legacySemanticMemoryContext,
      turnContext,
      ttsExpressionTagsEnabled,
      ttsProvider,
    }),
    ttsContext,
  });
}
