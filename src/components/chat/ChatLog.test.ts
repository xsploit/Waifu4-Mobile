import { describe, expect, it } from 'vitest';
import {
  getOverlayEmptyState,
  getVisibleOverlayHistory,
  sanitizeOverlayLabel,
  sanitizeOverlayText,
} from './ChatLog';

describe('chat overlay copy', () => {
  it('describes the unified Twitch and local chat path when empty and expanded', () => {
    expect(
      getOverlayEmptyState({
        channelName: 'SubSect',
        isGenerating: false,
        open: true,
      }),
    ).toBe('No chat messages yet. Twitch #SubSect and local messages will appear here.');
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
    const fakeKey = `sk-${'test_1234567890abcdef'}`;
    expect(sanitizeOverlayText(`see http://localhost:8787/path and ${fakeKey}`)).toBe(
      'see [local] and [key]',
    );
  });

  it('keeps older messages visible while expanded and only expires collapsed overlay messages', () => {
    const now = Date.now();
    const history = [
      {
        message: {
          content: 'old',
          createdAt: now - 120000,
          id: 'old',
          role: 'user' as const,
        },
      },
      {
        message: {
          content: 'new',
          createdAt: now - 1000,
          id: 'new',
          role: 'assistant' as const,
        },
      },
    ];

    expect(getVisibleOverlayHistory(history, now, true).map(({ message }) => message.id)).toEqual([
      'old',
      'new',
    ]);
    expect(getVisibleOverlayHistory(history, now, false).map(({ message }) => message.id)).toEqual([
      'new',
    ]);
  });
});
