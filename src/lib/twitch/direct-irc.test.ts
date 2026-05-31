import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DirectTwitchIrcClient } from './direct-irc';

type Listener = () => void;

const sockets: FakeWebSocket[] = [];

class FakeWebSocket {
  static OPEN = 1;

  readyState = FakeWebSocket.OPEN;
  listeners = new Map<string, Listener[]>();

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

  emit(type: string) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener();
    }
  }

  send() {
    // test double
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
