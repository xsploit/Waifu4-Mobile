import { describe, expect, it } from 'vitest';
import { DEFAULT_PERSONA } from './defaults';
import {
  buildChatTurnMemoryMessage,
  chatTurnToChatMessage,
  createDiscordChatTurn,
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

  it('normalizes Discord chat without collapsing guild, voice-channel, or user identity', () => {
    const turn = createDiscordChatTurn({
      displayName: 'Subsect Server Nickname',
      guildId: 'guild-42',
      id: 'discord-msg-1',
      login: 'subsect',
      text: 'remember this belongs to our voice chat',
      timestamp: 456,
      trustedController: true,
      userId: 'user-99',
      voiceChannelId: 'voice-7',
    });

    expect(turn).toMatchObject({
      source: 'discord',
      channel: 'guild-42:voice-7',
      guildId: 'guild-42',
      voiceChannelId: 'voice-7',
      userId: 'user-99',
      login: 'subsect',
      displayName: 'Subsect Server Nickname',
      isLocal: false,
      isTrustedController: true,
    });
    expect(chatTurnToChatMessage(turn).content).toBe(
      '[Discord] Subsect Server Nickname: remember this belongs to our voice chat',
    );
    expect(formatChatTurnMetadata(turn)).toContain('guild=guild-42');
    expect(formatChatTurnMetadata(turn)).toContain('voiceChannel=voice-7');
    expect(formatChatTurnMetadata(turn)).toContain('userId=user-99');
    expect(buildChatTurnMemoryMessage('direct', [turn])).toContain(
      'Discord trusted controller Subsect Server Nickname',
    );
  });

  it('rejects Discord turns without the guild, voice channel, or user scope', () => {
    expect(() =>
      createDiscordChatTurn({
        displayName: 'Viewer',
        guildId: 'guild-42',
        id: 'discord-msg-2',
        login: 'viewer',
        text: 'hello',
        userId: 'user-99',
        voiceChannelId: ' ',
      }),
    ).toThrow('voiceChannelId');
  });
});
