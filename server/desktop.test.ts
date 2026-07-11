import { describe, expect, it } from 'vitest';
import {
  getAllowedDesktopCorsOrigin,
  getDesktopBackendIdentity,
  isDesktopShutdownAuthorized,
} from './desktop';

describe('desktop backend boundary', () => {
  it('allows the packaged renderer and local development origins', () => {
    expect(getAllowedDesktopCorsOrigin('webwaifu://app')).toBe('webwaifu://app');
    expect(getAllowedDesktopCorsOrigin('http://127.0.0.1:5173')).toBe(
      'http://127.0.0.1:5173',
    );
    expect(getAllowedDesktopCorsOrigin('https://example.com')).toBe('');
  });

  it('only identifies and shuts down a backend with its owner token', () => {
    const env = {
      WEBWAIFU_BACKEND_APP_ID: 'webwaifu4-rebuild',
      WEBWAIFU_BACKEND_OWNER_TOKEN: 'desktop-owner-token',
    };
    const headers = { 'x-webwaifu-backend-owner-token': 'desktop-owner-token' };

    expect(getDesktopBackendIdentity(headers, env)).toMatchObject({
      appId: 'webwaifu4-rebuild',
      ownerTokenMatched: true,
      shutdownSupported: true,
    });
    expect(isDesktopShutdownAuthorized(headers, env)).toBe(true);
    expect(isDesktopShutdownAuthorized({}, env)).toBe(false);
  });
});
