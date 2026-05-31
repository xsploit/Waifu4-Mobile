import { describe, expect, it } from 'vitest';
import { parseIrcMessage, splitIrcFrames } from './ircMessage.js';

describe('ircMessage', () => {
  it('parses Twitch PRIVMSG tags, prefix, command, params, and trailing text', () => {
    const parsed = parseIrcMessage(
      '@badge-info=;badges=moderator/1;color=;display-name=ModUser;id=abc;mod=1 :moduser!moduser@moduser.tmi.twitch.tv PRIVMSG #channel :hello @yourwifey',
    );

    expect(parsed?.command).toBe('PRIVMSG');
    expect(parsed?.tags['display-name']).toBe('ModUser');
    expect(parsed?.tags.badges).toBe('moderator/1');
    expect(parsed?.prefix).toBe('moduser!moduser@moduser.tmi.twitch.tv');
    expect(parsed?.params).toEqual(['#channel']);
    expect(parsed?.trailing).toBe('hello @yourwifey');
  });

  it('splits packed IRC frames', () => {
    expect(splitIrcFrames('PING :tmi.twitch.tv\r\nPONG :tmi.twitch.tv\r\n')).toEqual([
      'PING :tmi.twitch.tv',
      'PONG :tmi.twitch.tv',
    ]);
  });
});
