import { describe, expect, it, vi } from 'vitest';
import {
  buildGrilloMemoryPromptAdditionsFailClosedAsync,
  createEmptyGrilloMemoryPromptAdditions,
  getGrilloParticipantKey,
  recordGrilloMemoryTurnFailClosedAsync,
} from './grillo-memory';
import { createDiscordChatTurn } from './chat-turn';

describe('GRILLO memory fail-closed helpers', () => {
  it('returns empty prompt additions when memory context loading fails', async () => {
    const onError = vi.fn();

    await expect(
      buildGrilloMemoryPromptAdditionsFailClosedAsync(
        {
          query: 'hello',
          scopeKey: null as unknown as string,
        },
        onError,
      ),
    ).resolves.toEqual(createEmptyGrilloMemoryPromptAdditions());
    expect(onError).toHaveBeenCalledOnce();
  });

  it('drops failed post-turn writes instead of throwing into chat', async () => {
    const onError = vi.fn();

    await expect(
      recordGrilloMemoryTurnFailClosedAsync(
        {
          assistantText: '',
          persona: null,
          scopeKey: null as unknown as string,
          turns: [],
        },
        onError,
      ),
    ).resolves.toBeNull();
    expect(onError).toHaveBeenCalledOnce();
  });

  it('keys Discord memory participants by guild, voice channel, and Discord user ID', () => {
    const turn = createDiscordChatTurn({
      displayName: 'Different Server Nickname',
      guildId: 'guild-42',
      id: 'discord-msg-1',
      login: 'viewer',
      text: 'hello',
      userId: 'user-99',
      voiceChannelId: 'voice-7',
    });

    expect(getGrilloParticipantKey(turn)).toBe('discord:guild-42:voice-7:user-99');
  });
});
