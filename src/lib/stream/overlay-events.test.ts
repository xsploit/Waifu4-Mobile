import { describe, expect, it } from 'vitest';
import { shouldConnectOverlaySocket } from './overlay-events';

describe('overlay socket activation', () => {
  it('listens by default so backend runtime commands can reach the active frontend', () => {
    expect(shouldConnectOverlaySocket({})).toBe(true);
  });

  it('keeps old explicit enable flags working', () => {
    expect(shouldConnectOverlaySocket({ VITE_STREAM_BOT_WS_ENABLED: 'true' })).toBe(true);
    expect(shouldConnectOverlaySocket({ VITE_OVERLAY_WS_ENABLED: '1' })).toBe(true);
  });

  it('can be explicitly disabled for static/no-backend runs', () => {
    expect(shouldConnectOverlaySocket({ VITE_STREAM_BOT_WS_ENABLED: 'false' })).toBe(false);
    expect(shouldConnectOverlaySocket({ VITE_OVERLAY_WS_ENABLED: 'off' })).toBe(false);
  });

  it('enables when an overlay socket URL is configured', () => {
    expect(shouldConnectOverlaySocket({ VITE_OVERLAY_WS_URL: 'ws://127.0.0.1:8797/ws' })).toBe(
      true,
    );
  });
});
