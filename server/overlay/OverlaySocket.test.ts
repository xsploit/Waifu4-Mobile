import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  authorizeOverlaySocketRequest,
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
