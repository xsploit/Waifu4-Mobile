import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchModels, streamChat } from '../llm/LlmClient';
import { AudioPlayback, type PlaybackSnapshot } from '../tts/AudioPlayback';
import { streamTts, type TtsStreamEvent, type TtsTimestampInfo } from '../tts/TtsClient';
import { createSpeechBuffer } from '../tts/SpeechBuffer';
import { createWLipSyncMouth, type WLipSyncMouth } from '../lipsync/WLipSyncMouth';
import { ZERO_MOUTH_WEIGHTS, type MouthWeights } from '../lipsync/MouthWeights';
import { buildSystemPrompt } from '../brain/prompt';
import { selectReplyFormat, type ProviderModelInfo } from '../brain/modelCapability';
import type { GatewayId, LlmMessage, ReplyFormat, ReplyMetadata } from '../brain/BrainTypes';

const DEFAULT_PERSONA = 'You are Hikari, a warm, playful AI companion. Keep replies short and natural.';

type Turn = { role: 'user' | 'assistant'; content: string };
type TtsProvider = 'fish' | 'inworld';
type InworldTransport = 'http' | 'websocket';
type InworldTimestampStrategy = 'SYNC' | 'ASYNC';
type InworldDeliveryMode = 'STABLE' | 'BALANCED' | 'CREATIVE' | 'EXPRESSIVE';

type LocalBackupSettings = {
  provider?: GatewayId;
  model?: string;
  llmKey?: string;
  byokOpenAiKey?: string;
  ttsKey?: string;
  fishVoiceId?: string;
  inworldKey?: string;
  inworldVoiceId?: string;
  inworldModelId?: string;
  inworldDeliveryMode?: InworldDeliveryMode;
  inworldBufferCharThreshold?: number;
  ttsProvider?: string;
  autoSpeak?: boolean;
};

type TimingTotals = {
  timestampChunks: number;
  words: number;
  phonemes: number;
  visemes: number;
};

const inputStyle: React.CSSProperties = {
  background: '#202028',
  color: '#e8e8ec',
  border: '1px solid #33333d',
  borderRadius: 6,
  padding: '6px 8px',
  fontSize: 13,
};

const ZERO_TIMING_TOTALS: TimingTotals = {
  timestampChunks: 0,
  words: 0,
  phonemes: 0,
  visemes: 0,
};

