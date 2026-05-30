import { describe, expect, it } from 'vitest';
import { getOverlayEmptyState, sanitizeOverlayLabel, sanitizeOverlayText } from './ChatLog';

describe('chat overlay copy', () => {
  it('describes the unified Twitch and local chat path when empty and expanded', () => {
    expect(
      getOverlayEmptyState({
        channelName: 'SubSect',
        isGenerating: false,
        open: true,
      }),
    ).toBe('No live messages yet. Twitch #SubSect and local test messages will appear here.');
  });

  it('uses a compact empty state while the overlay is collapsed', () => {
    expect(
      getOverlayEmptyState({
        channelName: 'subsect',
        isGenerating: false,
        open: false,
      }),
    ).toBe('No live messages yet.');
  });

  it('does not show stale waiting copy during first-reply generation', () => {
    expect(
      getOverlayEmptyState({
        channelName: 'subsect',
        isGenerating: true,
        open: true,
      }),
    ).toBe('Preparing the next reply...');
  });

  it('keeps overlay labels and text safe for broadcast display', () => {
    expect(sanitizeOverlayLabel('Viewer Name!!!')).toBe('ViewerName');
    expect(sanitizeOverlayText('see http://localhost:8787/path and sk-test_1234567890abcdef')).toBe(
      'see [local] and [key]',
    );
  });
});
