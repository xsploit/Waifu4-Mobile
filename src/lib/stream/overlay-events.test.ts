import { describe, expect, it } from 'vitest';
import { parseDiscordStatus, parseOverlayServerEvent, shouldConnectOverlaySocket } from './overlay-events';

describe('overlay socket activation', () => {
  it('listens by default so backend runtime commands can reach the active frontend', () => {
    expect(shouldConnectOverlaySocket({})).toBe(true);
  });

  it('stays off by default in production builds', () => {
    expect(shouldConnectOverlaySocket({ PROD: true })).toBe(false);
    expect(shouldConnectOverlaySocket({ MODE: 'production' })).toBe(false);
  });

  it('keeps old explicit enable flags working', () => {
    expect(shouldConnectOverlaySocket({ VITE_STREAM_BOT_WS_ENABLED: 'true' })).toBe(true);
    expect(shouldConnectOverlaySocket({ VITE_OVERLAY_WS_ENABLED: '1' })).toBe(true);
  });

  it('can be explicitly disabled for static/no-backend runs', () => {
    expect(shouldConnectOverlaySocket({ VITE_STREAM_BOT_WS_ENABLED: 'false' })).toBe(false);
    expect(shouldConnectOverlaySocket({ VITE_OVERLAY_WS_ENABLED: 'off' })).toBe(false);
  });

  it('enables when an overlay socket URL is configured', () => {
    expect(shouldConnectOverlaySocket({ VITE_OVERLAY_WS_URL: 'ws://127.0.0.1:8797/ws' })).toBe(
      true,
    );
  });
});

describe('overlay server events', () => {
  it('accepts persona and character overlay commands from the backend runtime', () => {
    expect(
      parseOverlayServerEvent(
        JSON.stringify({ type: 'overlay:command', payload: { action: 'set-persona', persona: 'hikari' } }),
      ),
    ).toMatchObject({
      payload: { action: 'set-persona', persona: 'hikari' },
      type: 'overlay:command',
    });
    expect(
      parseOverlayServerEvent(
        JSON.stringify({ type: 'overlay:command', payload: { action: 'set-character', selector: 'sachi' } }),
      ),
    ).toMatchObject({
      payload: { action: 'set-character', selector: 'sachi' },
      type: 'overlay:command',
    });
  });

  it('accepts Twitch membership events from the backend runtime', () => {
    expect(
      parseOverlayServerEvent(
        JSON.stringify({
          type: 'twitch:membership',
          payload: {
            channel: 'subsect',
            displayName: 'Viewer',
            id: 'membership-1',
            timestamp: 1700000000000,
            type: 'join',
            user: 'viewer',
          },
        }),
      ),
    ).toMatchObject({
      payload: {
        channel: 'subsect',
        type: 'join',
        user: 'viewer',
      },
      type: 'twitch:membership',
    });
  });

  it('normalizes Discord transcript identity before it reaches the chat pipeline', () => {
    expect(
      parseOverlayServerEvent(
        JSON.stringify({
          type: 'discord-transcript',
          payload: {
            id: 'transcript-1',
            identity: {
              channelId: 'voice-7',
              displayName: 'Server Nickname',
              guildId: 'guild-42',
              userId: 'user-99',
              username: 'subsect',
            },
            text: 'hello from voice',
            timestamp: 1700000000000,
          },
        }),
      ),
    ).toMatchObject({
      payload: {
        displayName: 'Server Nickname',
        guildId: 'guild-42',
        login: 'subsect',
        userId: 'user-99',
        voiceChannelId: 'voice-7',
      },
      type: 'discord-transcript',
    });
  });

  it('rejects Discord transcripts without their guild, voice channel, or speaker identity', () => {
    expect(
      parseOverlayServerEvent(
        JSON.stringify({
          type: 'discord-transcript',
          payload: { text: 'missing identity', timestamp: 1700000000000 },
        }),
      ),
    ).toBeNull();
  });

  it('normalizes Discord status payloads from HTTP and websocket runtime updates', () => {
    expect(parseDiscordStatus({ connected: true, message: 'Voice bridge ready.' })).toEqual({
      detail: 'Voice bridge ready.',
      status: 'connected',
    });
    expect(parseDiscordStatus({ ok: true, status: { error: 'Voice bridge failed.', status: 'error' } })).toEqual({
      detail: 'Voice bridge failed.',
      status: 'error',
    });
  });
});
