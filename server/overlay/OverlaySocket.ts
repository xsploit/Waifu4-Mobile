import { createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders, IncomingMessage, Server as HttpServer } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import type { StreamBotEvent } from '../scheduler/ChatScheduler.js';

export type OverlayClientEvent =
  | { type: 'overlay:ready'; payload?: Record<string, unknown> }
  | { type: 'tts:done'; payload?: Record<string, unknown> }
  | { type: 'avatar:loaded'; payload?: Record<string, unknown> }
  | { type: 'manual:prompt'; payload?: { text?: string } };

const OVERLAY_TOKEN_VERSION = 'ywot1';
const OVERLAY_SOCKET_PROTOCOL = 'yourwifey.overlay';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const MAX_CLIENT_BUFFERED_BYTES = 1024 * 1024;

export type OverlaySocketOptions = {
  allowedOrigins?: readonly string[];
  env?: Record<string, string | undefined>;
  signingSecret?: string;
};

export type OverlaySocketAuthDecision =
  | { allowed: true; reason: 'local-dev-origin' | 'signed-overlay-token'; trusted: boolean }
  | { allowed: false; reason: 'forbidden-origin' | 'missing-overlay-token'; trusted: false };

function parseClientEvent(data: RawData): OverlayClientEvent | null {
  try {
    const parsed = JSON.parse(data.toString()) as Partial<OverlayClientEvent>;
    return typeof parsed.type === 'string' ? (parsed as OverlayClientEvent) : null;
  } catch {
    return null;
  }
}

function verifyOverlayToken(secret: string, token: string | null | undefined): boolean {
  if (!token) {
    return false;
  }
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== OVERLAY_TOKEN_VERSION || !parts[1] || !parts[2]) {
    return false;
  }

  const expected = createHmac('sha256', secret).update(parts[1]).digest('base64url');
  const leftBuffer = Buffer.from(parts[2]);
  const rightBuffer = Buffer.from(expected);

  if (leftBuffer.length !== rightBuffer.length || !timingSafeEqual(leftBuffer, rightBuffer)) {
    return false;
  }

  try {
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (!claims.sceneId || !claims.workspaceId) {
      return false;
    }
    if (claims.expiresAt && new Date(claims.expiresAt).getTime() < Date.now()) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function readOverlaySocketSigningSecret(
  env: Record<string, string | undefined> = process.env,
) {
  return env.BYOK_OVERLAY_SIGNING_SECRET?.trim() || env.OVERLAY_SIGNING_SECRET?.trim() || '';
}

export function readOverlaySocketToken(request: Pick<IncomingMessage, 'headers' | 'url'>) {
  const protocols =
    readHeader(request.headers, 'sec-websocket-protocol')
      ?.split(',')
      .map((value) => value.trim())
      .filter(Boolean) ?? [];
  return protocols.find((protocol) => protocol.startsWith(`${OVERLAY_TOKEN_VERSION}.`)) ?? null;
}

export function authorizeOverlaySocketRequest(
  request: Pick<IncomingMessage, 'headers' | 'url'>,
  options: OverlaySocketOptions = {},
): OverlaySocketAuthDecision {
  const env = options.env ?? process.env;
  const signingSecret = options.signingSecret ?? readOverlaySocketSigningSecret(env);
  if (signingSecret) {
    return verifyOverlayToken(signingSecret, readOverlaySocketToken(request))
      ? { allowed: true, reason: 'signed-overlay-token', trusted: true }
      : { allowed: false, reason: 'missing-overlay-token', trusted: false };
  }

  if (isOverlaySocketLocalDevRequest(request.headers, env, options.allowedOrigins)) {
    return { allowed: true, reason: 'local-dev-origin', trusted: true };
  }

  return { allowed: false, reason: 'forbidden-origin', trusted: false };
}

function isOverlaySocketLocalDevRequest(
  headers: IncomingHttpHeaders,
  env: Record<string, string | undefined>,
  allowedOrigins: readonly string[] | undefined,
) {
  if (env.NODE_ENV === 'production') {
    return false;
  }

  const origin = normalizeOrigin(readHeader(headers, 'origin'));
  if (origin && allowedOrigins?.includes(origin)) {
    return true;
  }

  const host = readHeader(headers, 'host') ?? '';
  if (!origin) {
    return isLocalHost(host);
  }

  try {
    return isLocalHost(new URL(origin).host) && isLocalHost(host);
  } catch {
    return false;
  }
}

function normalizeOrigin(value: string | undefined) {
  if (!value) {
    return null;
  }
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function readHeader(headers: IncomingHttpHeaders, name: string) {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function isLocalHost(value: string) {
  const trimmed = value.trim();
  const host = trimmed.startsWith('[')
    ? (trimmed.match(/^\[([^\]]+)\]/)?.[1] ?? '')
    : (trimmed.split(':')[0] ?? '');
  return LOCAL_HOSTS.has(host);
}

export class OverlaySocket {
  private readonly server: WebSocketServer;
  private readonly clients = new Set<WebSocket>();
  private readonly handleUpgrade: (request: IncomingMessage, socket: Duplex, head: Buffer) => void;

  constructor(
    private readonly httpServer: HttpServer,
    private readonly onClientEvent?: (event: OverlayClientEvent) => void,
    private readonly options: OverlaySocketOptions = {},
  ) {
    this.server = new WebSocketServer({
      handleProtocols(protocols) {
        return protocols.has(OVERLAY_SOCKET_PROTOCOL) ? OVERLAY_SOCKET_PROTOCOL : false;
      },
      noServer: true,
    });
    this.handleUpgrade = (request, socket, head) => {
      const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
      if (url.pathname !== '/ws') {
        return;
      }
      this.server.handleUpgrade(request, socket, head, (webSocket) => {
        this.server.emit('connection', webSocket, request);
      });
    };
    this.httpServer.on('upgrade', this.handleUpgrade);

    this.server.on('connection', (socket, request) => {
      const auth = authorizeOverlaySocketRequest(request, this.options);
      if (!auth.allowed) {
        socket.close(4001, 'Unauthorized');
        return;
      }

      this.clients.add(socket);
      this.broadcast({
        type: 'system:status',
        payload: { level: 'info', message: 'Overlay socket connected.' },
      });

      const cleanup = () => {
        socket.off('message', handleMessage);
        socket.off('close', cleanup);
        socket.off('error', cleanup);
        this.clients.delete(socket);
      };
      const handleMessage = (data: RawData) => {
        const event = parseClientEvent(data);
        if (event) {
          if (event.type === 'manual:prompt' && !auth.trusted) {
            return;
          }
          this.onClientEvent?.(event);
          return;
        }
        console.warn('[OverlaySocket] Ignored invalid client event payload.');
      };

      socket.on('message', handleMessage);
      socket.once('close', cleanup);
      socket.once('error', cleanup);
    });
  }

  get clientCount() {
    return this.clients.size;
  }

  broadcast(event: StreamBotEvent) {
    const payload = JSON.stringify(event);
    for (const client of this.clients) {
      if (client.readyState !== WebSocket.OPEN) {
        this.clients.delete(client);
        continue;
      }
      if (client.bufferedAmount > MAX_CLIENT_BUFFERED_BYTES) {
        client.close(1013, 'Overlay client too slow');
        this.clients.delete(client);
        continue;
      }
      client.send(payload, (error) => {
        if (error) {
          client.close(1011, 'Overlay send failed');
          this.clients.delete(client);
        }
      });
    }
  }

  close() {
    this.httpServer.off('upgrade', this.handleUpgrade);
    this.server.close();
    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();
  }
}
