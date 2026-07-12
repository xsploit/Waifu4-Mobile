import { getDesktopOverlaySocketUrl } from '../desktop/runtime';
import type { StreamBotEvent, StreamTwitchChatMessage, StreamTwitchMembershipEvent } from '../../shared/streamEvents';
import type { DiscordConnectionStatus } from '../chat/types';

export type OverlayTwitchChatMessage = StreamTwitchChatMessage;

export type OverlayTwitchMembershipEvent = StreamTwitchMembershipEvent;

export type OverlayDiscordTranscript = {
  displayName: string;
  guildId: string;
  id: string;
  login: string;
  text: string;
  timestamp: number;
  userId: string;
  voiceChannelId: string;
};

export type OverlayDiscordStatus = {
  detail: string;
  status: DiscordConnectionStatus;
};

type DiscordTranscriptServerEvent = {
  type: 'discord-transcript';
  payload: OverlayDiscordTranscript;
};

type DiscordStatusServerEvent = {
  type: 'discord-status';
  payload: OverlayDiscordStatus;
};

type BaseOverlayServerEvent = Exclude<
  StreamBotEvent<OverlayTwitchChatMessage, OverlayTwitchMembershipEvent>,
  { type: 'discord-transcript' | 'discord-status' | 'discord-error' }
>;

export type OverlayServerEvent =
  | BaseOverlayServerEvent
  | DiscordTranscriptServerEvent
  | DiscordStatusServerEvent;

function getConfiguredOverlaySocketUrl() {
  return (
    import.meta.env['VITE_OVERLAY_WS_URL'] ||
    import.meta.env['VITE_BOT_WS_URL'] ||
    ''
  ).trim();
}

const OVERLAY_SOCKET_PROTOCOL = 'yourwifey.overlay';
const OVERLAY_SESSION_TOKEN_KEY = 'yourwifey.overlay.token';

type OverlaySocketEnv = Partial<
  Record<
    | 'VITE_STREAM_BOT_WS_ENABLED'
    | 'VITE_OVERLAY_WS_ENABLED'
    | 'VITE_OVERLAY_WS_URL'
    | 'VITE_BOT_WS_URL'
    | 'MODE'
    | 'PROD',
    string | boolean | undefined
  >
>;

function readBooleanFlag(value: string | boolean | undefined) {
  if (typeof value === 'boolean') {
    return value;
  }
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) {
    return false;
  }
  return null;
}

export function shouldConnectOverlaySocket(env: OverlaySocketEnv = import.meta.env as OverlaySocketEnv) {
  const streamFlag = readBooleanFlag(env.VITE_STREAM_BOT_WS_ENABLED);
  const overlayFlag = readBooleanFlag(env.VITE_OVERLAY_WS_ENABLED);
  if (streamFlag === false || overlayFlag === false) {
    return false;
  }
  if (streamFlag === true || overlayFlag === true) {
    return true;
  }
  if (String(env.VITE_OVERLAY_WS_URL ?? env.VITE_BOT_WS_URL ?? '').trim()) {
    return true;
  }
  return !(env.PROD === true || env.MODE === 'production');
}

function getOverlaySocketToken() {
  const configured = (import.meta.env['VITE_OVERLAY_WS_TOKEN'] || '').trim();
  if (configured) {
    return configured;
  }

  if (typeof window === 'undefined') {
    return '';
  }

  const queryToken = new URLSearchParams(window.location.search).get('token')?.trim() || '';
  if (queryToken) {
    try {
      window.sessionStorage.setItem(OVERLAY_SESSION_TOKEN_KEY, queryToken);
    } catch {}
    return queryToken;
  }

  try {
    return window.sessionStorage.getItem(OVERLAY_SESSION_TOKEN_KEY)?.trim() || '';
  } catch {
    return '';
  }
}

export function getOverlaySocketProtocols() {
  const token = getOverlaySocketToken();
  return token ? [OVERLAY_SOCKET_PROTOCOL, token] : undefined;
}

export function getOverlaySocketUrl() {
  const configured = getConfiguredOverlaySocketUrl();
  if (configured) {
    return configured;
  }

  const desktopUrl = getDesktopOverlaySocketUrl();
  if (desktopUrl) {
    return desktopUrl;
  }

  const url = new URL('/ws', window.location.href);
  url.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

  if (url.port === '5173' || url.port === '4173') {
    url.port = import.meta.env['VITE_BOT_PORT'] || '8797';
  }

  return url.toString();
}

export function parseOverlayServerEvent(raw: string): OverlayServerEvent | null {
  try {
    const parsed = JSON.parse(raw) as Partial<OverlayServerEvent>;
    if (parsed.type === 'discord-transcript') {
      const transcript = parseDiscordTranscript(parsed.payload);
      return transcript ? { type: parsed.type, payload: transcript } : null;
    }
    if (parsed.type === 'discord-status') {
      const status = parseDiscordStatus(parsed.payload);
      return status ? { type: parsed.type, payload: status } : null;
    }
    return typeof parsed.type === 'string' ? (parsed as OverlayServerEvent) : null;
  } catch {
    return null;
  }
}

export function parseDiscordStatus(value: unknown): OverlayDiscordStatus | null {
  if (!isRecord(value)) {
    return null;
  }

  const statusSource = isRecord(value.status) ? value.status : value;

  const status = normalizeDiscordConnectionStatus(statusSource.status, statusSource.connected);
  if (!status) {
    return null;
  }

  return {
    detail:
      readString(statusSource.detail) ??
      readString(statusSource.message) ??
      readString(statusSource.error) ??
      readString(value.error) ??
      '',
    status,
  };
}

function parseDiscordTranscript(value: unknown): OverlayDiscordTranscript | null {
  if (!isRecord(value)) {
    return null;
  }

  const identity = isRecord(value.identity) ? value.identity : value;
  const guildId = readString(value.guildId) ?? readString(identity.guildId);
  const voiceChannelId =
    readString(value.voiceChannelId) ??
    readString(value.channelId) ??
    readString(identity.voiceChannelId) ??
    readString(identity.channelId);
  const userId = readString(value.userId) ?? readString(identity.userId);
  const text = readString(value.text);
  const timestamp = readTimestamp(value.timestamp);

  if (!guildId || !voiceChannelId || !userId || !text || timestamp === null) {
    return null;
  }

  const id =
    readString(value.id) ??
    readString(value.transcriptId) ??
    `discord-${guildId}-${voiceChannelId}-${userId}-${timestamp}`;
  const login = readString(value.login) ?? readString(identity.username) ?? userId;
  const displayName =
    readString(value.displayName) ?? readString(identity.displayName) ?? login;

  return { displayName, guildId, id, login, text, timestamp, userId, voiceChannelId };
}

function normalizeDiscordConnectionStatus(
  value: unknown,
  connected: unknown,
): DiscordConnectionStatus | null {
  if (value === 'connecting' || value === 'connected' || value === 'disconnected' || value === 'error') {
    return value;
  }
  if (typeof connected === 'boolean') {
    return connected ? 'connected' : 'disconnected';
  }
  return null;
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readTimestamp(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
