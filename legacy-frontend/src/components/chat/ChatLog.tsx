import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { ChatMessage } from '../../lib/chat/types';

type ChatLogProps = {
  activePersonaName?: string;
  botMentionTag?: string;
  channelName?: string;
  displayOverrides?: Record<string, string>;
  history: ChatMessage[];
  isGenerating: boolean;
  modeLabel?: string;
  onClear: () => void;
  onToggle: () => void;
  open: boolean;
};

const MESSAGE_VISIBLE_MS = 70000;
const MESSAGE_FADE_MS = 16000;
const MESSAGE_TICK_MS = 1000;

type MessageStyle = CSSProperties & {
  '--msg-opacity'?: string;
  '--msg-lift'?: string;
};

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    // Clipboard access is optional.
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function sanitizeOverlayText(value: string) {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, '[key]')
    .replace(/\boauth:[A-Za-z0-9_-]+\b/gi, '[token]')
    .replace(
      /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?(?:\/\S*)?/gi,
      '[local]',
    )
    .replace(/\b(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?(?:\/\S*)?\b/gi, '[local]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/g, '[ip]')
    .replace(/[A-Za-z]:\\[^\s"'<>]+/g, '[path]')
    .replace(/https?:\/\/\S+/gi, '[link]')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sanitizeOverlayLabel(value: string) {
  const cleaned = sanitizeOverlayText(value)
    .replace(/[^a-z0-9_.-]+/gi, '')
    .slice(0, 24);
  return cleaned || 'CHAT';
}

function isBroadcastMessage(message: ChatMessage, content: string) {
  if (message.role === 'assistant') {
    return Boolean(content.trim());
  }

  return message.role === 'user' && Boolean(content.trim());
}

function getOverlayMessage(message: ChatMessage, content: string, assistantLabel: string) {
  const twitchMatch = content.match(/^\[Twitch\]\s*([^:]+):\s*([\s\S]*)$/);
  if (twitchMatch) {
    return {
      label: sanitizeOverlayLabel(twitchMatch[1] ?? 'CHAT'),
      text: sanitizeOverlayText(twitchMatch[2] ?? content),
      tone: 'twitch',
    };
  }

  if (message.role === 'assistant') {
    return { label: assistantLabel, text: sanitizeOverlayText(content), tone: 'assistant' };
  }

  return { label: 'LOCAL', text: sanitizeOverlayText(content), tone: 'local' };
}

export function getOverlayEmptyState({
  channelName,
  isGenerating,
  open,
}: {
  channelName: string;
  isGenerating: boolean;
  open: boolean;
}) {
  if (isGenerating) {
    return 'Preparing the next reply...';
  }

  if (!open) {
    return 'No live messages yet.';
  }

  const channelLabel = `#${sanitizeOverlayLabel(channelName || 'subsect')}`;
  return `No live messages yet. Twitch ${channelLabel} and local test messages will appear here.`;
}

export const ChatLog = memo(function ChatLog({
  activePersonaName = 'Riko',
  botMentionTag = '@Riko',
  channelName = 'subsect',
  displayOverrides = {},
  history,
  isGenerating,
  modeLabel = 'Queue',
  onClear,
  onToggle,
  open,
}: ChatLogProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const assistantLabel = sanitizeOverlayLabel(activePersonaName);
  const broadcastHistory = useMemo(
    () =>
      history
        .map((message) => ({
          displayContent: sanitizeOverlayText(displayOverrides[message.id] ?? message.content),
          message,
        }))
        .filter(({ displayContent, message }) => isBroadcastMessage(message, displayContent)),
    [displayOverrides, history],
  );
  const liveHistory = broadcastHistory.filter(
    ({ message }) => now - message.createdAt <= MESSAGE_VISIBLE_MS,
  );
  const visibleHistory = open ? liveHistory.slice(-18) : liveHistory.slice(-6);
  const latestVisibleMessage = visibleHistory[visibleHistory.length - 1];
  const latestVisibleMessageKey = latestVisibleMessage
    ? `${latestVisibleMessage.message.id}:${latestVisibleMessage.displayContent.length}`
    : 'empty';

  useEffect(() => {
    if (broadcastHistory.length === 0) {
      return;
    }

    let cancelled = false;
    let timer: number | null = null;

    const getNextRefreshMs = (currentTime: number) => {
      let nextRefreshMs = MESSAGE_TICK_MS;
      for (const { message } of broadcastHistory) {
        const fadeStartAt = message.createdAt + MESSAGE_VISIBLE_MS - MESSAGE_FADE_MS;
        const expiresAt = message.createdAt + MESSAGE_VISIBLE_MS;
        const nextBoundaryAt = currentTime < fadeStartAt ? fadeStartAt : expiresAt;
        const delayMs =
          nextBoundaryAt > currentTime ? nextBoundaryAt - currentTime : MESSAGE_TICK_MS;
        nextRefreshMs = Math.min(nextRefreshMs, delayMs);
      }
      return clamp(Math.ceil(nextRefreshMs), 250, MESSAGE_TICK_MS);
    };

    const schedule = (delayMs: number) => {
      timer = window.setTimeout(() => {
        if (cancelled) {
          return;
        }
        if (document.visibilityState === 'hidden') {
          schedule(MESSAGE_TICK_MS);
          return;
        }
        const currentTime = Date.now();
        setNow(currentTime);
        schedule(getNextRefreshMs(currentTime));
      }, delayMs);
    };

    schedule(getNextRefreshMs(Date.now()));

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'hidden') {
        setNow(Date.now());
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [broadcastHistory]);

  useEffect(() => {
    const scrollToBottom = () => {
      const element = scrollRef.current;
      if (element) {
        element.scrollTop = element.scrollHeight;
      }
    };

    const animationFrame = window.requestAnimationFrame(scrollToBottom);
    const layoutSettleTimer = window.setTimeout(scrollToBottom, 80);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(layoutSettleTimer);
    };
  }, [displayOverrides, isGenerating, latestVisibleMessageKey, open]);

  return (
    <div
      className={`log-panel ${open ? 'open' : 'peek'}`}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="log-header">
        <button
          className="log-header-main"
          onClick={onToggle}
          title={open ? 'Collapse Twitch overlay chat' : 'Expand Twitch overlay chat'}
          type="button"
        >
          <span className="log-live-dot" />
          <span className="log-title">Live Chat</span>
          <span className="log-channel">#{sanitizeOverlayLabel(channelName)}</span>
          <span className="log-tag">{botMentionTag}</span>
          <span className="log-state">{modeLabel}</span>
        </button>
        <div className="log-header-right">
          <button className="log-btn" onClick={onClear} type="button">
            Clear
          </button>
          <span className="log-count">{liveHistory.length}</span>
        </div>
      </div>
      <div className="log-deco" />

      <div className="log-messages" ref={scrollRef}>
        {visibleHistory.length === 0 ? (
          <div className="log-empty">
            {getOverlayEmptyState({ channelName, isGenerating, open })}
          </div>
        ) : null}

        {visibleHistory.map(({ displayContent, message }) => {
          const overlayMessage = getOverlayMessage(message, displayContent, assistantLabel);
          const ageMs = Math.max(0, now - message.createdAt);
          const remainingMs = MESSAGE_VISIBLE_MS - ageMs;
          const fadeRatio =
            remainingMs < MESSAGE_FADE_MS ? clamp(remainingMs / MESSAGE_FADE_MS, 0, 1) : 1;
          const style: MessageStyle = {
            '--msg-lift': `${Math.round((1 - fadeRatio) * 8)}px`,
            '--msg-opacity': String(clamp(0.18 + fadeRatio * 0.82, 0.18, 1)),
          };
          return (
            <button
              className={`log-msg ${overlayMessage.tone}`}
              key={message.id}
              onClick={() => void copyText(displayContent)}
              style={style}
              type="button"
            >
              <span className="msg-role">{overlayMessage.label}</span>
              <span className="msg-text">{overlayMessage.text}</span>
            </button>
          );
        })}

        {isGenerating ? (
          <div className="log-msg assistant streaming">
            <span className="msg-role">WIFEY</span>
            <span className="msg-text">
              Thinking
              <span className="cursor-blink">_</span>
            </span>
          </div>
        ) : null}
        <div className="log-scroll-end" ref={endRef} />
      </div>
    </div>
  );
});
