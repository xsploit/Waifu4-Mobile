import { describe, expect, it } from 'vitest';
import { createDiscordChatTurn } from './chat-turn';
import { createDefaultTwitchSettings } from './defaults';
import { getGrilloParticipantKey, shouldIngestChatTurnToGrillo } from './grillo-intake';

describe('GRILLO chat intake', () => {
  it('keys Discord participants by guild, voice channel, and Discord user ID', () => {
    const turn = createDiscordChatTurn({
      displayName: 'Subsect Server Nickname',
      guildId: 'guild-42',
      id: 'discord-msg-participant',
      login: 'subsect',
      text: 'hello',
      trustedController: true,
      userId: 'user-99',
      voiceChannelId: 'voice-7',
    });

    expect(getGrilloParticipantKey(turn)).toBe('discord:guild-42:voice-7:user-99');
  });

  it('accepts a trusted Discord controller even when Twitch stream mode is disabled', () => {
    const turn = createDiscordChatTurn({
      displayName: 'Subsect Server Nickname',
      guildId: 'guild-42',
      id: 'discord-msg-1',
      login: 'subsect',
      text: 'remember this preference',
      trustedController: true,
      userId: 'user-99',
      voiceChannelId: 'voice-7',
    });

    expect(
      shouldIngestChatTurnToGrillo(turn, null, {
        ...createDefaultTwitchSettings(),
        streamModeEnabled: false,
      }),
    ).toBe(true);
  });
});
