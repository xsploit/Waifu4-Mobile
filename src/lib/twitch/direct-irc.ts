export type DirectTwitchChatMessage = {
  id: string;
  user: string;
  displayName: string;
  text: string;
  timestamp: number;
  badges: string[];
  isMod: boolean;
  isBroadcaster: boolean;
};

export type DirectTwitchIrcHandlers = {
  onMessage: (message: DirectTwitchChatMessage) => void;
  onStatus: (message: string, level?: 'info' | 'warning' | 'error') => void;
};

type ParsedIrcMessage = {
  tags: Record<string, string>;
  prefix?: string;
  command: string;
  params: string[];
  trailing?: string;
};

const TWITCH_IRC_WS_URL = 'wss://irc-ws.chat.twitch.tv:443';
const RECONNECT_BASE_MS = 3000;
const RECONNECT_MAX_MS = 30000;

function normalizeChannel(channel: string) {
  return channel.trim().toLowerCase().replace(/^#/, '');
}

function createAnonNick() {
  return `justinfan${Math.floor(10000 + Math.random() * 89999)}`;
}

function splitFrames(data: string) {
  return data
    .split(/\r?\n/)
    .map((frame) => frame.trim())
    .filter(Boolean);
}

function parseTags(raw: string) {
  const tags: Record<string, string> = {};
  raw.split(';').forEach((part) => {
    const [key, value = ''] = part.split('=');
    if (key) {
      tags[key] = value;
    }
  });
  return tags;
}

function parseIrcMessage(frame: string): ParsedIrcMessage | null {
  let rest = frame.trim();
  const tags: Record<string, string> = {};
  let prefix: string | undefined;

  if (rest.startsWith('@')) {
    const spaceIndex = rest.indexOf(' ');
    if (spaceIndex === -1) {
      return null;
    }
    Object.assign(tags, parseTags(rest.slice(1, spaceIndex)));
    rest = rest.slice(spaceIndex + 1);
  }

  if (rest.startsWith(':')) {
    const spaceIndex = rest.indexOf(' ');
    if (spaceIndex === -1) {
      return null;
    }
    prefix = rest.slice(1, spaceIndex);
    rest = rest.slice(spaceIndex + 1);
  }

  let trailing: string | undefined;
  const trailingIndex = rest.indexOf(' :');
  if (trailingIndex !== -1) {
    trailing = rest.slice(trailingIndex + 2);
    rest = rest.slice(0, trailingIndex);
  }

  const [command, ...params] = rest.split(/\s+/).filter(Boolean);
  if (!command) {
    return null;
  }

  return { tags, prefix, command, params, trailing };
}

function parseBadges(value: string | undefined) {
  if (!value) {
    return [];
  }
  return value
    .split(',')
    .map((badge) => badge.trim())
    .filter(Boolean);
}

function loginFromPrefix(prefix: string | undefined) {
  return prefix?.split('!')[0]?.toLowerCase() ?? '';
}

export class DirectTwitchIrcClient {
  private currentChannel: string;
  private socket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private reconnectAttempt = 0;
  private stopped = true;
  private readonly nick = createAnonNick();

  constructor(
    channel: string,
    private readonly handlers: DirectTwitchIrcHandlers,
  ) {
    this.currentChannel = normalizeChannel(channel);
  }

  get channel() {
    return this.currentChannel;
  }

  start() {
    if (!this.currentChannel) {
      this.handlers.onStatus('Twitch IRC channel is empty.', 'error');
      return;
    }
    if (!this.stopped && this.socket) {
      return;
    }

    this.stopped = false;
    this.connect();
  }

  stop() {
    this.stopped = true;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempt = 0;
    this.socket?.close();
    this.socket = null;
  }

  switchChannel(channel: string) {
    const nextChannel = normalizeChannel(channel);
    if (!nextChannel || nextChannel === this.currentChannel) {
      return;
    }

    const previousChannel = this.currentChannel;
    this.currentChannel = nextChannel;

    if (this.socket?.readyState === WebSocket.OPEN) {
      this.sendRaw(`PART #${previousChannel}`);
      this.sendRaw(`JOIN #${this.currentChannel}`);
    }

    this.handlers.onStatus(
      `Direct Twitch IRC switched from #${previousChannel} to #${this.currentChannel}.`,
      'info',
    );
  }

  private connect() {
    if (this.stopped) {
      return;
    }

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    const socket = new WebSocket(TWITCH_IRC_WS_URL);
    this.socket = socket;

    socket.addEventListener('open', () => {
      this.reconnectAttempt = 0;
      this.handlers.onStatus(
        `Direct Twitch IRC connected to #${this.currentChannel} as ${this.nick}.`,
        'info',
      );
      this.sendRaw('PASS SCHMOOPIIE');
      this.sendRaw(`NICK ${this.nick}`);
      this.sendRaw('CAP REQ :twitch.tv/tags twitch.tv/commands');
      this.sendRaw(`JOIN #${this.currentChannel}`);
    });

    socket.addEventListener('message', (event) => {
      if (typeof event.data === 'string') {
        this.handleData(event.data);
      }
    });

    socket.addEventListener('close', () => {
      if (this.socket !== socket) {
        return;
      }
      this.socket = null;
      if (this.stopped) {
        return;
      }
      this.handlers.onStatus('Direct Twitch IRC disconnected; reconnecting.', 'warning');
      this.scheduleReconnect();
    });

    socket.addEventListener('error', () => {
      this.handlers.onStatus('Direct Twitch IRC socket error.', 'warning');
      socket.close();
    });
  }

  private scheduleReconnect() {
    if (this.reconnectTimer !== null || this.stopped) {
      return;
    }

    this.reconnectAttempt += 1;
    const baseDelay = Math.min(
      RECONNECT_MAX_MS,
      RECONNECT_BASE_MS * 2 ** Math.min(this.reconnectAttempt - 1, 4),
    );
    const jitter = 0.75 + Math.random() * 0.5;

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, Math.round(baseDelay * jitter));
  }

  private handleData(data: string) {
    for (const frame of splitFrames(data)) {
      const parsed = parseIrcMessage(frame);
      if (!parsed) {
        continue;
      }

      if (parsed.command === 'PING') {
        this.sendRaw(`PONG :${parsed.trailing ?? 'tmi.twitch.tv'}`);
        continue;
      }

      if (parsed.command === 'RECONNECT') {
        this.socket?.close();
        continue;
      }

      if (parsed.command === 'NOTICE' && parsed.trailing) {
        this.handlers.onStatus(`Twitch IRC notice: ${parsed.trailing}`, 'warning');
        continue;
      }

      if (parsed.command !== 'PRIVMSG') {
        continue;
      }

      const user = loginFromPrefix(parsed.prefix);
      const text = parsed.trailing?.trim() ?? '';
      if (!user || !text) {
        continue;
      }

      const badges = parseBadges(parsed.tags['badges']);
      this.handlers.onMessage({
        id:
          parsed.tags['id'] || `direct-irc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        user,
        displayName: parsed.tags['display-name'] || user,
        text,
        timestamp: Number.parseInt(parsed.tags['tmi-sent-ts'] ?? '', 10) || Date.now(),
        badges,
        isMod: parsed.tags['mod'] === '1' || badges.some((badge) => badge.startsWith('moderator/')),
        isBroadcaster:
          user === this.currentChannel || badges.some((badge) => badge.startsWith('broadcaster/')),
      });
    }
  }

  private sendRaw(line: string) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(`${line}\r\n`);
    }
  }
}
