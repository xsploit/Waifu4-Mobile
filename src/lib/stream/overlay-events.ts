import { getDesktopOverlaySocketUrl } from '../desktop/runtime';
import type { StreamBotEvent, StreamTwitchChatMessage, StreamTwitchMembershipEvent } from '../../shared/streamEvents';

export type OverlayTwitchChatMessage = StreamTwitchChatMessage;

export type OverlayTwitchMembershipEvent = StreamTwitchMembershipEvent;

export type OverlayServerEvent = StreamBotEvent<OverlayTwitchChatMessage, OverlayTwitchMembershipEvent>;

function getConfiguredOverlaySocketUrl() {
  return (
    import.meta.env['VITE_OVERLAY_WS_URL'] ||
    import.meta.env['VITE_BOT_WS_URL'] ||
    ''
  ).trim();
}

export const OVERLAY_SOCKET_PROTOCOL = 'yourwifey.overlay';
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

export function getOverlaySocketToken() {
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
    return typeof parsed.type === 'string' ? (parsed as OverlayServerEvent) : null;
  } catch {
    return null;
  }
}
