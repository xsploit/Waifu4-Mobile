import WebSocket from 'ws';
import type {
  TwitchChatSource,
  TwitchChatSourceHandlers,
} from './TwitchChatSource.js';
import { parseIrcMessage, splitIrcFrames } from './ircMessage.js';

export type TwitchIrcSourceOptions = {
  channel: string;
  botUsername: string;
  oauthToken: string;
  url?: string;
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
};

const DEFAULT_IRC_WS_URL = 'wss://irc-ws.chat.twitch.tv:443';
const SEND_COOLDOWN_MS = 1500;
const MAX_SEND_QUEUE = 20;

function normalizeChannel(channel: string) {
  return channel.trim().toLowerCase().replace(/^#/, '');
}

function normalizeOauthToken(token: string) {
  const trimmed = token.trim();
  if (!trimmed) {
    return '';
  }
  return trimmed.startsWith('oauth:') ? trimmed : `oauth:${trimmed}`;
}

function createAnonymousNick() {
  return `justinfan${Math.floor(10000 + Math.random() * 89999)}`;
}

function parseBadges(value: string | undefined) {
  if (!value) {
    return [];
  }
  return value.split(',').map((badge) => badge.trim()).filter(Boolean);
}

function loginFromPrefix(prefix: string | undefined) {
  if (!prefix) {
    return '';
  }
  return prefix.split('!')[0]?.toLowerCase() ?? '';
}

export class TwitchIrcSource implements TwitchChatSource {
  private currentChannel: string;
  private readonly botUsername: string;
  private readonly oauthToken: string;
  private readonly url: string;
  private readonly reconnectBaseMs: number;
  private readonly reconnectMaxMs: number;
  private socket: WebSocket | null = null;
  private cleanupSocketHandlers: (() => void) | null = null;
  private stopped = true;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private sendTimer: NodeJS.Timeout | null = null;
  private readonly sendQueue: string[] = [];
  private lastSendAt = 0;

  constructor(
    options: TwitchIrcSourceOptions,
    private readonly handlers: TwitchChatSourceHandlers,
  ) {
    this.currentChannel = normalizeChannel(options.channel);
    this.botUsername = options.botUsername.trim().toLowerCase() || createAnonymousNick();
    this.oauthToken = normalizeOauthToken(options.oauthToken);
    this.url = options.url ?? DEFAULT_IRC_WS_URL;
    this.reconnectBaseMs = options.reconnectBaseMs ?? 1000;
    this.reconnectMaxMs = options.reconnectMaxMs ?? 30000;
  }

  get channel() {
    return this.currentChannel;
  }

  start() {
    if (!this.currentChannel) {
      this.handlers.onStatus({
        level: 'error',
        message: 'Twitch IRC needs TWITCH_CHANNEL.',
      });
      return;
    }

    this.stopped = false;
    this.connect();
  }

  stop() {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.sendTimer) {
      clearTimeout(this.sendTimer);
      this.sendTimer = null;
    }
    this.sendQueue.length = 0;
    const socket = this.socket;
    this.cleanupSocketHandlers?.();
    this.cleanupSocketHandlers = null;
    socket?.close();
    this.socket = null;
  }

  sendMessage(text: string) {
    const content = text.replace(/\s+/g, ' ').trim();
    if (!content || this.socket?.readyState !== WebSocket.OPEN) {
      return;
    }
    if (!this.oauthToken) {
      this.handlers.onStatus({
        level: 'warning',
        message: 'Anonymous Twitch IRC is read-only; skipping chat send.',
      });
      return;
    }

    if (this.sendQueue.length >= MAX_SEND_QUEUE) {
      this.sendQueue.shift();
    }
    this.sendQueue.push(content.slice(0, 450));
    this.scheduleSendFlush();
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
    this.handlers.onStatus({
      level: 'info',
      message: `Twitch IRC channel switched from #${previousChannel} to #${this.currentChannel}.`,
    });
  }

  private connect() {
    if (this.stopped) {
      return;
    }

    this.cleanupSocketHandlers?.();
    const socket = new WebSocket(this.url);
    this.socket = socket;
    const cleanup = () => {
      socket.off('open', handleOpen);
      socket.off('message', handleMessage);
      socket.off('close', handleClose);
      socket.off('error', handleError);
      if (this.cleanupSocketHandlers === cleanup) {
        this.cleanupSocketHandlers = null;
      }
    };
    const handleOpen = () => {
      this.reconnectAttempts = 0;
      this.handlers.onStatus({
        level: 'info',
        message: `Connected to Twitch IRC for #${this.currentChannel} as ${this.botUsername}${this.oauthToken ? '' : ' (anonymous read-only)'}.`,
      });
      this.sendRaw('CAP REQ :twitch.tv/membership twitch.tv/tags twitch.tv/commands');
      if (this.oauthToken) {
        this.sendRaw(`PASS ${this.oauthToken}`);
      }
      this.sendRaw(`NICK ${this.botUsername}`);
      this.sendRaw(`JOIN #${this.currentChannel}`);
      this.scheduleSendFlush();
    };

    const handleMessage = (payload: WebSocket.RawData) => {
      const data = typeof payload === 'string' ? payload : payload.toString('utf8');
      this.handleData(data);
    };

    const handleClose = () => {
      cleanup();
      this.handlers.onStatus({
        level: this.stopped ? 'info' : 'warning',
        message: this.stopped ? 'Twitch IRC stopped.' : 'Twitch IRC disconnected; reconnecting.',
      });
      if (this.socket === socket) {
        this.socket = null;
      }
      this.scheduleReconnect();
    };

    const handleError = (error: Error) => {
      this.handlers.onStatus({
        level: 'error',
        message: `Twitch IRC socket error: ${error.message}`,
      });
    };

    this.cleanupSocketHandlers = cleanup;
    socket.on('open', handleOpen);
    socket.on('message', handleMessage);
    socket.on('close', handleClose);
    socket.on('error', handleError);
  }

  private scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) {
      return;
    }

    this.reconnectAttempts += 1;
    const delay = Math.min(
      this.reconnectBaseMs * 2 ** Math.min(this.reconnectAttempts, 6),
      this.reconnectMaxMs,
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private scheduleSendFlush() {
    if (this.sendTimer || this.stopped || this.socket?.readyState !== WebSocket.OPEN) {
      return;
    }

    const waitMs = Math.max(0, SEND_COOLDOWN_MS - (Date.now() - this.lastSendAt));
    this.sendTimer = setTimeout(() => {
      this.sendTimer = null;
      const content = this.sendQueue.shift();
      if (content && this.socket?.readyState === WebSocket.OPEN) {
        this.sendRaw(`PRIVMSG #${this.currentChannel} :${content}`);
        this.lastSendAt = Date.now();
      }
      if (this.sendQueue.length > 0) {
        this.scheduleSendFlush();
      }
    }, waitMs);
  }

  private handleData(data: string) {
    for (const frame of splitIrcFrames(data)) {
      const parsed = parseIrcMessage(frame);
      if (!parsed) {
        continue;
      }

      if (parsed.command === 'PING') {
        this.sendRaw(`PONG :${parsed.trailing ?? 'tmi.twitch.tv'}`);
        continue;
      }

      if (parsed.command === 'NOTICE' && parsed.trailing) {
        this.handlers.onStatus({
          level: parsed.trailing.toLowerCase().includes('failed') ? 'error' : 'warning',
          message: `Twitch IRC notice: ${parsed.trailing}`,
        });
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

      const badges = parseBadges(parsed.tags.badges);
      this.handlers.onMessage({
        id: parsed.tags.id || `irc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        user,
        displayName: parsed.tags['display-name'] || user,
        text,
        timestamp: Date.now(),
        badges,
        isMod: parsed.tags.mod === '1' || badges.some((badge) => badge.startsWith('moderator/')),
        isBroadcaster: user === this.currentChannel || badges.some((badge) => badge.startsWith('broadcaster/')),
      });
    }
  }

  private sendRaw(line: string) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(`${line}\r\n`);
    }
  }
}
