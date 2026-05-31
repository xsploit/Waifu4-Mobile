import { describe, expect, it } from 'vitest';
import { parseIrcMessage } from './ircMessage.js';
import { toTwitchChatMembershipEvent } from './TwitchIrcSource.js';

describe('TwitchIrcSource membership events', () => {
  it('maps Twitch JOIN and PART frames into membership events', () => {
    const join = parseIrcMessage(':viewer!viewer@viewer.tmi.twitch.tv JOIN #subsect');
    const part = parseIrcMessage(':viewer!viewer@viewer.tmi.twitch.tv PART #subsect');

    expect(join && toTwitchChatMembershipEvent(join, 'subsect')).toEqual(
      expect.objectContaining({
        channel: 'subsect',
        displayName: 'viewer',
        type: 'join',
        user: 'viewer',
      }),
    );
    expect(part && toTwitchChatMembershipEvent(part, 'subsect')).toEqual(
      expect.objectContaining({
        channel: 'subsect',
        displayName: 'viewer',
        type: 'part',
        user: 'viewer',
      }),
    );
  });

  it('ignores membership frames for other channels', () => {
    const join = parseIrcMessage(':viewer!viewer@viewer.tmi.twitch.tv JOIN #other');

    expect(join && toTwitchChatMembershipEvent(join, 'subsect')).toBeNull();
  });
});
