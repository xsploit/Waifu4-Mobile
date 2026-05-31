import { describe, expect, it } from 'vitest';
import {
  getDirectStreamCommandHelp,
  isDirectStreamCommandAuthorized,
  parseDirectStreamCommand,
  type StreamCommandMessage,
} from './stream-command';

const baseMessage: StreamCommandMessage = {
  displayName: 'Viewer',
  isBroadcaster: false,
  isMod: false,
  text: 'hello',
  user: 'viewer',
};

function parse(text: string, message: Partial<StreamCommandMessage> = {}) {
  return parseDirectStreamCommand(
    {
      ...baseMessage,
      ...message,
      text,
    },
    {
      admins: ['subsect'],
      allowMods: true,
      allowTrustedControllers: true,
      prefixes: ['!ww4', '!webwaifu', '!yw', '!yourwifey', '!waifu'],
    },
  );
}

describe('direct Twitch stream commands', () => {
  it('ignores non-command chat', () => {
    expect(parse('hello @hikari')).toEqual({ matched: false });
  });

  it('requires a trusted controller, admin, broadcaster, or mod', () => {
    expect(parse('!yw status')).toMatchObject({
      authorized: false,
      commandText: 'status',
      matched: true,
    });

    expect(isDirectStreamCommandAuthorized(baseMessage, {
      admins: ['subsect'],
      allowMods: true,
      allowTrustedControllers: true,
    })).toBe(false);
    expect(isDirectStreamCommandAuthorized({ ...baseMessage, user: 'subsect' }, {
      admins: ['subsect'],
      allowMods: true,
      allowTrustedControllers: true,
    })).toBe(true);
  });

  it('parses frontend-only audio and persona commands', () => {
    expect(parse('!yw audio', { isTrustedController: true })).toMatchObject({
      authorized: true,
      command: { kind: 'audio' },
      matched: true,
    });
    expect(parse('!yw persona hikari', { isTrustedController: true })).toMatchObject({
      command: { kind: 'set-persona', selector: 'hikari' },
    });
    expect(parse('!yw char sachi-vrm', { isTrustedController: true })).toMatchObject({
      command: { kind: 'set-character', selector: 'sachi-vrm' },
    });
  });

  it('preserves quoted command arguments and boolean aliases', () => {
    expect(parse('!yw say \"hello bright star\"', { user: 'subsect' })).toMatchObject({
      command: { kind: 'say', text: 'hello bright star' },
    });
    expect(parse('!yw autospeak enabled', { user: 'subsect' })).toMatchObject({
      command: { kind: 'set-auto-speak', enabled: true },
    });
    expect(parse('!yw chat off', { user: 'subsect' })).toMatchObject({
      command: { kind: 'set-chat-overlay', enabled: false },
    });
  });

  it('uses the copied command grammar aliases for avatar, camera, and animation control', () => {
    expect(parse('!webwaifu vrms', { isBroadcaster: true })).toMatchObject({
      command: { kind: 'list-vrms' },
    });
    expect(parse('!waifu camera close', { isBroadcaster: true })).toMatchObject({
      command: { kind: 'set-camera-view', mode: 'half-body' },
    });
    expect(parse('!ww4 anim speed 1.5', { isBroadcaster: true })).toMatchObject({
      command: { kind: 'set-animation-speed', speed: 1.5 },
    });
  });

  it('falls back to help for unknown commands', () => {
    expect(parse('!yw whatever', { isMod: true })).toMatchObject({
      command: { kind: 'help' },
    });
    expect(getDirectStreamCommandHelp()).toContain('persona <riko|neuro|hikari>');
  });
});
