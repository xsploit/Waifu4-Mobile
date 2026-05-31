import { describe, expect, it } from 'vitest';
import type { ChatProvider } from '../ai/ChatProvider.js';
import type { StreamBotEvent } from '../scheduler/ChatScheduler.js';
import type { TwitchChatMessage, TwitchChatSource } from '../twitch/TwitchChatSource.js';
import { CommandRouter } from './CommandRouter.js';

class FakeSource implements TwitchChatSource {
  channel = 'subsect';
  sent: string[] = [];

  start() {}
  stop() {}
  switchChannel(channel: string) {
    this.channel = channel;
  }
  sendMessage(text: string) {
    this.sent.push(text);
  }
}

class FakeProvider implements ChatProvider {
  async complete() {
    return { text: 'ok' };
  }
  getModel() {
    return 'openai/gpt-5-nano';
  }
  getState() {
    return { stateMode: 'stateless', cachedTokens: 0 };
  }
}

function message(text: string): TwitchChatMessage {
  return {
    id: 'm1',
    user: 'subsect',
    displayName: 'Subsect',
    text,
    timestamp: Date.now(),
    badges: [],
    isMod: false,
    isBroadcaster: false,
  };
}

function createRouter(sendChatReplies: boolean) {
  const source = new FakeSource();
  const events: StreamBotEvent[] = [];
  const router = new CommandRouter({
    admins: ['subsect'],
    allowMods: true,
    emit: (event) => events.push(event),
    getChatSource: () => source,
    getStatus: () => ({ activeChatters: 0, overlayClients: 0, twitchMode: 'mock' }),
    prefixes: ['!yw'],
    provider: new FakeProvider(),
    sendChatReplies,
  });
  return { events, router, source };
}

describe('CommandRouter', () => {
  it('keeps command replies overlay-only until chat replies are enabled', () => {
    const { events, router, source } = createRouter(false);

    expect(router.handleMessage(message('!yw status'))).toBe(true);

    expect(source.sent).toEqual([]);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'command:response',
        payload: expect.objectContaining({ sendToChat: false }),
      }),
    );
  });

  it('sends command replies to chat after the toggle is enabled', () => {
    const { events, router, source } = createRouter(false);

    router.handleMessage(message('!yw chat on'));
    router.handleMessage(message('!yw status'));

    expect(source.sent.length).toBeGreaterThan(0);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'command:response',
        payload: expect.objectContaining({ sendToChat: true }),
      }),
    );
  });

  it('routes persona and character commands to the overlay command surface', () => {
    const { events, router } = createRouter(false);

    router.handleMessage(message('!yw personas'));
    router.handleMessage(message('!yw persona hikari'));
    router.handleMessage(message('!yw character sachi'));

    expect(events).toContainEqual({
      type: 'overlay:command',
      payload: { action: 'list-personas' },
    });
    expect(events).toContainEqual({
      type: 'overlay:command',
      payload: { action: 'set-persona', persona: 'hikari' },
    });
    expect(events).toContainEqual({
      type: 'overlay:command',
      payload: { action: 'set-character', selector: 'sachi' },
    });
  });
});
