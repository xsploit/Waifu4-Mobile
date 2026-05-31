import { createHmac } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { describe, expect, it } from 'vitest';
import {
  authorizeOverlaySocketRequest,
  OverlaySocket,
  readOverlaySocketSigningSecret,
  readOverlaySocketToken,
} from './OverlaySocket.js';

describe('OverlaySocket auth', () => {
  it('reads the dedicated overlay signing secret only', () => {
    expect(
      readOverlaySocketSigningSecret({
        OVERLAY_SIGNING_SECRET: 'overlay-secret',
      }),
    ).toBe('overlay-secret');
    expect(readOverlaySocketSigningSecret({ SUPABASE_SERVICE_ROLE_KEY: 'ignored' })).toBe('');
  });

  it('requires a valid signed token when a signing secret is configured', () => {
    const token = issueSocketToken('overlay-secret');

    expect(
      authorizeOverlaySocketRequest(
        request('/ws', {
          host: 'overlay.example.test',
          origin: 'https://overlay.example.test',
          'sec-websocket-protocol': `yourwifey.overlay, ${token}`,
        }),
        { signingSecret: 'overlay-secret' },
      ),
    ).toMatchObject({ allowed: true, reason: 'signed-overlay-token', trusted: true });

    expect(
      authorizeOverlaySocketRequest(
        request('/ws', {
          host: 'overlay.example.test',
          origin: 'https://overlay.example.test',
        }),
        { signingSecret: 'overlay-secret' },
      ),
    ).toMatchObject({ allowed: false, reason: 'missing-overlay-token', trusted: false });
  });

  it('allows localhost development sockets without making production anonymous', () => {
    expect(
      authorizeOverlaySocketRequest(
        request('/ws', {
          host: '127.0.0.1:8787',
          origin: 'http://localhost:4173',
        }),
        { env: {} },
      ),
    ).toMatchObject({ allowed: true, reason: 'local-dev-origin', trusted: true });

    expect(
      authorizeOverlaySocketRequest(
        request('/ws', {
          host: 'overlay.example.test',
          origin: 'https://overlay.example.test',
        }),
        { env: { NODE_ENV: 'production' } },
      ),
    ).toMatchObject({ allowed: false, reason: 'forbidden-origin', trusted: false });
  });

  it('extracts overlay socket tokens from the websocket protocol header only', () => {
    const token = issueSocketToken('overlay-secret');

    expect(
      readOverlaySocketToken(
        request('/ws', {
          host: 'overlay.example.test',
          'sec-websocket-protocol': `yourwifey.overlay, ${token}`,
        }),
      ),
    ).toBe(token);

    expect(
      readOverlaySocketToken(
        request(`/ws?token=${encodeURIComponent(token)}`, {
          host: 'overlay.example.test',
        }),
      ),
    ).toBeNull();
  });
});

describe('OverlaySocket runtime', () => {
  it('accepts localhost overlay clients and forwards client events', async () => {
    const httpServer = createServer((_req, res) => {
      res.statusCode = 404;
      res.end();
    });
    const clientEvents: string[] = [];
    const overlaySocket = new OverlaySocket(
      httpServer,
      (event) => clientEvents.push(event.type),
      { env: {} },
    );
    let client: WebSocket | null = null;

    try {
      await listen(httpServer);
      const { port } = httpServer.address() as AddressInfo;
      client = new WebSocket(`ws://127.0.0.1:${port}/ws`, ['yourwifey.overlay'], {
        headers: { Origin: 'http://localhost:5173' },
      });

      await waitForOpen(client);
      expect(overlaySocket.clientCount).toBe(1);

      client.send(JSON.stringify({ type: 'overlay:ready', payload: { page: 'app' } }));
      await waitFor(() => clientEvents.includes('overlay:ready'));
    } finally {
      client?.close();
      overlaySocket.close();
      await closeServer(httpServer);
    }
  });
});

function issueSocketToken(secret: string) {
  const payload = Buffer.from(
    JSON.stringify({
      expiresAt: '2099-01-01T00:00:00.000Z',
      sceneId: 'scene-1',
      workspaceId: 'workspace-1',
    }),
  ).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `ywot1.${payload}.${signature}`;
}

function request(url: string, headers: Record<string, string>) {
  return {
    headers,
    url,
  };
}

function listen(server: Server) {
  return new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
}

function closeServer(server: Server) {
  return new Promise<void>((resolve, reject) => {
    if (!server.listening) {
      resolve();
      return;
    }
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function waitForOpen(socket: WebSocket) {
  return new Promise<void>((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
}

async function waitFor(predicate: () => boolean) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for overlay socket event.');
}
