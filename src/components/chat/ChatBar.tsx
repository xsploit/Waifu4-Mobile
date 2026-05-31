import { memo, useEffect, useRef } from 'react';

type ChatBarProps = {
  activePersonaName: string;
  inputValue: string;
  isGenerating: boolean;
  messageCount: number;
  model: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
};

export const ChatBar = memo(function ChatBar({
  activePersonaName,
  inputValue,
  isGenerating,
  messageCount,
  model,
  onInputChange,
  onSend,
}: ChatBarProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const sendLocked = isGenerating;

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
  }, [inputValue]);

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
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                if (sendLocked) {
                  return;
                }
                onSend();
              }
            }}
            placeholder={`Talk to ${activePersonaName || 'her'}...`}
            rows={1}
            value={inputValue}
          />

          <div className="chat-actions">
            <button
              className={`icon-btn primary ${sendLocked ? 'active' : ''}`}
              disabled={sendLocked}
              onClick={onSend}
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
