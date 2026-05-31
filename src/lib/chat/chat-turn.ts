import type { ChatMessage, PersonaProfile } from './types';
import type { DirectTwitchChatMessage } from '../twitch/direct-irc';

export type ChatTurnSource = 'local' | 'twitch';

export type ChatTurn = {
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

type CreateLocalChatTurnOptions = {
  displayName?: string;
  id?: string;
  persona: PersonaProfile | null;
  text: string;
  timestamp?: number;
  trustedController?: boolean;
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

export function chatTurnToChatMessage(turn: ChatTurn): ChatMessage {
  const prefix = turn.source === 'twitch' ? 'Twitch' : 'Local';
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
      `${target.source === 'twitch' ? 'Twitch viewer' : 'Local controller'} ${target.displayName}: ${target.text}`.trim(),
      `metadata: ${formatChatTurnMetadata(target)}`,
    ].join('\n');
  }

  return `Chat batch:\n${formatChatTurns(turns, 30)}`;
}
