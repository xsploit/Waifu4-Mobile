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
  ttsModel?: string;
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
  const source = readTurnContextValue(turnContext, 'source') || 'unknown';
  const turnKind = readTurnContextValue(turnContext, 'turnKind') || 'unknown';
  const speaker =
    readTurnContextValue(turnContext, 'displayName') ||
    readTurnContextValue(turnContext, 'speaker') ||
    readTurnContextValue(turnContext, 'login') ||
    persona?.userNickname.trim() ||
    'current user';
  const isLocal = readTurnContextBoolean(turnContext, 'isLocal') || source === 'local';
  const isTrustedController = readTurnContextBoolean(turnContext, 'isTrustedController');
  const isBroadcaster = readTurnContextBoolean(turnContext, 'targetIsBroadcaster');
  const isMod = readTurnContextBoolean(turnContext, 'targetIsMod');
  const firstTimeChatter = readTurnContextBoolean(turnContext, 'firstTimeChatter');
  const runtimeSituation = readTurnContextValue(turnContext, 'runtimeSituation');
  const targetRole =
    isLocal || isTrustedController
      ? 'local controller'
      : isBroadcaster
        ? 'broadcaster'
        : isMod
          ? 'moderator'
          : source === 'twitch'
            ? 'Twitch viewer'
            : 'speaker';
  const localTime = now.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'medium',
      timeZone: timezone === 'unknown' ? undefined : timezone,
    });

  const lines = [
    'Current scene:',
    formatSceneLine('local time', `${localTime} (${timezone})`),
    formatSceneLine('active persona', persona?.name || 'Web Waifu 4'),
    formatSceneLine('speaker', speaker),
    formatSceneLine('speaker role', targetRole),
    formatSceneLine('conversation source', source === 'local' ? 'local one-on-one chat' : source),
    formatSceneLine('runtime situation', runtimeSituation),
    formatSceneLine('response shape', turnKind === 'batch' ? 'busy chat batch' : 'direct reply'),
    firstTimeChatter ? '- speaker note: first message seen from this chatter this session' : '',
    readTurnContextBoolean(turnContext, 'streamVisionAttached')
      ? '- visual context: a recent stream frame is attached'
      : '',
    source === 'twitch'
      ? formatSceneLine('active chatters', readTurnContextValue(turnContext, 'activeChatters'))
      : '',
    turnKind === 'batch'
      ? formatSceneLine('messages in batch', readTurnContextValue(turnContext, 'batchMessages'))
      : '',
    formatSceneLine('relationship', `${relationshipMemory.relationshipStage}; ${relationshipMemory.mood}`),
    formatSceneLine('emotional stance', describeAffectForPrompt(affectState)),
    semanticMemoryContext.trim() ? '- memory: relevant recalled memory is available' : '',
    diaryContext ? '- private continuity: diary context is available; use quietly' : '',
    lastUserMessage
      ? formatSceneLine('last user message time', new Date(lastUserMessage.createdAt).toLocaleString())
      : '',
    ttsExpressionTagsEnabled && ttsProvider !== 'piper'
      ? '- speech: expression tags may be used sparingly when they improve delivery'
      : '',
  ].filter(Boolean);

  return lines.join('\n');
}

function readTurnContextValue(
  turnContext: Record<string, PromptTurnContextValue> | undefined,
  key: string,
) {
  const value = turnContext?.[key];
  return value === undefined || value === null ? '' : String(value).trim();
}

function readTurnContextBoolean(
  turnContext: Record<string, PromptTurnContextValue> | undefined,
  key: string,
) {
  const value = turnContext?.[key];
  return value === true || value === 'true' || value === 1 || value === '1';
}

function formatSceneLine(label: string, value: PromptTurnContextValue) {
  if (value === undefined || value === null || value === '') {
    return '';
  }
  return `- ${label}: ${value}`;
}

function describeAffectForPrompt(affectState: ReturnType<typeof normalizeAffectState>) {
  const valence =
    affectState.valence > 0.22 ? 'positive' : affectState.valence < -0.22 ? 'negative' : 'neutral';
  const arousal =
    affectState.arousal > 0.5 ? 'high energy' : affectState.arousal < 0.2 ? 'low energy' : 'steady';
  const dominance =
    affectState.dominance > 0.25
      ? 'confident'
      : affectState.dominance < -0.25
        ? 'deferential'
        : 'balanced';
  return `${affectState.label}; ${valence}, ${arousal}, ${dominance}`;
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
  ttsModel,
  replyLength,
}: {
  animationCatalogContext: string;
  diaryContext: string;
  persona: PersonaProfile | null;
  relationshipMemory: RelationshipMemory;
  semanticMemoryContext: string;
  turnContext?: Record<string, PromptTurnContextValue>;
  ttsExpressionTagsEnabled: boolean;
  ttsModel: string;
  ttsProvider: string;
  replyLength: ReplyLengthMode;
}) {
  const turnSource = readTurnContextValue(turnContext, 'source');
  const turnKind = readTurnContextValue(turnContext, 'turnKind');
  const conversationScope = readTurnContextValue(turnContext, 'conversationScope');
  const isLocalTurn = turnSource === 'local';
  const isTwitchTurn = turnSource === 'twitch';
  const isBatchTurn = turnKind === 'batch';
  const isTrustedController = readTurnContextBoolean(turnContext, 'isTrustedController');
  const targetIsBroadcaster = readTurnContextBoolean(turnContext, 'targetIsBroadcaster');
  const targetIsMod = readTurnContextBoolean(turnContext, 'targetIsMod');
  const firstTimeChatter = readTurnContextBoolean(turnContext, 'firstTimeChatter');
  const currentSpeaker =
    readTurnContextValue(turnContext, 'displayName') ||
    readTurnContextValue(turnContext, 'speaker') ||
    readTurnContextValue(turnContext, 'login') ||
    readTurnContextValue(turnContext, 'user') ||
    persona?.userNickname.trim() ||
    'current user';
  const runtimeSituation = readTurnContextValue(turnContext, 'runtimeSituation');
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
    affect_summary: describeAffectForPrompt(affectState),
    affect_valence: affectState.valence.toFixed(2),
    close_relationship: relationshipStage === 'close',
    conversation_scope: conversationScope || 'chat',
    runtime_situation: runtimeSituation,
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
    first_time_chatter: firstTimeChatter,
    is_batch_turn: isBatchTurn,
    is_direct_turn: turnKind === 'direct',
    is_local_turn: isLocalTurn,
    is_twitch_turn: isTwitchTurn,
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
    tts_fish_s1: ttsProvider === 'fish-speech' && ttsModel.trim().toLowerCase() === 's1',
    tts_fish_s2: ttsProvider === 'fish-speech' && ttsModel.trim().toLowerCase() !== 's1',
    tts_model: ttsModel.trim(),
    tts_tags_enabled: ttsExpressionTagsEnabled && ttsProvider !== 'piper',
    target_is_broadcaster: targetIsBroadcaster,
    target_is_mod: targetIsMod,
    target_is_trusted_controller: isTrustedController,
    target_role:
      isLocalTurn || isTrustedController
        ? 'local controller'
        : targetIsBroadcaster
          ? 'broadcaster'
          : targetIsMod
            ? 'moderator'
            : isTwitchTurn
              ? 'viewer'
              : 'speaker',
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
  ttsModel = '',
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
      ? 'enabled'
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
      ttsModel,
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
