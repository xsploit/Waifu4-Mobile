import { getDesktopOverlaySocketUrl } from '../desktop/runtime';

export type OverlayTwitchChatMessage = {
  id: string;
  user: string;
  displayName: string;
  text: string;
  timestamp: number;
  badges: string[];
  isMod: boolean;
  isBroadcaster: boolean;
};

export type OverlayServerEvent =
  | { type: 'chat:message'; payload: OverlayTwitchChatMessage }
  | {
      type: 'chat:batch';
      payload: {
        activeChatters: number;
        batchSize: number;
        messages: OverlayTwitchChatMessage[];
      };
    }
  | {
      type: 'ai:thinking';
      payload: {
        jobId: string;
        mode: 'direct' | 'batch';
        activeChatters: number;
      };
    }
  | {
      type: 'ai:delta';
      payload: {
        jobId: string;
        mode: 'direct' | 'batch';
        delta: string;
      };
    }
  | {
      type: 'ai:reply';
      payload: {
        jobId: string;
        mode: 'direct' | 'batch';
        text: string;
        target?: OverlayTwitchChatMessage;
      };
    }
  | {
      type: 'overlay:command';
      payload:
        | { action: 'reload' }
        | { action: 'set-ai-model'; model: string }
        | { action: 'set-persona'; persona: string }
        | { action: 'list-vrms' }
        | { action: 'load-vrm'; model: string }
        | { action: 'set-camera-view'; viewMode: 'full-body' | 'half-body' }
        | { action: 'list-animations' }
        | { action: 'play-animation'; selector: string }
        | { action: 'sequencer'; command: 'start' | 'stop' | 'next' | 'random' }
        | { action: 'set-animation-speed'; speed: number }
        | { action: 'set-animation-duration'; duration: number }
        | { action: 'set-tts'; enabled: boolean }
        | { action: 'set-auto-speak'; enabled: boolean }
        | { action: 'say'; text: string };
    }
  | { type: 'command:response'; payload: { text: string; sendToChat: boolean } }
  | { type: 'system:status'; payload: { level: 'info' | 'warning' | 'error'; message: string } };

function getConfiguredOverlaySocketUrl() {
  return (
    import.meta.env['VITE_OVERLAY_WS_URL'] ||
    import.meta.env['VITE_BOT_WS_URL'] ||
    ''
  ).trim();
}

export const OVERLAY_SOCKET_PROTOCOL = 'yourwifey.overlay';
const OVERLAY_SESSION_TOKEN_KEY = 'yourwifey.overlay.token';

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
