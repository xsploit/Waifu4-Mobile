import { useMemo, useRef, useState } from 'react';
import { fetchModels, streamChat } from '../llm/LlmClient';
import { AudioPlayback, type PlaybackSnapshot } from '../tts/AudioPlayback';
import { streamTts, type TtsStreamEvent } from '../tts/TtsClient';
import { buildSystemPrompt } from '../brain/prompt';
import { selectReplyFormat, type ProviderModelInfo } from '../brain/modelCapability';
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
  const [ttsKey, setTtsKey] = useState('');
  const [voiceId, setVoiceId] = useState('');
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [ttsStatus, setTtsStatus] = useState('idle');
  const [playbackState, setPlaybackState] = useState<PlaybackSnapshot | null>(null);
  const [autoLane, setAutoLane] = useState(true);
  const [manualFormat, setManualFormat] = useState<ReplyFormat>('text');
  const [models, setModels] = useState<ProviderModelInfo[]>([]);
  const [modelsMsg, setModelsMsg] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [log, setLog] = useState<Turn[]>([]);
  const [streaming, setStreaming] = useState('');
  const [meta, setMeta] = useState<ReplyMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const playbackRef = useRef<AudioPlayback | null>(null);

  const modelInfo = useMemo(
    () => models.find((m) => m.id === model) ?? null,
    [models, model],
  );
  const effectiveFormat: ReplyFormat = autoLane
    ? selectReplyFormat(provider, modelInfo)
    : manualFormat;

  const loadModels = async () => {
    setModelsMsg('loading…');
    try {
      const list = await fetchModels(provider, { llmKey: apiKey.trim() });
      setModels(list);
      const known = list.find((m) => m.id === model);
      setModelsMsg(
        `${list.length} models` +
          (provider === 'openrouter-responses'
            ? known
              ? ` · ${model} structured: ${known.supportsStructuredOutputs ? 'yes' : 'no'}`
              : ' · selected model not in list'
            : ' · gateway defaults to structured'),
      );
    } catch (err) {
      setModelsMsg(`error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

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
      { role: 'system', content: buildSystemPrompt(DEFAULT_PERSONA, effectiveFormat) },
      ...history.map((t) => ({ role: t.role, content: t.content })),
    ];

    const controller = new AbortController();
    abortRef.current = controller;
    let acc = '';
    try {
      for await (const ev of streamChat(
        { provider, model, messages, replyFormat: effectiveFormat },
        { llmKey: apiKey.trim(), byokOpenAiKey: byok.trim() || undefined },
        controller.signal,
      )) {
        if (ev.type === 'delta') {
          acc += ev.text;
          setStreaming(acc);
        } else if (ev.type === 'done') {
          const message = ev.text || acc;
          setLog((prev) => [...prev, { role: 'assistant', content: message }]);
          setStreaming('');
          setMeta(ev.meta);
          if (autoSpeak && ttsKey.trim() && message.trim()) {
            void speak(message);
          }
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
  const stopTts = () => {
    ttsAbortRef.current?.abort();
    ttsAbortRef.current = null;
    setTtsStatus('stopped');
  };

  const speak = async (message: string) => {
    if (!ttsKey.trim()) {
      setError('Enter a TTS provider key first.');
      return;
    }
    ttsAbortRef.current?.abort();
    const controller = new AbortController();
    ttsAbortRef.current = controller;
    playbackRef.current ??= new AudioPlayback({ onState: setPlaybackState });
    setTtsStatus('speaking…');
    setPlaybackState(playbackRef.current.getState());
    try {
      for await (const ev of streamTts(
        { text: message, voiceId: voiceId.trim() || undefined },
        { ttsKey: ttsKey.trim() },
        controller.signal,
      )) {
        await handleTtsEvent(ev, playbackRef.current);
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setTtsStatus(`error: ${err instanceof Error ? err.message : String(err)}`);
      }
    } finally {
      if (ttsAbortRef.current === controller) {
        ttsAbortRef.current = null;
      }
    }
  };

  const handleTtsEvent = async (ev: TtsStreamEvent, playback: AudioPlayback) => {
    if (ev.type === 'audio') {
      if (ev.format !== 'pcm') {
        setTtsStatus(`error: unsupported audio format ${ev.format}`);
        return;
      }
      await playback.playPcmChunk(ev.audio, ev.sampleRate ?? 44100);
    } else if (ev.type === 'done') {
      setTtsStatus(
        `done · ${ev.stats.chunks} chunks · ${Math.round(ev.stats.bytes / 1024)} KB · first ${ev.stats.firstAudioMs ?? 'n/a'} ms`,
      );
    } else {
      setTtsStatus(`error: ${ev.error}`);
    }
  };

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
        <button onClick={() => void loadModels()} style={{ ...inputStyle, cursor: 'pointer' }}>
          load models
        </button>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', fontSize: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#9b9ba3' }}>
          <input type="checkbox" checked={autoLane} onChange={(e) => setAutoLane(e.target.checked)} />
          auto lane
        </label>
        {autoLane ? (
          <span style={{ color: '#9b9ba3' }}>
            → {effectiveFormat === 'structured' ? 'Lane A (structured)' : 'Lane B (text + meta)'}
          </span>
        ) : (
          <select
            value={manualFormat}
            onChange={(e) => setManualFormat(e.target.value as ReplyFormat)}
            style={inputStyle}
          >
            <option value="text">Lane B (text + meta)</option>
            <option value="structured">Lane A (structured)</option>
          </select>
        )}
        {modelsMsg && <span style={{ color: '#7a7a82' }}>{modelsMsg}</span>}
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
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={ttsKey}
          onChange={(e) => setTtsKey(e.target.value)}
          placeholder="Fish TTS API key"
          type="password"
          style={{ ...inputStyle, flex: 1, minWidth: 220 }}
        />
        <input
          value={voiceId}
          onChange={(e) => setVoiceId(e.target.value)}
          placeholder="Fish voice id (optional)"
          style={{ ...inputStyle, flex: 1, minWidth: 180 }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#9b9ba3', fontSize: 12 }}>
          <input type="checkbox" checked={autoSpeak} onChange={(e) => setAutoSpeak(e.target.checked)} />
          auto speak
        </label>
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
        <div style={{ fontSize: 12, color: '#9b9ba3' }}>
          tts={ttsStatus}
          {playbackState
            ? ` · playback=${playbackState.status} · queued=${playbackState.queuedSeconds.toFixed(2)}s · amp=${playbackState.amplitude.toFixed(3)}`
            : ''}
        </div>
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
        {log.length > 0 && log[log.length - 1]?.role === 'assistant' && (
          <button
            onClick={() => void speak(log[log.length - 1]?.content ?? '')}
            disabled={!ttsKey.trim()}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            speak
          </button>
        )}
        {ttsAbortRef.current && (
          <button onClick={stopTts} style={{ ...inputStyle, cursor: 'pointer' }}>
            stop audio
          </button>
        )}
      </div>
    </section>
  );
}
