import type { ChatMessage, PersonaProfile } from './types';
import type { DirectTwitchChatMessage } from '../twitch/direct-irc';

export type ChatTurnSource = 'local' | 'twitch' | 'discord';

type BaseChatTurn = {
  id: string;
  source: ChatTurnSource;
  channel: string;
  login: string;
  displayName: string;
  text: string;
  timestamp: number;
  badges: string[];
  isMod: boolean;
  isBroadcaster: boolean;
  isLocal: boolean;
  isTrustedController: boolean;
  firstTimeChatter?: boolean;
};

export type DiscordChatTurn = BaseChatTurn & {
  source: 'discord';
  guildId: string;
  voiceChannelId: string;
  userId: string;
};

export type ChatTurn =
  | (Omit<BaseChatTurn, 'source'> & { source: 'local' | 'twitch' })
  | DiscordChatTurn;

type CreateLocalChatTurnOptions = {
  displayName?: string;
  id?: string;
  persona: PersonaProfile | null;
  text: string;
  timestamp?: number;
  trustedController?: boolean;
};

export type CreateDiscordChatTurnOptions = {
  badges?: string[];
  displayName: string;
  firstTimeChatter?: boolean;
  guildId: string;
  id: string;
  login: string;
  text: string;
  timestamp?: number;
  trustedController?: boolean;
  userId: string;
  voiceChannelId: string;
};

export function createLocalChatTurn({
  displayName: requestedDisplayName,
  id,
  persona,
  text,
  timestamp = Date.now(),
  trustedController = true,
}: CreateLocalChatTurnOptions): ChatTurn {
  const displayName = requestedDisplayName?.trim() || persona?.userNickname.trim() || 'Subsect';
  const login = displayName.toLowerCase().replace(/[^a-z0-9_]+/g, '_') || 'local_viewer';
  return {
    id: id ?? `local-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
    source: 'local',
    channel: 'local',
    login,
    displayName,
    text,
    timestamp,
    badges: trustedController ? ['local-controller'] : ['local-viewer'],
    isMod: trustedController,
    isBroadcaster: trustedController,
    isLocal: true,
    isTrustedController: trustedController,
  };
}

export function createTwitchChatTurn(
  message: DirectTwitchChatMessage,
  channel: string,
  firstTimeChatter = false,
): ChatTurn {
  const login = message.user.toLowerCase();
  return {
    id: message.id,
    source: 'twitch',
    channel: channel.replace(/^#/, '').toLowerCase() || 'unknown',
    login,
    displayName: message.displayName,
    text: message.text,
    timestamp: message.timestamp,
    badges: message.badges,
    isMod: message.isMod,
    isBroadcaster: message.isBroadcaster,
    isLocal: false,
    isTrustedController: login === 'subsect' || message.isBroadcaster || message.isMod,
    firstTimeChatter,
  };
}

export function createDiscordChatTurn({
  badges = [],
  displayName: requestedDisplayName,
  firstTimeChatter = false,
  guildId: requestedGuildId,
  id,
  login: requestedLogin,
  text,
  timestamp = Date.now(),
  trustedController = false,
  userId: requestedUserId,
  voiceChannelId: requestedVoiceChannelId,
}: CreateDiscordChatTurnOptions): DiscordChatTurn {
  const guildId = requiredDiscordIdentity(requestedGuildId, 'guildId');
  const voiceChannelId = requiredDiscordIdentity(requestedVoiceChannelId, 'voiceChannelId');
  const userId = requiredDiscordIdentity(requestedUserId, 'userId');
  const login = requestedLogin.trim() || userId;
  const displayName = requestedDisplayName.trim() || login;

  return {
    id,
    source: 'discord',
    channel: `${guildId}:${voiceChannelId}`,
    guildId,
    voiceChannelId,
    userId,
    login,
    displayName,
    text,
    timestamp,
    badges: trustedController ? [...badges, 'discord-controller'] : badges,
    isMod: false,
    isBroadcaster: false,
    isLocal: false,
    isTrustedController: trustedController,
    firstTimeChatter,
  };
}

export function chatTurnToChatMessage(turn: ChatTurn): ChatMessage {
  const prefix =
    turn.source === 'twitch' ? 'Twitch' : turn.source === 'discord' ? 'Discord' : 'Local';
  return {
    id: `chat-turn-${turn.id}`,
    role: 'user',
    content: `[${prefix}] ${turn.displayName}: ${turn.text}`,
    createdAt: turn.timestamp,
  };
}

export function formatChatTurns(turns: ChatTurn[], limit: number) {
  return turns
    .slice(-limit)
    .map((turn) => {
      const text = turn.text.replace(/\s+/g, ' ').trim();
      return `- ${turn.displayName}: ${text}\n  metadata: ${formatChatTurnMetadata(turn)}`;
    })
    .join('\n');
}

export function formatChatTurnMetadata(turn: ChatTurn) {
  return [
    `source=${turn.source}`,
    `channel=${turn.channel || 'local'}`,
    turn.source === 'discord' ? `guild=${turn.guildId}` : null,
    turn.source === 'discord' ? `voiceChannel=${turn.voiceChannelId}` : null,
    turn.source === 'discord' ? `userId=${turn.userId}` : null,
    `login=${turn.login}`,
    `display=${turn.displayName}`,
    `local=${turn.isLocal}`,
    `trustedController=${turn.isTrustedController}`,
    `broadcaster=${turn.isBroadcaster}`,
    `mod=${turn.isMod}`,
    `badges=${turn.badges.join('/') || 'none'}`,
    turn.firstTimeChatter ? 'firstTimeChatter=true' : null,
    `sentAt=${new Date(turn.timestamp).toISOString()}`,
  ]
    .filter(Boolean)
    .join(' ');
}

export function buildChatTurnMemoryMessage(mode: 'direct' | 'batch', turns: ChatTurn[]) {
  if (mode === 'direct') {
    const target = turns[0];
    if (!target) {
      return 'Viewer chat message.';
    }

    return [
      `${chatTurnSpeakerLabel(target)} ${target.displayName}: ${target.text}`.trim(),
      `metadata: ${formatChatTurnMetadata(target)}`,
    ].join('\n');
  }

  return `Chat batch:\n${formatChatTurns(turns, 30)}`;
}

function requiredDiscordIdentity(value: string, field: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`Discord chat turn requires ${field}.`);
  }
  return normalized;
}

function chatTurnSpeakerLabel(turn: ChatTurn) {
  if (turn.source === 'local') {
    return 'Local controller';
  }
  if (turn.source === 'twitch') {
    return 'Twitch viewer';
  }
  return turn.isTrustedController ? 'Discord trusted controller' : 'Discord member';
}
