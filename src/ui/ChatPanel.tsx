import { useRef, useState } from 'react';
import { streamChat } from '../llm/LlmClient';
import { buildSystemPrompt } from '../brain/prompt';
import type { GatewayId, LlmMessage, ReplyFormat, ReplyMetadata } from '../brain/BrainTypes';

const DEFAULT_PERSONA = 'You are Hikari, a warm, playful AI companion. Keep replies short and natural.';

type Turn = { role: 'user' | 'assistant'; content: string };

const inputStyle: React.CSSProperties = {
  background: '#202028',
  color: '#e8e8ec',
  border: '1px solid #33333d',
  borderRadius: 6,
  padding: '6px 8px',
  fontSize: 13,
};

export function ChatPanel() {
  const [provider, setProvider] = useState<GatewayId>('vercel-gateway');
  const [model, setModel] = useState('openai/gpt-5-nano');
  const [apiKey, setApiKey] = useState('');
  const [byok, setByok] = useState('');
  const [replyFormat, setReplyFormat] = useState<ReplyFormat>('text');
  const [input, setInput] = useState('');
  const [log, setLog] = useState<Turn[]>([]);
  const [streaming, setStreaming] = useState('');
  const [meta, setMeta] = useState<ReplyMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const send = async () => {
    const userText = input.trim();
    if (!userText || busy) {
      return;
    }
    if (!apiKey.trim()) {
      setError('Enter a provider API key first.');
      return;
    }
    setError(null);
    setMeta(null);
    const history = [...log, { role: 'user' as const, content: userText }];
    setLog(history);
    setInput('');
    setBusy(true);
    setStreaming('');

    const messages: LlmMessage[] = [
      { role: 'system', content: buildSystemPrompt(DEFAULT_PERSONA, replyFormat) },
      ...history.map((t) => ({ role: t.role, content: t.content })),
    ];

    const controller = new AbortController();
    abortRef.current = controller;
    let acc = '';
    try {
      for await (const ev of streamChat(
        { provider, model, messages, replyFormat },
        { llmKey: apiKey.trim(), byokOpenAiKey: byok.trim() || undefined },
        controller.signal,
      )) {
        if (ev.type === 'delta') {
          acc += ev.text;
          setStreaming(acc);
        } else if (ev.type === 'done') {
          setLog((prev) => [...prev, { role: 'assistant', content: ev.text || acc }]);
          setStreaming('');
          setMeta(ev.meta);
        } else {
          setError(ev.error);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const stop = () => abortRef.current?.abort();

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 640 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as GatewayId)}
          style={inputStyle}
        >
          <option value="vercel-gateway">vercel-gateway</option>
          <option value="openrouter-responses">openrouter-responses</option>
        </select>
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="model id"
          style={{ ...inputStyle, width: 200 }}
        />
        <select
          value={replyFormat}
          onChange={(e) => setReplyFormat(e.target.value as ReplyFormat)}
          style={inputStyle}
        >
          <option value="text">Lane B (text + meta)</option>
          <option value="structured">Lane A (structured)</option>
        </select>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="provider API key"
          type="password"
          style={{ ...inputStyle, flex: 1, minWidth: 220 }}
        />
        <input
          value={byok}
          onChange={(e) => setByok(e.target.value)}
          placeholder="OpenAI BYOK (optional)"
          type="password"
          style={{ ...inputStyle, flex: 1, minWidth: 180 }}
        />
      </div>

      <div
        style={{
          border: '1px solid #2a2a33',
          borderRadius: 8,
          padding: 12,
          minHeight: 120,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {log.map((t, i) => (
          <div key={i} style={{ fontSize: 14 }}>
            <span style={{ color: t.role === 'user' ? '#7aa2ff' : '#3ddc84' }}>
              {t.role === 'user' ? 'you' : 'waifu'}:
            </span>{' '}
            {t.content}
          </div>
        ))}
        {streaming && (
          <div style={{ fontSize: 14 }}>
            <span style={{ color: '#3ddc84' }}>waifu:</span> {streaming}
            <span style={{ opacity: 0.5 }}>▋</span>
          </div>
        )}
        {meta && (
          <div style={{ fontSize: 12, color: '#9b9ba3' }}>
            emotion={meta.emotion} · v={meta.valence} a={meta.arousal} d={meta.dominance}
          </div>
        )}
        {error && <div style={{ fontSize: 13, color: '#ff5470' }}>error: {error}</div>}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              void send();
            }
          }}
          placeholder="say something…"
          style={{ ...inputStyle, flex: 1 }}
        />
        <button onClick={() => void send()} disabled={busy} style={{ ...inputStyle, cursor: 'pointer' }}>
          {busy ? 'streaming…' : 'send'}
        </button>
        {busy && (
          <button onClick={stop} style={{ ...inputStyle, cursor: 'pointer' }}>
            stop
          </button>
        )}
      </div>
    </section>
  );
}
