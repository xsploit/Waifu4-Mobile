import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DirectTwitchIrcClient, type DirectTwitchChatMessage } from './direct-irc';

type Listener = (event?: { data?: string }) => void;

const sockets: FakeWebSocket[] = [];

class FakeWebSocket {
  static OPEN = 1;

  readyState = FakeWebSocket.OPEN;
  listeners = new Map<string, Listener[]>();
  sent: string[] = [];

  constructor(readonly url: string) {
    sockets.push(this);
  }

  addEventListener(type: string, listener: Listener) {
    const current = this.listeners.get(type) ?? [];
    current.push(listener);
    this.listeners.set(type, current);
  }

  close() {
    this.emit('close');
  }

  emit(type: string, event?: { data?: string }) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  send(data: string) {
    this.sent.push(data);
  }
}

describe('DirectTwitchIrcClient socket lifecycle', () => {
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    sockets.length = 0;
    vi.useFakeTimers();
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
    vi.useRealTimers();
  });

  it('ignores duplicate start calls while a socket is active', () => {
    const client = new DirectTwitchIrcClient('subsect', {
      onMessage: vi.fn(),
      onStatus: vi.fn(),
    });

    client.start();
    client.start();

    expect(sockets).toHaveLength(1);
  });

  it('joins Twitch IRC anonymously with tags enabled', () => {
    const client = new DirectTwitchIrcClient('SubSect', {
      onMessage: vi.fn(),
      onStatus: vi.fn(),
    });

    client.start();
    sockets[0]?.emit('open');

    expect(sockets[0]?.url).toBe('wss://irc-ws.chat.twitch.tv:443');
    expect(sockets[0]?.sent[0]).toBe('PASS SCHMOOPIIE\r\n');
    expect(sockets[0]?.sent[1]).toMatch(/^NICK justinfan\d+\r\n$/);
    expect(sockets[0]?.sent).toContain('CAP REQ :twitch.tv/tags twitch.tv/commands\r\n');
    expect(sockets[0]?.sent).toContain('JOIN #subsect\r\n');
  });

  it('responds to Twitch IRC pings', () => {
    const client = new DirectTwitchIrcClient('subsect', {
      onMessage: vi.fn(),
      onStatus: vi.fn(),
    });

    client.start();
    sockets[0]?.emit('open');
    sockets[0]?.emit('message', { data: 'PING :tmi.twitch.tv\r\n' });

    expect(sockets[0]?.sent).toContain('PONG :tmi.twitch.tv\r\n');
  });

  it('parses tagged Twitch IRC chat messages for the frontend intake path', () => {
    const messages: DirectTwitchChatMessage[] = [];
    const client = new DirectTwitchIrcClient('subsect', {
      onMessage: (message) => messages.push(message),
      onStatus: vi.fn(),
    });

    client.start();
    sockets[0]?.emit('open');
    sockets[0]?.emit('message', {
      data:
        '@badges=broadcaster/1;color=#00FF00;display-name=Sub\\sSect;id=abc-123;mod=0;tmi-sent-ts=1700000000000 :subsect!subsect@subsect.tmi.twitch.tv PRIVMSG #subsect :hello chat\r\n',
    });

    expect(messages).toEqual([
      {
        badges: ['broadcaster/1'],
        displayName: 'Sub Sect',
        id: 'abc-123',
        isBroadcaster: true,
        isMod: false,
        text: 'hello chat',
        timestamp: 1700000000000,
        user: 'subsect',
      },
    ]);
  });

  it('does not reconnect from a stale socket close after a replacement socket exists', () => {
    const client = new DirectTwitchIrcClient('subsect', {
      onMessage: vi.fn(),
      onStatus: vi.fn(),
    });

    client.start();
    const staleSocket = sockets[0]!;
    client.stop();
    client.start();
    expect(sockets).toHaveLength(2);

    staleSocket.emit('close');
    vi.advanceTimersByTime(30_000);

    expect(sockets).toHaveLength(2);
  });
});