export function ChatPanel() {
  const [provider, setProvider] = useState<GatewayId>('vercel-gateway');
  const [model, setModel] = useState('openai/gpt-5-nano');
  const [apiKey, setApiKey] = useState('');
  const [byok, setByok] = useState('');
  const [ttsProvider, setTtsProvider] = useState<TtsProvider>('fish');
  const [ttsKey, setTtsKey] = useState('');
  const [voiceId, setVoiceId] = useState('');
  const [inworldKey, setInworldKey] = useState('');
  const [inworldVoiceId, setInworldVoiceId] = useState('Ashley');
  const [inworldModelId, setInworldModelId] = useState('inworld-tts-2');
  const [inworldTransport, setInworldTransport] = useState<InworldTransport>('http');
  const [inworldDeliveryMode, setInworldDeliveryMode] = useState<InworldDeliveryMode>('BALANCED');
  const [inworldTimestampStrategy, setInworldTimestampStrategy] =
    useState<InworldTimestampStrategy>('SYNC');
  const [inworldBufferCharThreshold, setInworldBufferCharThreshold] = useState(120);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [ttsStatus, setTtsStatus] = useState('idle');
  const [ttsTimingStatus, setTtsTimingStatus] = useState('timing=idle');
  const [playbackState, setPlaybackState] = useState<PlaybackSnapshot | null>(null);
  const [mouthState, setMouthState] = useState<{
    ready: boolean;
    status: string;
    volume: number;
    weights: MouthWeights;
  }>({ ready: false, status: 'idle', volume: 0, weights: ZERO_MOUTH_WEIGHTS });
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
  const ttsControllersRef = useRef<Set<AbortController>>(new Set());
  const ttsQueueRef = useRef<Promise<void>>(Promise.resolve());
  const speechRunRef = useRef(0);
  const ttsTotalsRef = useRef({ segments: 0, chunks: 0, bytes: 0, firstAudioMs: null as number | null });
  const ttsTimingTotalsRef = useRef<TimingTotals>(ZERO_TIMING_TOTALS);
  const playbackRef = useRef<AudioPlayback | null>(null);
  const mouthRef = useRef<WLipSyncMouth | null>(null);
  const mouthFrameRef = useRef<number | null>(null);

  const modelInfo = useMemo(
    () => models.find((m) => m.id === model) ?? null,
    [models, model],
  );
  const effectiveFormat: ReplyFormat = autoLane
    ? selectReplyFormat(provider, modelInfo)
    : manualFormat;

  const getActiveTtsKey = () => (ttsProvider === 'inworld' ? inworldKey : ttsKey);

  useEffect(() => {
    let cancelled = false;
    async function loadLocalBackup() {
      try {
        const res = await fetch('/local/backup-settings');
        if (!res.ok) {
          return;
        }
        const settings = (await res.json()) as LocalBackupSettings;
        if (cancelled) {
          return;
        }
        setProvider(settings.provider ?? 'vercel-gateway');
        setModel(settings.model || 'openai/gpt-5-nano');
        setApiKey(settings.llmKey ?? '');
        setByok(settings.byokOpenAiKey ?? '');
        setTtsKey(settings.ttsKey ?? '');
        setVoiceId(settings.fishVoiceId ?? '');
        setInworldKey(settings.inworldKey ?? '');
        setInworldVoiceId(settings.inworldVoiceId || 'Ashley');
        setInworldModelId(settings.inworldModelId || 'inworld-tts-2');
        setInworldDeliveryMode(settings.inworldDeliveryMode ?? 'BALANCED');
        setInworldBufferCharThreshold(settings.inworldBufferCharThreshold ?? 120);
        setTtsProvider(settings.ttsProvider === 'inworld' ? 'inworld' : 'fish');
        setAutoSpeak(settings.autoSpeak ?? true);
        setModelsMsg('loaded local backup settings');
      } catch {
        /* local backup import is optional */
      }
    }
    void loadLocalBackup();
    return () => {
      cancelled = true;
    };
  }, []);

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
    const canStreamSpeech = autoSpeak && Boolean(getActiveTtsKey().trim());
    const speechRun = speechRunRef.current + 1;
    speechRunRef.current = speechRun;
    const speechBuffer = createSpeechBuffer();
    if (canStreamSpeech) {
      stopTts('starting reply audio…');
      speechRunRef.current = speechRun;
      ttsTotalsRef.current = { segments: 0, chunks: 0, bytes: 0, firstAudioMs: null };
      ttsTimingTotalsRef.current = ZERO_TIMING_TOTALS;
      setTtsTimingStatus('timing=waiting');
    }

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
          if (canStreamSpeech) {
            for (const segment of speechBuffer.push(ev.text)) {
              queueSpeechSegment(segment, speechRun);
            }
          }
        } else if (ev.type === 'done') {
          const message = ev.text || acc;
          setLog((prev) => [...prev, { role: 'assistant', content: message }]);
          setStreaming('');
          setMeta(ev.meta);
          if (canStreamSpeech) {
            for (const segment of speechBuffer.flush()) {
              queueSpeechSegment(segment, speechRun);
            }
          } else if (autoSpeak && getActiveTtsKey().trim() && message.trim()) {
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

  const stop = () => {
    abortRef.current?.abort();
    stopTts('stopped');
  };
  const stopTts = (status = 'stopped') => {
    speechRunRef.current += 1;
    for (const controller of ttsControllersRef.current) {
      controller.abort();
    }
    ttsControllersRef.current.clear();
    ttsQueueRef.current = Promise.resolve();
    playbackRef.current?.stop();
    ttsAbortRef.current = null;
    setTtsStatus(status);
    ttsTimingTotalsRef.current = ZERO_TIMING_TOTALS;
    setTtsTimingStatus(status === 'stopped' ? 'timing=stopped' : 'timing=idle');
    setMouthState((prev) => ({ ...prev, volume: 0, weights: ZERO_MOUTH_WEIGHTS }));
  };

  const speak = async (message: string) => {
    stopTts('speaking…');
    const runId = speechRunRef.current;
    ttsTotalsRef.current = { segments: 0, chunks: 0, bytes: 0, firstAudioMs: null };
    ttsTimingTotalsRef.current = ZERO_TIMING_TOTALS;
    setTtsTimingStatus('timing=waiting');
    await synthesizeQueuedText(message, runId);
  };

  const queueSpeechSegment = (message: string, runId: number) => {
    ttsQueueRef.current = ttsQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        if (speechRunRef.current !== runId) {
          return;
        }
        await synthesizeQueuedText(message, runId);
      });
    void ttsQueueRef.current;
  };

  const synthesizeQueuedText = async (message: string, runId: number) => {
    const activeTtsKey = getActiveTtsKey().trim();
    if (!activeTtsKey) {
      setError(`Enter a ${ttsProvider === 'inworld' ? 'Inworld' : 'Fish'} TTS key first.`);
      return;
    }
    const controller = new AbortController();
    ttsControllersRef.current.add(controller);
    ttsAbortRef.current = controller;
    const playback = await ensureAudioPlayback();
    setTtsStatus(`speaking segment ${ttsTotalsRef.current.segments + 1}…`);
    setPlaybackState(playback.getState());
    try {
      for await (const ev of streamTts(
        ttsProvider === 'inworld'
          ? {
              provider: 'inworld',
              text: message,
              voiceId: inworldVoiceId.trim() || 'Ashley',
              inworldModelId: inworldModelId.trim() || 'inworld-tts-2',
              inworldTransport,
              format: 'pcm',
              sampleRate: 48000,
              timestampType: 'WORD',
              timestampTransportStrategy: inworldTimestampStrategy,
              deliveryMode: inworldDeliveryMode,
              bufferCharThreshold: inworldBufferCharThreshold,
              autoMode: true,
            }
          : { provider: 'fish', text: message, voiceId: voiceId.trim() || undefined },
        { ttsKey: activeTtsKey },
        controller.signal,
      )) {
        if (speechRunRef.current !== runId) {
          controller.abort();
          break;
        }
        await handleTtsEvent(ev, playback);
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setTtsStatus(`error: ${err instanceof Error ? err.message : String(err)}`);
      }
    } finally {
      ttsControllersRef.current.delete(controller);
      if (ttsAbortRef.current === controller) {
        ttsAbortRef.current = null;
      }
    }
  };

  const ensureAudioPlayback = async (): Promise<AudioPlayback> => {
    if (playbackRef.current) {
      return playbackRef.current;
    }
    const Ctor = window.AudioContext ?? window.webkitAudioContext;
    const context = new Ctor();
    setMouthState((prev) => ({ ...prev, status: 'loading wlipsync…' }));
    const mouth = await createWLipSyncMouth(context);
    mouthRef.current = mouth;
    startMouthMonitor();
    setMouthState({
      ready: true,
      status: 'wlipsync live',
      volume: mouth.getVolume(),
      weights: mouth.getMouthWeights(),
    });
    const playback = new AudioPlayback({ context, tap: mouth, onState: setPlaybackState });
    playbackRef.current = playback;
    return playback;
  };

  const startMouthMonitor = () => {
    if (mouthFrameRef.current !== null) {
      return;
    }
    const tick = () => {
      const mouth = mouthRef.current;
      if (mouth) {
        const playing = playbackRef.current?.getState().status === 'playing';
        setMouthState({
          ready: true,
          status: 'wlipsync live',
          volume: playing ? mouth.getVolume() : 0,
          weights: playing ? mouth.getMouthWeights() : ZERO_MOUTH_WEIGHTS,
        });
      }
      mouthFrameRef.current = window.requestAnimationFrame(tick);
    };
    mouthFrameRef.current = window.requestAnimationFrame(tick);
  };

  const summarizeTimestamps = (timestamps: TtsTimestampInfo | undefined): TimingTotals => {
    const words = timestamps?.wordAlignment?.words?.length ?? 0;
    const phonemes =
      timestamps?.wordAlignment?.phoneticDetails?.reduce(
        (total, detail) => total + (detail.phones?.length ?? 0),
        0,
      ) ?? 0;
    const visemes = new Set(
      timestamps?.wordAlignment?.phoneticDetails?.flatMap((detail) =>
        (detail.phones ?? []).map((phone) => phone.visemeSymbol).filter(Boolean),
      ) ?? [],
    ).size;
    return {
      timestampChunks: words || phonemes || visemes ? 1 : 0,
      words,
      phonemes,
      visemes,
    };
  };

  const addTiming = (timestamps: TtsTimestampInfo | undefined) => {
    const counts = summarizeTimestamps(timestamps);
    if (!counts.timestampChunks) {
      return;
    }
    const totals = {
      timestampChunks: ttsTimingTotalsRef.current.timestampChunks + counts.timestampChunks,
      words: ttsTimingTotalsRef.current.words + counts.words,
      phonemes: ttsTimingTotalsRef.current.phonemes + counts.phonemes,
      visemes: ttsTimingTotalsRef.current.visemes + counts.visemes,
    };
    ttsTimingTotalsRef.current = totals;
    setTtsTimingStatus(
      `timing=${totals.timestampChunks} chunks · words=${totals.words} · phones=${totals.phonemes} · visemes=${totals.visemes}`,
    );
  };

  const handleTtsEvent = async (ev: TtsStreamEvent, playback: AudioPlayback) => {
    if (ev.type === 'audio') {
      if (ev.format !== 'pcm') {
        setTtsStatus(`error: unsupported audio format ${ev.format}`);
        return;
      }
      addTiming(ev.timestamps);
      await playback.playPcmChunk(ev.audio, ev.sampleRate ?? 44100);
    } else if (ev.type === 'done') {
      const firstAudioMs = ttsTotalsRef.current.firstAudioMs ?? ev.stats.firstAudioMs;
      ttsTotalsRef.current = {
        segments: ttsTotalsRef.current.segments + 1,
        chunks: ttsTotalsRef.current.chunks + ev.stats.chunks,
        bytes: ttsTotalsRef.current.bytes + ev.stats.bytes,
        firstAudioMs,
      };
      if (ev.stats.timestampChunks !== undefined && ttsTimingTotalsRef.current.timestampChunks === 0) {
        ttsTimingTotalsRef.current = {
          timestampChunks: ev.stats.timestampChunks,
          words: ev.stats.words ?? ttsTimingTotalsRef.current.words,
          phonemes: ev.stats.phonemes ?? ttsTimingTotalsRef.current.phonemes,
          visemes: ev.stats.visemes ?? ttsTimingTotalsRef.current.visemes,
        };
        setTtsTimingStatus(
          `timing=${ttsTimingTotalsRef.current.timestampChunks} chunks · words=${ttsTimingTotalsRef.current.words} · phones=${ttsTimingTotalsRef.current.phonemes} · visemes=${ttsTimingTotalsRef.current.visemes}`,
        );
      }
      setTtsStatus(
        `done · ${ttsProvider}/${ev.stats.transport ?? 'stream'} · ${ttsTotalsRef.current.segments} segments · ${ttsTotalsRef.current.chunks} chunks · ${Math.round(ttsTotalsRef.current.bytes / 1024)} KB · first ${firstAudioMs ?? 'n/a'} ms`,
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
        <select
          value={ttsProvider}
          onChange={(e) => setTtsProvider(e.target.value as TtsProvider)}
          style={inputStyle}
        >
          <option value="fish">Fish</option>
          <option value="inworld">Inworld</option>
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#9b9ba3', fontSize: 12 }}>
          <input type="checkbox" checked={autoSpeak} onChange={(e) => setAutoSpeak(e.target.checked)} />
          auto speak
        </label>
        {ttsProvider === 'inworld' && (
          <>
            <select
              value={inworldTransport}
              onChange={(e) => setInworldTransport(e.target.value as InworldTransport)}
              style={inputStyle}
            >
              <option value="http">HTTP stream</option>
              <option value="websocket">WebSocket</option>
            </select>
            <select
              value={inworldTimestampStrategy}
              onChange={(e) => setInworldTimestampStrategy(e.target.value as InworldTimestampStrategy)}
              style={inputStyle}
            >
              <option value="SYNC">timestamps sync</option>
              <option value="ASYNC">timestamps async</option>
            </select>
          </>
        )}
      </div>
      {ttsProvider === 'fish' ? (
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
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={inworldKey}
            onChange={(e) => setInworldKey(e.target.value)}
            placeholder="Inworld API key"
            type="password"
            style={{ ...inputStyle, flex: 1, minWidth: 220 }}
          />
          <input
            value={inworldVoiceId}
            onChange={(e) => setInworldVoiceId(e.target.value)}
            placeholder="Inworld voice id"
            style={{ ...inputStyle, flex: 1, minWidth: 180 }}
          />
          <input
            value={inworldModelId}
            onChange={(e) => setInworldModelId(e.target.value)}
            placeholder="Inworld model id"
            style={{ ...inputStyle, width: 160 }}
          />
          <select
            value={inworldDeliveryMode}
            onChange={(e) => setInworldDeliveryMode(e.target.value as InworldDeliveryMode)}
            style={inputStyle}
          >
            <option value="STABLE">STABLE</option>
            <option value="BALANCED">BALANCED</option>
            <option value="CREATIVE">CREATIVE</option>
            <option value="EXPRESSIVE">EXPRESSIVE</option>
          </select>
          <input
            value={inworldBufferCharThreshold}
            onChange={(e) => setInworldBufferCharThreshold(Number(e.target.value) || 120)}
            min={1}
            max={1000}
            type="number"
            aria-label="Inworld buffer character threshold"
            style={{ ...inputStyle, width: 88 }}
          />
        </div>
      )}

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
        <div style={{ fontSize: 12, color: '#9b9ba3' }}>{ttsTimingStatus}</div>
        <div style={{ fontSize: 12, color: '#9b9ba3' }}>
          mouth={mouthState.status}
          {mouthState.ready
            ? ` · vol=${mouthState.volume.toFixed(3)} · aa=${mouthState.weights.aa.toFixed(2)} ih=${mouthState.weights.ih.toFixed(2)} ou=${mouthState.weights.ou.toFixed(2)} ee=${mouthState.weights.ee.toFixed(2)} oh=${mouthState.weights.oh.toFixed(2)}`
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
            disabled={!getActiveTtsKey().trim()}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            speak
          </button>
        )}
        {ttsAbortRef.current && (
          <button onClick={() => stopTts()} style={{ ...inputStyle, cursor: 'pointer' }}>
            stop audio
          </button>
        )}
      </div>
    </section>
  );
}
