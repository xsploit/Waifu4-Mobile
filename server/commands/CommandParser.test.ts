import { describe, expect, it } from 'vitest';
import { parseStreamCommand } from './CommandParser.js';
import type { TwitchChatMessage } from '../twitch/TwitchChatSource.js';

function message(
  text: string,
  user = 'subsect',
  overrides: Partial<TwitchChatMessage> = {},
): TwitchChatMessage {
  return {
    id: `${user}-${Date.now()}`,
    user,
    displayName: user,
    text,
    timestamp: Date.now(),
    badges: [],
    isMod: false,
    isBroadcaster: false,
    ...overrides,
  };
}

const options = {
  prefixes: ['!yw', '!waifu'],
  admins: ['subsect'],
  allowMods: true,
};

describe('CommandParser', () => {
  it('lets subsect control the bot from any chat', () => {
    const parsed = parseStreamCommand(message('!yw channel another_room'), options);

    expect(parsed.matched).toBe(true);
    if (!parsed.matched || !parsed.authorized) {
      throw new Error('Expected authorized command.');
    }
    expect(parsed.command).toEqual({ kind: 'channel', channel: 'another_room' });
  });

  it('rejects normal viewers for control commands', () => {
    const parsed = parseStreamCommand(message('!yw refresh', 'viewer1'), options);

    expect(parsed.matched).toBe(true);
    if (!parsed.matched) {
      throw new Error('Expected matched command.');
    }
    expect(parsed.authorized).toBe(false);
  });

  it('allows moderators when configured', () => {
    const parsed = parseStreamCommand(
      message('!yw anim speed 1.5', 'moddy', { isMod: true }),
      options,
    );

    expect(parsed.matched).toBe(true);
    if (!parsed.matched || !parsed.authorized) {
      throw new Error('Expected authorized command.');
    }
    expect(parsed.command).toEqual({ kind: 'set-animation-speed', speed: 1.5 });
  });

  it('parses VRM, LLM, animation, TTS, and chat reply commands', () => {
    const commands = [
      parseStreamCommand(message('!yw llm gpt-4.1'), options),
      parseStreamCommand(message('!yw state reset'), options),
      parseStreamCommand(message('!yw personas'), options),
      parseStreamCommand(message('!yw persona hikari'), options),
      parseStreamCommand(message('!yw character sachi'), options),
      parseStreamCommand(message('!yw vrm riko-final-fixed-v2'), options),
      parseStreamCommand(message('!yw camera close'), options),
      parseStreamCommand(message('!yw anim dance'), options),
      parseStreamCommand(message('!yw tts off'), options),
      parseStreamCommand(message('!yw chat on'), options),
    ];

    expect(
      commands.map((command) =>
        command.matched && command.authorized ? command.command.kind : 'bad',
      ),
    ).toEqual([
      'set-ai-model',
      'reset-ai-state',
      'list-personas',
      'set-persona',
      'set-character',
      'set-vrm',
      'set-camera-view',
      'play-animation',
      'set-tts',
      'set-chat-replies',
    ]);
  });
});
