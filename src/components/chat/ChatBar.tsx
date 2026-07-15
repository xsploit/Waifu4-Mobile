import { memo, useCallback, useEffect, useRef, useState } from 'react';

const DRAFT_COMMIT_DELAY_MS = 600;

type ChatBarProps = {
  activePersonaName: string;
  inputRevision: number;
  inputValue: string;
  isGenerating: boolean;
  messageCount: number;
  model: string;
  onInputChange: (value: string) => void;
  onInputCommit: (value: string) => void;
  onSend: (value: string) => void;
};

export const ChatBar = memo(function ChatBar({
  activePersonaName,
  inputRevision,
  inputValue,
  isGenerating,
  messageCount,
  model,
  onInputChange,
  onInputCommit,
  onSend,
}: ChatBarProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const commitTimerRef = useRef<number | null>(null);
  const [draft, setDraft] = useState(inputValue);
  const sendLocked = isGenerating;

  const commitDraft = useCallback(
    (value: string) => {
      if (commitTimerRef.current !== null) {
        window.clearTimeout(commitTimerRef.current);
        commitTimerRef.current = null;
      }
      onInputCommit(value);
    },
    [onInputCommit],
  );

  useEffect(() => {
    if (commitTimerRef.current !== null) {
      window.clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
    setDraft(inputValue);
  }, [inputRevision, inputValue]);

  useEffect(
    () => () => {
      if (commitTimerRef.current !== null) {
        window.clearTimeout(commitTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) {
        return;
      }

      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [draft]);

  return (
    <div
      className="chat-container visible"
      onClick={(event) => event.stopPropagation()}
      style={{ visibility: 'visible' }}
    >
      <div className="chat-meta">
        <div className="chat-meta-group">
          <span className="meta-item active">{activePersonaName}</span>
          <span className="meta-item">{model || 'MODEL OFFLINE'}</span>
        </div>
        <div className="chat-meta-group">
          <span className="meta-item">{messageCount} MSGS</span>
        </div>
      </div>

      <div className="chat-wrapper">
        <div className="chat-deco-line" />
        <div className="chat-inner">
          <textarea
            id="yourwifey-chat-input"
            name="yourwifey-chat-input"
            ref={textareaRef}
            onBlur={() => commitDraft(draft)}
            onChange={(event) => {
              const value = event.target.value;
              setDraft(value);
              onInputChange(value);
              if (commitTimerRef.current !== null) {
                window.clearTimeout(commitTimerRef.current);
              }
              commitTimerRef.current = window.setTimeout(
                () => commitDraft(value),
                DRAFT_COMMIT_DELAY_MS,
              );
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                if (sendLocked) {
                  return;
                }
                onSend(draft);
              }
            }}
            placeholder={`Talk to ${activePersonaName || 'her'}...`}
            rows={1}
            value={draft}
          />

          <div className="chat-actions">
            <button
              className={`icon-btn primary ${sendLocked ? 'active' : ''}`}
              disabled={sendLocked}
              onClick={() => onSend(draft)}
              title={sendLocked ? 'Wait for the current reply to finish' : 'Send'}
              type="button"
            >
              {sendLocked ? (
                <span className="chat-spinner" />
              ) : (
                <svg
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <line x1="22" x2="11" y1="2" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
