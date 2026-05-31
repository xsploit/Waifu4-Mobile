import { describe, expect, it } from 'vitest';
import { DEFAULT_PERSONA } from './defaults';
import {
  buildChatTurnMemoryMessage,
  chatTurnToChatMessage,
  createLocalChatTurn,
  createTwitchChatTurn,
  formatChatTurnMetadata,
  formatChatTurns,
} from './chat-turn';
import type { DirectTwitchChatMessage } from '../twitch/direct-irc';

function twitchMessage(overrides: Partial<DirectTwitchChatMessage> = {}): DirectTwitchChatMessage {
  return {
    id: 'msg-1',
    user: 'viewer',
    displayName: 'Viewer',
    text: '@Hikari hello',
    timestamp: Date.UTC(2026, 4, 13, 12, 0, 0),
    badges: [],
    isBroadcaster: false,
    isMod: false,
    ...overrides,
  };
}

describe('chat-turn normalization', () => {
  it('normalizes local chat as a trusted participant turn', () => {
    const turn = createLocalChatTurn({
      persona: {
        ...DEFAULT_PERSONA,
        userNickname: 'Subby',
      },
      text: 'hey chat bot',
      timestamp: 123,
    });

    expect(turn).toMatchObject({
      source: 'local',
      channel: 'local',
      displayName: 'Subby',
      isLocal: true,
      isTrustedController: true,
    });
    expect(chatTurnToChatMessage(turn)).toMatchObject({
      role: 'user',
      content: '[Local] Subby: hey chat bot',
    });
  });

  it('normalizes Twitch chat with channel and badge metadata', () => {
    const turn = createTwitchChatTurn(
      twitchMessage({
        user: 'subsect',
        displayName: 'SUBSECT',
        badges: ['broadcaster/1'],
        isBroadcaster: true,
      }),
      '#subsect',
      true,
    );

    expect(turn).toMatchObject({
      source: 'twitch',
      channel: 'subsect',
      login: 'subsect',
      isBroadcaster: true,
      isTrustedController: true,
      firstTimeChatter: true,
    });
    expect(formatChatTurnMetadata(turn)).toContain('trustedController=true');
    expect(formatChatTurns([turn], 1)).toContain('metadata: source=twitch');
    expect(buildChatTurnMemoryMessage('direct', [turn])).toContain('Twitch viewer SUBSECT');
  });
});
