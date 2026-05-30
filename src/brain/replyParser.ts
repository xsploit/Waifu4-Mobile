import { coerceMetadata, type ReplyMetadata } from './BrainTypes';

export const TAG_OPEN = '<yw-meta>';
export const TAG_CLOSE = '</yw-meta>';

/**
 * How many trailing chars of `pending` could be the start of an (incomplete)
 * TAG_OPEN, and must therefore be held back rather than emitted as visible text.
 */
function heldBackLength(pending: string): number {
  const max = Math.min(pending.length, TAG_OPEN.length - 1);
  for (let len = max; len > 0; len--) {
    if (TAG_OPEN.startsWith(pending.slice(pending.length - len))) {
      return len;
    }
  }
  return 0;
}

function extractMetaJson(metaRaw: string): string | null {
  const start = metaRaw.indexOf(TAG_OPEN);
  if (start === -1) {
    return null;
  }
  const afterOpen = start + TAG_OPEN.length;
  const closeIdx = metaRaw.indexOf(TAG_CLOSE, afterOpen);
  const inner = closeIdx === -1 ? metaRaw.slice(afterOpen) : metaRaw.slice(afterOpen, closeIdx);
  const trimmed = inner.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export type LaneBFinish = {
  /** Any held-back tail that turned out not to be a tag; emit as a final delta. */
  flushedDelta: string;
  /** Full spoken text, metadata block stripped. The only thing sent to TTS. */
  visibleText: string;
  metadata: ReplyMetadata | null;
};

/**
 * Stateful incremental parser for Lane B (text + `<yw-meta>` block).
 * Streams visible text deltas while hiding the metadata block, even when the
 * tag arrives split across chunk boundaries. Never leaks raw `<yw-meta>` JSON.
 */
export function createLaneBParser() {
  let mode: 'visible' | 'meta' = 'visible';
  let pendingVisible = '';
  let metaRaw = '';
  let visibleEmitted = '';

  return {
    /** Feed a raw text delta. Returns the portion safe to show/speak now. */
    push(delta: string): string {
      if (mode === 'meta') {
        metaRaw += delta;
        return '';
      }
      pendingVisible += delta;
      const idx = pendingVisible.indexOf(TAG_OPEN);
      if (idx !== -1) {
        const visiblePart = pendingVisible.slice(0, idx);
        metaRaw += pendingVisible.slice(idx);
        pendingVisible = '';
        mode = 'meta';
        visibleEmitted += visiblePart;
        return visiblePart;
      }
      const hold = heldBackLength(pendingVisible);
      const emit = pendingVisible.slice(0, pendingVisible.length - hold);
      pendingVisible = pendingVisible.slice(pendingVisible.length - hold);
      visibleEmitted += emit;
      return emit;
    },

    finish(): LaneBFinish {
      let flushedDelta = '';
      if (mode === 'visible' && pendingVisible.length > 0) {
        // Stream ended with no tag — the held-back tail is just text.
        flushedDelta = pendingVisible;
        visibleEmitted += pendingVisible;
        pendingVisible = '';
      }
      const json = extractMetaJson(metaRaw);
      let metadata: ReplyMetadata | null = null;
      if (json) {
        try {
          metadata = coerceMetadata(JSON.parse(json));
        } catch {
          metadata = null;
        }
      }
      return { flushedDelta, visibleText: visibleEmitted.trimEnd(), metadata };
    },
  };
}

/** Non-streaming convenience: parse a complete Lane B reply string. */
export function parseLaneB(fullText: string): { visibleText: string; metadata: ReplyMetadata | null } {
  const parser = createLaneBParser();
  parser.push(fullText);
  const { visibleText, metadata } = parser.finish();
  return { visibleText, metadata };
}

/** Lane A: pull the spoken message + metadata out of a final structured object. */
export function extractStructuredReply(obj: unknown): {
  visibleText: string;
  metadata: ReplyMetadata | null;
} {
  const message =
    obj && typeof obj === 'object' && typeof (obj as { message?: unknown }).message === 'string'
      ? ((obj as { message: string }).message)
      : '';
  return { visibleText: message, metadata: coerceMetadata(obj) };
}

/** Monotonic delta for Lane A streaming, where `message` grows over time. */
export function monotonicDelta(previous: string, next: string): string {
  if (!next || next === previous) {
    return '';
  }
  return next.startsWith(previous) ? next.slice(previous.length) : '';
}
