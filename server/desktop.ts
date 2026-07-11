import type { IncomingHttpHeaders } from 'node:http';

const DESKTOP_BACKEND_OWNER_HEADER = 'x-webwaifu-backend-owner-token';

function readHeader(headers: IncomingHttpHeaders, name: string) {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

export function getAllowedDesktopCorsOrigin(origin: string | undefined) {
  if (!origin) {
    return '';
  }
  try {
    const parsed = new URL(origin);
    if (parsed.protocol === 'webwaifu:') {
      return origin;
    }
    if (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)
    ) {
      return origin;
    }
  } catch {
    return '';
  }
  return '';
}

export function getDesktopBackendIdentity(
  headers: IncomingHttpHeaders,
  env: NodeJS.ProcessEnv = process.env,
) {
  const ownerToken = env['WEBWAIFU_BACKEND_OWNER_TOKEN']?.trim() || '';
  const requestedToken = readHeader(headers, DESKTOP_BACKEND_OWNER_HEADER)?.trim() || '';
  return {
    appId: env['WEBWAIFU_BACKEND_APP_ID']?.trim() || 'webwaifu4-rebuild',
    ownerTokenMatched: Boolean(ownerToken) && requestedToken === ownerToken,
    pid: process.pid,
    shutdownSupported: Boolean(ownerToken),
  };
}

export function isDesktopShutdownAuthorized(
  headers: IncomingHttpHeaders,
  env: NodeJS.ProcessEnv = process.env,
) {
  const identity = getDesktopBackendIdentity(headers, env);
  return identity.shutdownSupported && identity.ownerTokenMatched;
}
