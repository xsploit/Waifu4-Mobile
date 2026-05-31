import type { Dispatch, SetStateAction } from 'react';
import {
  DEFAULT_LOCAL_EMBEDDING_MODEL,
  DEFAULT_OPENROUTER_EMBEDDING_MODEL,
} from '../../../lib/chat/defaults';
import type { GrilloMemoryState } from '../../../lib/chat/grillo-memory';
import type {
  LadybugGrilloRuntimeStatus,
  LadybugMemoryGraphSummary,
  LadybugMemoryStatus,
} from '../../../lib/chat/ladybug-memory-client';
import type {
  MemoryEmbeddingDebugSnapshot,
  MemoryPromptDebugSnapshot,
  MemoryWorkerDebugSnapshot,
} from '../../../lib/chat/memory-debug';
import { filterSafeProviderModels } from '../../../lib/chat/provider-defaults';
import type { AiSettings, RelationshipMemory } from '../../../lib/chat/types';

type ContextTabProps = {
  aiSettings: AiSettings;
  availableModels: string[];
  backendGrilloTickBusy: boolean;
  chatDraftLength: number;
  currentModeLabel: string;
  messageCount: number;
  onClearChat: () => void;
  onClearDraft: () => void;
  onClearMemory: () => void;
  onRefreshModels: () => void;
  onResetContext: () => void;
  onRunBackendGrilloBeat: () => void;
  onRunBackendGrilloCompaction: () => void;
  onRunBackendGrilloConsolidation: () => void;
  onRunBackendGrilloSemanticIndexing: () => void;
  onRunBackendGrilloTick: () => void;
  onRunMemoryAgent: () => void;
  grilloRuntimeStatus: LadybugGrilloRuntimeStatus | null;
  grilloMemoryState: GrilloMemoryState;
  relationshipMemory: RelationshipMemory;
  memoryAgentBusy: boolean;
  memoryAgentPendingCounts: Record<string, number>;
  memoryAgentStatus: string;
  memoryBackendStatus: LadybugMemoryStatus | null;
  memoryEmbeddingDebug: MemoryEmbeddingDebugSnapshot | null;
  memoryGraphSummary: LadybugMemoryGraphSummary | null;
  memoryPromptDebug: MemoryPromptDebugSnapshot | null;
  memoryWorkerDebug: MemoryWorkerDebugSnapshot | null;
  modelsError: string | null;
  modelsLoading: boolean;
  setAiSettings: Dispatch<SetStateAction<AiSettings>>;
};

export function ContextTab({
  aiSettings,
  availableModels,
  backendGrilloTickBusy,
  chatDraftLength,
  currentModeLabel,
  messageCount,
  onClearChat,
  onClearDraft,
  onClearMemory,
  onRefreshModels,
  onResetContext,
  onRunBackendGrilloBeat,
  onRunBackendGrilloCompaction,
  onRunBackendGrilloConsolidation,
  onRunBackendGrilloSemanticIndexing,
  onRunBackendGrilloTick,
  onRunMemoryAgent,
  grilloRuntimeStatus,
  grilloMemoryState,
  relationshipMemory,
  memoryAgentBusy,
  memoryAgentPendingCounts,
  memoryAgentStatus,
  memoryBackendStatus,
  memoryEmbeddingDebug,
  memoryGraphSummary,
  memoryPromptDebug,
  memoryWorkerDebug,
  modelsError,
  modelsLoading,
  setAiSettings,
}: ContextTabProps) {
  const recentBlocks = [...grilloMemoryState.blocks].reverse().slice(0, 6);
  const recentCandidates = [...grilloMemoryState.candidates].reverse().slice(0, 8);
  const recentDiary = [...grilloMemoryState.diaryEntries].reverse().slice(0, 4);
  const promotedCount = grilloMemoryState.promotedCandidateIds.length;
  const hasGrilloMemory =
    grilloMemoryState.blocks.length > 0 ||
    grilloMemoryState.candidates.length > 0 ||
    grilloMemoryState.diaryEntries.length > 0;
  const lastUpdated =
    hasGrilloMemory && grilloMemoryState.updatedAt > 0
      ? new Date(grilloMemoryState.updatedAt).toLocaleString()
      : '';
  const lastPromptDebugAt =
    memoryPromptDebug && memoryPromptDebug.updatedAt > 0
      ? new Date(memoryPromptDebug.updatedAt).toLocaleTimeString()
      : '';
  const currentPendingWorkerTurns = memoryAgentPendingCounts[grilloMemoryState.scopeKey] ?? 0;
  const totalPendingWorkerTurns = Object.values(memoryAgentPendingCounts).reduce(
    (sum, count) => sum + count,
    0,
  );
  const lastWorkerDebugAt =
    memoryWorkerDebug && memoryWorkerDebug.updatedAt > 0
      ? new Date(memoryWorkerDebug.updatedAt).toLocaleTimeString()
      : '';
  const lastEmbeddingDebugAt =
    memoryEmbeddingDebug && memoryEmbeddingDebug.updatedAt > 0
      ? new Date(memoryEmbeddingDebug.updatedAt).toLocaleTimeString()
      : '';
  const grilloRuntimeStartedAt =
    grilloRuntimeStatus && grilloRuntimeStatus.startedAt > 0
      ? new Date(grilloRuntimeStatus.startedAt).toLocaleTimeString()
      : '';
  const grilloRuntimeLastTickAt =
    grilloRuntimeStatus && grilloRuntimeStatus.lastTickAt > 0
      ? new Date(grilloRuntimeStatus.lastTickAt).toLocaleTimeString()
      : '';
  const selectedMemoryModel = aiSettings.memoryAgentModel.trim();
  const grilloLaneModel = selectedMemoryModel || aiSettings.model;
  const turnCadenceLabel = `${currentPendingWorkerTurns}/${aiSettings.memoryAgentIntervalMessages} current scope`;
  const memoryModelOptions = filterSafeProviderModels(
    selectedMemoryModel
      ? Array.from(new Set([...availableModels, selectedMemoryModel]))
      : availableModels,
  );
  const latestWorkerTrace = memoryGraphSummary?.recent.traces?.[0] ?? null;
  const latestGrilloActivity = memoryGraphSummary?.recent.activities?.[0] ?? null;

  return (
    <>
      <div className="control-group">
        <div className="control-label">G.R.I.L.L.O.</div>
        <select
          className="select-tech"
          onChange={(event) =>
            setAiSettings((current) => ({
              ...current,
              memoryAgentModel: event.target.value,
            }))
          }
          value={aiSettings.memoryAgentModel}
        >
          <option value="">Auto (preferred cheap model)</option>
          {memoryModelOptions.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
        <button className="btn-tech secondary" onClick={onRefreshModels} type="button">
          {modelsLoading ? 'Refreshing...' : 'Refresh Models'}
        </button>
        <div className="field-hint">
          Controls the background memory worker. It writes durable memories, reflective diary
          thoughts, and the relationship profile used in future replies.
        </div>
        <label className="setting-row">
          <span>Embedding source</span>
          <select
            className="select-tech compact-input"
            onChange={(event) =>
              setAiSettings((current) => ({
                ...current,
                embeddingMode:
                  event.target.value === 'provider' || event.target.value === 'auto'
                    ? event.target.value
                    : 'browser',
              }))
            }
            value={aiSettings.embeddingMode}
          >
            <option value="browser">Browser local</option>
            <option value="provider">Current provider</option>
            <option value="auto">Browser, then provider</option>
          </select>
        </label>
        <label className="setting-row">
          <span>Embedding model (provider)</span>
          <input
            className="input-tech compact-input"
            onChange={(event) =>
              setAiSettings((current) => ({
                ...current,
                embeddingModel: event.target.value.trim() || DEFAULT_OPENROUTER_EMBEDDING_MODEL,
              }))
            }
            spellCheck={false}
            type="text"
            value={aiSettings.embeddingModel}
          />
        </label>
        <label className="setting-row">
          <span>Embedding model (browser/local)</span>
          <input
            className="input-tech compact-input"
            onChange={(event) =>
              setAiSettings((current) => ({
                ...current,
                embeddingLocalModel:
                  event.target.value.trim() || DEFAULT_LOCAL_EMBEDDING_MODEL,
              }))
            }
            spellCheck={false}
            type="text"
            value={aiSettings.embeddingLocalModel}
          />
        </label>
        <div className="field-hint">
          Local model runs in the browser via transformers.js. Use a Hugging Face model id with ONNX
          weights. Backend semantic indexing falls back to provider embeddings when this lane is
          set to provider or auto.
        </div>
        <label className="setting-row">
          <span>Auto-run every N chat messages</span>
          <input
            className="input-tech compact-input"
            max={100}
            min={1}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (Number.isFinite(next)) {
                setAiSettings((current) => ({
                  ...current,
                  memoryAgentIntervalMessages: Math.max(1, Math.min(100, Math.round(next))),
                }));
              }
            }}
            type="number"
            value={aiSettings.memoryAgentIntervalMessages}
          />
        </label>
        <div className="field-hint">
          Counts normalized local chat and Twitch chat messages. The worker runs from the same queue
          as the manual button after this many messages land in the current memory scope.
        </div>
        <div className="memory-entry">
          <div className="memory-entry-header">
            <strong>G.R.I.L.L.O. lane snapshot</strong>
            <span>{currentModeLabel}</span>
          </div>
          <p>
            Chat lane: {aiSettings.llmProvider} / {aiSettings.model} /{' '}
            {aiSettings.aiTransportMode} / {aiSettings.openAiStateMode}
          </p>
          <p>
            GRILLO lane: {aiSettings.llmProvider} / {grilloLaneModel} / max tool rounds{' '}
            {aiSettings.maxToolRounds}
          </p>
          <p>
            Embedding lane: {aiSettings.embeddingMode} / provider {aiSettings.embeddingModel} /
            local {aiSettings.embeddingLocalModel}
          </p>
          <p>
            Turn cadence: {turnCadenceLabel} / {totalPendingWorkerTurns} all scopes /{' '}
            {messageCount} chat messages / draft {chatDraftLength} chars
          </p>
        </div>
        <div className="btn-row">
          <button
            className="btn-tech secondary"
            disabled={memoryAgentBusy}
            onClick={onRunMemoryAgent}
            type="button"
          >
            {memoryAgentBusy ? 'Running...' : 'Run Memory Worker'}
          </button>
          <button
            className="btn-tech secondary"
            disabled={backendGrilloTickBusy}
            onClick={onRunBackendGrilloTick}
            type="button"
          >
            {backendGrilloTickBusy ? 'Ticking...' : 'Run Extraction'}
          </button>
          <button
            className="btn-tech secondary"
            disabled={backendGrilloTickBusy}
            onClick={onRunBackendGrilloBeat}
            type="button"
          >
            {backendGrilloTickBusy ? 'Ticking...' : 'Run Beat'}
          </button>
          <button
            className="btn-tech secondary"
            disabled={backendGrilloTickBusy}
            onClick={onRunBackendGrilloConsolidation}
            type="button"
          >
            {backendGrilloTickBusy ? 'Ticking...' : 'Run Consolidation'}
          </button>
          <button
            className="btn-tech secondary"
            disabled={backendGrilloTickBusy}
            onClick={onRunBackendGrilloCompaction}
            type="button"
          >
            {backendGrilloTickBusy ? 'Ticking...' : 'Run Compaction'}
          </button>
          <button
            className="btn-tech secondary"
            disabled={backendGrilloTickBusy}
            onClick={onRunBackendGrilloSemanticIndexing}
            type="button"
          >
            {backendGrilloTickBusy ? 'Ticking...' : 'Run Semantic Indexing'}
          </button>
        </div>
        <div className="status-copy">{memoryAgentStatus}</div>
        {grilloRuntimeStatus ? (
          <div className="memory-entry">
            <div className="memory-entry-header">
              <strong>Backend GRILLO runtime</strong>
              <span>{grilloRuntimeStatus.running ? 'running' : 'idle'}</span>
            </div>
            <p>
              {grilloRuntimeStatus.started ? 'started' : 'stopped'} /{' '}
              {grilloRuntimeStatus.enabled ? 'auto enabled' : 'manual only'} / interval{' '}
              {Math.round(grilloRuntimeStatus.intervalMs / 1000)}s
            </p>
            <div className="status-copy">
              Started: {grilloRuntimeStartedAt || 'not yet'} / Last tick:{' '}
              {grilloRuntimeLastTickAt || 'not yet'}
            </div>
            <div className="status-copy">
              Last result:{' '}
              {grilloRuntimeStatus.lastNoOpReason
                ? grilloRuntimeStatus.lastNoOpReason
                : `${grilloRuntimeStatus.lastTickDurationMs}ms`}
              {grilloRuntimeStatus.lastBeatType ? ` / ${grilloRuntimeStatus.lastBeatType}` : ''}
              {typeof grilloRuntimeStatus.lastToolCalls === 'number'
                ? ` / tools ${grilloRuntimeStatus.lastToolCalls}`
                : ''}
            </div>
          </div>
        ) : null}
        <div className="memory-kv-grid">
          <div className="status-copy">
            Pending current scope: <strong>{currentPendingWorkerTurns}</strong>
          </div>
          <div className="status-copy">
            Pending all scopes: <strong>{totalPendingWorkerTurns}</strong>
          </div>
        </div>
        {memoryWorkerDebug ? (
          <div className="memory-entry">
            <div className="memory-entry-header">
              <strong>Last worker run</strong>
              <span>{lastWorkerDebugAt}</span>
            </div>
            <p>
              {memoryWorkerDebug.status} / {memoryWorkerDebug.reason} / turns{' '}
              {memoryWorkerDebug.processedChatTurnCount}
              {memoryWorkerDebug.model ? ` / ${memoryWorkerDebug.model}` : ''}
              {typeof memoryWorkerDebug.toolCalls === 'number'
                ? ` / tools ${memoryWorkerDebug.toolCalls}`
                : ''}
              {typeof memoryWorkerDebug.rounds === 'number'
                ? ` / rounds ${memoryWorkerDebug.rounds}`
                : ''}
            </p>
            <p>{memoryWorkerDebug.stateKey}</p>
            {memoryWorkerDebug.error ? <p>{memoryWorkerDebug.error}</p> : null}
          </div>
        ) : null}
        {memoryEmbeddingDebug ? (
          <div className="memory-entry">
            <div className="memory-entry-header">
              <strong>Last embedding call</strong>
              <span>{lastEmbeddingDebugAt}</span>
            </div>
            <p>
              {memoryEmbeddingDebug.status} / {memoryEmbeddingDebug.operation} /{' '}
              {memoryEmbeddingDebug.provider} / chars {memoryEmbeddingDebug.inputChars}
              {memoryEmbeddingDebug.model ? ` / model ${memoryEmbeddingDebug.model}` : ''}
              {typeof memoryEmbeddingDebug.vectorDims === 'number'
                ? ` / dims ${memoryEmbeddingDebug.vectorDims}`
                : ''}
            </p>
            {memoryEmbeddingDebug.error ? <p>{memoryEmbeddingDebug.error}</p> : null}
          </div>
        ) : null}
        {modelsError ? <div className="status-copy">{modelsError}</div> : null}
      </div>

      {latestWorkerTrace || latestGrilloActivity ? (
        <div className="control-group">
          <div className="control-label">GRILLO Trace Inspector</div>
          {latestWorkerTrace ? (
            <div className="memory-entry">
              <div className="memory-entry-header">
                <strong>Last worker prompt</strong>
                <span>{latestWorkerTrace.taskType || latestWorkerTrace.beatType || 'task'}</span>
              </div>
              <p>
                {[latestWorkerTrace.provider, latestWorkerTrace.model, latestWorkerTrace.scopeKey]
                  .filter(Boolean)
                  .join(' / ') || 'No worker prompt metadata captured.'}
              </p>
              {latestWorkerTrace.systemPrompt ? (
                <div className="status-copy">{latestWorkerTrace.systemPrompt}</div>
              ) : null}
              <pre className="context-preview compact">
                {latestWorkerTrace.prompt || 'No worker prompt captured.'}
              </pre>
            </div>
          ) : null}
          {latestGrilloActivity ? (
            <div className="memory-entry">
              <div className="memory-entry-header">
                <strong>Last worker output</strong>
                <span>{latestGrilloActivity.beatType || 'beat'}</span>
              </div>
              <p>{latestGrilloActivity.scopeKey || 'unknown scope'}</p>
              {latestGrilloActivity.promptText ? (
                <div className="status-copy">{latestGrilloActivity.promptText}</div>
              ) : null}
              <pre className="context-preview compact">
                {latestGrilloActivity.responseText || 'No worker output captured.'}
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="control-group">
        <div className="control-label">Memory Backend</div>
        <div className="memory-kv-grid">
          <div className="status-copy">
            Backend:{' '}
            <strong>
              {memoryBackendStatus?.ok ? memoryBackendStatus.backend : 'browser fallback'}
            </strong>
          </div>
          <div className="status-copy">
            Snapshots: <strong>{memoryBackendStatus?.snapshots ?? 0}</strong>
          </div>
          <div className="status-copy">
            Grillo scopes: <strong>{memoryBackendStatus?.grilloScopes ?? 0}</strong>
          </div>
          <div className="status-copy">
            Semantic scopes: <strong>{memoryBackendStatus?.semanticScopes ?? 0}</strong>
          </div>
          <div className="status-copy">
            Turn events: <strong>{memoryBackendStatus?.turnEvents ?? 0}</strong>
          </div>
          <div className="status-copy">
            Graph candidates: <strong>{memoryBackendStatus?.candidates ?? 0}</strong>
          </div>
          <div className="status-copy">
            Memory blocks: <strong>{memoryBackendStatus?.memoryBlocks ?? 0}</strong>
          </div>
          <div className="status-copy">
            Memory slots: <strong>{memoryBackendStatus?.memorySlots ?? 0}</strong>
          </div>
          <div className="status-copy">
            Slot patches: <strong>{memoryBackendStatus?.memorySlotPatches ?? 0}</strong>
          </div>
          <div className="status-copy">
            Graph diary: <strong>{memoryBackendStatus?.diaryEntries ?? 0}</strong>
          </div>
          <div className="status-copy">
            GRILLO activities: <strong>{memoryBackendStatus?.grilloActivities ?? 0}</strong>
          </div>
          <div className="status-copy">
            Worker traces: <strong>{memoryBackendStatus?.workerContextTraces ?? 0}</strong>
          </div>
          <div className="status-copy">
            Emotion states: <strong>{memoryBackendStatus?.emotionStates ?? 0}</strong>
          </div>
          <div className="status-copy">
            Emotion signals: <strong>{memoryBackendStatus?.emotionIntensities ?? 0}</strong>
          </div>
          <div className="status-copy">
            Semantic records: <strong>{memoryBackendStatus?.semanticRecords ?? 0}</strong>
          </div>
          <div className="status-copy">
            Vector records: <strong>{memoryBackendStatus?.semanticVectors ?? 0}</strong>
          </div>
          <div className="status-copy">
            Relationship profiles: <strong>{memoryBackendStatus?.relationshipProfiles ?? 0}</strong>
          </div>
          <div className="status-copy">
            Relationship facts: <strong>{memoryBackendStatus?.relationshipFacts ?? 0}</strong>
          </div>
          <div className="status-copy">
            Scopes: <strong>{memoryBackendStatus?.scopes ?? 0}</strong>
          </div>
          <div className="status-copy">
            Participants: <strong>{memoryBackendStatus?.participants ?? 0}</strong>
          </div>
          <div className="status-copy">
            Personas: <strong>{memoryBackendStatus?.personas ?? 0}</strong>
          </div>
          <div className="status-copy">
            Graph edges: <strong>{memoryBackendStatus?.relationshipEdges ?? 0}</strong>
          </div>
        </div>
        {memoryBackendStatus?.dbDir ? (
          <div className="status-copy">
            Database path: <strong>{memoryBackendStatus.dbDir}</strong>
          </div>
        ) : null}
        <div className="field-hint">
          Local backend mode uses LadybugDB for native GRILLO turns, candidates, diary, slots,
          worker traces, vector records, participants, personas, scopes, and graph edges, then falls
          back to browser IndexedDB if the backend is unavailable.
        </div>
        {memoryGraphSummary ? (
          <div className="memory-list">
            {memoryGraphSummary.scopes.slice(0, 4).map((scope) => (
              <div className="memory-entry" key={scope.id}>
                <div className="memory-entry-header">
                  <strong>{scope.personaId || 'unknown persona'}</strong>
                  <span>
                    {scope.source}:{scope.channel}
                  </span>
                </div>
                <p>{scope.id}</p>
              </div>
            ))}
            {memoryGraphSummary.participants.slice(0, 6).map((participant) => (
              <div className="memory-entry" key={participant.id}>
                <div className="memory-entry-header">
                  <strong>{participant.displayName || participant.id}</strong>
                  <span>
                    {participant.source}:{participant.channel}
                  </span>
                </div>
                <p>{participant.id}</p>
              </div>
            ))}
            {memoryGraphSummary.personas.slice(0, 6).map((persona) => (
              <div className="memory-entry" key={persona.id}>
                <div className="memory-entry-header">
                  <strong>Persona</strong>
                  <span>{persona.name || persona.id}</span>
                </div>
                <p>{persona.id}</p>
              </div>
            ))}
            {memoryGraphSummary.edges.length > 0 ? (
              <div className="memory-entry">
                <div className="memory-entry-header">
                  <strong>Graph relations</strong>
                  <span>{memoryGraphSummary.edges.length} active types</span>
                </div>
                <p>
                  {memoryGraphSummary.edges
                    .map((edge) => `${edge.relation}: ${edge.count}`)
                    .join(' / ')}
                </p>
              </div>
            ) : null}
            {(memoryGraphSummary.recent.turns ?? []).slice(0, 4).map((turn) => (
              <div className="memory-entry" key={turn.id}>
                <div className="memory-entry-header">
                  <strong>Graph turn</strong>
                  <span>{turn.role || 'turn'}</span>
                </div>
                <p>{turn.authorName || 'unknown author'}</p>
                <div className="status-copy">{turn.text || 'No turn text captured.'}</div>
                <div className="status-copy">{turn.scopeKey || 'unknown scope'}</div>
              </div>
            ))}
            {memoryGraphSummary.recent.candidates.slice(0, 4).map((candidate) => (
              <div className="memory-entry" key={candidate.id}>
                <div className="memory-entry-header">
                  <strong>Graph candidate</strong>
                  <span>{candidate.type || 'memory'}</span>
                </div>
                <p>{candidate.participantKey || 'unknown participant'}</p>
                <div className="status-copy">{candidate.summary || 'No candidate summary.'}</div>
              </div>
            ))}
            {(memoryGraphSummary.recent.slots ?? []).slice(0, 4).map((slot) => (
              <div className="memory-entry" key={slot.id}>
                <div className="memory-entry-header">
                  <strong>{slot.slotName || 'Memory slot'}</strong>
                  <span>{slot.itemCount} items</span>
                </div>
                <p>{slot.participantKey || slot.scopeKey || 'unknown scope'}</p>
                {slot.items.length > 0 ? (
                  <div className="status-copy">{slot.items.join(' / ')}</div>
                ) : null}
              </div>
            ))}
            {(memoryGraphSummary.recent.slotPatches ?? []).slice(0, 4).map((patch) => (
              <div className="memory-entry" key={patch.id}>
                <div className="memory-entry-header">
                  <strong>Slot patch</strong>
                  <span>{patch.operation || 'patch'}</span>
                </div>
                <p>{patch.slotName || patch.slotId || 'unknown slot'}</p>
                <div className="status-copy">
                  {patch.participantKey || patch.scopeKey || 'unknown scope'}
                </div>
              </div>
            ))}
            {memoryGraphSummary.recent.diary.slice(0, 4).map((entry) => (
              <div className="memory-entry" key={entry.id}>
                <div className="memory-entry-header">
                  <strong>Graph diary</strong>
                  <span>{entry.beatType || 'reflection'}</span>
                </div>
                <p>{entry.participantKey || 'unknown participant'}</p>
                <div className="status-copy">{entry.summary || 'No diary summary.'}</div>
              </div>
            ))}
            {(memoryGraphSummary.recent.activities ?? []).slice(0, 4).map((activity) => (
              <div className="memory-entry" key={activity.id}>
                <div className="memory-entry-header">
                  <strong>GRILLO activity</strong>
                  <span>{activity.beatType || 'beat'}</span>
                </div>
                <p>{activity.scopeKey || 'unknown scope'}</p>
                {activity.promptText ? (
                  <div className="status-copy">{activity.promptText}</div>
                ) : null}
                <div className="status-copy">
                  {activity.responseText || 'No activity response captured.'}
                </div>
              </div>
            ))}
            {(memoryGraphSummary.recent.traces ?? []).slice(0, 4).map((trace) => (
              <div className="memory-entry" key={trace.id}>
                <div className="memory-entry-header">
                  <strong>Worker trace</strong>
                  <span>{trace.taskType || 'task'}</span>
                </div>
                <p>{trace.scopeKey || 'unknown scope'}</p>
                <div className="status-copy">
                  {[trace.provider, trace.model, trace.beatType].filter(Boolean).join(' / ') ||
                    'No trace model metadata captured.'}
                </div>
                {trace.prompt ? <div className="status-copy">{trace.prompt}</div> : null}
              </div>
            ))}
            {memoryGraphSummary.recent.relationships.slice(0, 4).map((profile) => (
              <div className="memory-entry" key={profile.id}>
                <div className="memory-entry-header">
                  <strong>{profile.relationshipStage || 'relationship'}</strong>
                  <span>{profile.mood || 'mood unknown'}</span>
                </div>
                <p>{profile.scopeKey}</p>
                <div className="status-copy">
                  {profile.summary || 'No relationship summary yet.'}
                </div>
              </div>
            ))}
            {memoryGraphSummary.recent.relationshipFacts.slice(0, 4).map((fact) => (
              <div className="memory-entry" key={fact.id}>
                <div className="memory-entry-header">
                  <strong>Relationship fact</strong>
                  <span>{fact.scopeKey || 'unknown scope'}</span>
                </div>
                <p>{fact.text || 'No relationship fact captured.'}</p>
              </div>
            ))}
            {memoryGraphSummary.recent.blocks.slice(0, 4).map((block) => (
              <div className="memory-entry" key={block.id}>
                <div className="memory-entry-header">
                  <strong>{block.blockName || 'Memory block'}</strong>
                  <span>{block.itemCount} items</span>
                </div>
                <p>{block.participantKey || 'unknown participant'}</p>
                {block.items.length > 0 ? (
                  <div className="status-copy">{block.items.join(' / ')}</div>
                ) : null}
                <div className="status-copy">{block.scopeKey || 'unknown scope'}</div>
              </div>
            ))}
            {memoryGraphSummary.recent.emotions.slice(0, 4).map((emotion) => (
              <div className="memory-entry" key={emotion.id}>
                <div className="memory-entry-header">
                  <strong>Emotion state</strong>
                  <span>{emotion.lastSignalSource || 'no signal source'}</span>
                </div>
                <p>{emotion.scopeKey}</p>
                <div className="status-copy">
                  Updated:{' '}
                  {emotion.updatedAt > 0 ? new Date(emotion.updatedAt).toLocaleString() : 'not yet'}
                </div>
              </div>
            ))}
            {memoryGraphSummary.recent.emotionIntensities.slice(0, 6).map((emotion) => (
              <div className="memory-entry" key={emotion.id}>
                <div className="memory-entry-header">
                  <strong>{emotion.name || 'emotion'}</strong>
                  <span>{emotion.intensity}</span>
                </div>
                <p>{emotion.scopeKey}</p>
                <div className="status-copy">{emotion.emotionStateId}</div>
              </div>
            ))}
            {memoryGraphSummary.recent.semantic.slice(0, 4).map((record) => (
              <div className="memory-entry" key={record.id}>
                <div className="memory-entry-header">
                  <strong>Semantic record</strong>
                  <span>{record.personaId || 'unknown persona'}</span>
                </div>
                <p>{record.text || 'No semantic text captured.'}</p>
              </div>
            ))}
            {memoryGraphSummary.recent.vectors.slice(0, 4).map((record) => (
              <div className="memory-entry" key={record.id}>
                <div className="memory-entry-header">
                  <strong>Vector record</strong>
                  <span>{record.personaId || 'unknown persona'}</span>
                </div>
                <p>{record.text || 'No vector text captured.'}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="control-group">
        <div className="control-label">Memory Store</div>
        <div className="memory-kv-grid">
          <div className="status-copy">
            Scope: <strong>{grilloMemoryState.scopeKey}</strong>
          </div>
          <div className="status-copy">
            Blocks: <strong>{grilloMemoryState.blocks.length}</strong>
          </div>
          <div className="status-copy">
            Candidates: <strong>{grilloMemoryState.candidates.length}</strong>
          </div>
          <div className="status-copy">
            Diary entries: <strong>{grilloMemoryState.diaryEntries.length}</strong>
          </div>
          <div className="status-copy">
            Promoted: <strong>{promotedCount}</strong>
          </div>
          <div className="status-copy">
            Updated: <strong>{lastUpdated || 'not yet'}</strong>
          </div>
        </div>
        <div className="field-hint">
          This is the current persona/source memory scope. Twitch and local chat can have different
          stores. Candidate memories ingest raw local and Twitch chat turns; diary thoughts are
          written by the worker only when there is something worth reflecting on.
        </div>
      </div>

      <div className="control-group">
        <div className="control-label">Last Prompt Injection</div>
        {memoryPromptDebug ? (
          <div className="memory-list">
            <div className="memory-entry">
              <div className="memory-entry-header">
                <strong>{memoryPromptDebug.source}</strong>
                <span>{lastPromptDebugAt}</span>
              </div>
              <p>{memoryPromptDebug.turnText || 'No turn text captured.'}</p>
              <p>{memoryPromptDebug.stateKey}</p>
            </div>
            <div className="memory-entry">
              <div className="memory-entry-header">
                <strong>relationship_memory</strong>
                <span>{memoryPromptDebug.grilloRelationshipMemory.length}</span>
              </div>
              <ul>
                {memoryPromptDebug.grilloRelationshipMemory.length > 0 ? (
                  memoryPromptDebug.grilloRelationshipMemory.map((item, index) => (
                    <li key={`${index}:${item}`}>{item}</li>
                  ))
                ) : (
                  <li>No relationship memory injected.</li>
                )}
              </ul>
            </div>
            <div className="memory-entry">
              <div className="memory-entry-header">
                <strong>recalled_memories</strong>
                <span>{memoryPromptDebug.grilloRecalledMemories.length}</span>
              </div>
              <ul>
                {memoryPromptDebug.grilloRecalledMemories.length > 0 ? (
                  memoryPromptDebug.grilloRecalledMemories.map((item, index) => (
                    <li key={`${index}:${item}`}>{item}</li>
                  ))
                ) : (
                  <li>No Grillo recall injected.</li>
                )}
              </ul>
            </div>
            <div className="memory-entry">
              <div className="memory-entry-header">
                <strong>semantic_memory</strong>
                <span>{memoryPromptDebug.semanticMemoryContext.trim() ? 'present' : 'empty'}</span>
              </div>
              <p>{memoryPromptDebug.semanticMemoryContext || 'No semantic matches injected.'}</p>
            </div>
            <div className="memory-entry">
              <div className="memory-entry-header">
                <strong>native_grillo_context_packet</strong>
                <span>{memoryPromptDebug.grilloContextPacket ? 'present' : 'empty'}</span>
              </div>
              {memoryPromptDebug.grilloContextPacket ? (
                <div className="memory-kv-grid">
                  <div className="status-copy">
                    background_information:{' '}
                    <strong>
                      {memoryPromptDebug.grilloContextPacket.background_information.length}
                    </strong>
                  </div>
                  <div className="status-copy">
                    channel_history:{' '}
                    <strong>{memoryPromptDebug.grilloContextPacket.channel_history.length}</strong>
                  </div>
                  <div className="status-copy">
                    relationship_memory:{' '}
                    <strong>
                      {memoryPromptDebug.grilloContextPacket.relationship_memory.length}
                    </strong>
                  </div>
                  <div className="status-copy">
                    recalled_memories:{' '}
                    <strong>
                      {memoryPromptDebug.grilloContextPacket.recalled_memories.length}
                    </strong>
                  </div>
                  <div className="status-copy">
                    thoughts: <strong>{memoryPromptDebug.grilloContextPacket.thoughts.length}</strong>
                  </div>
                  <div className="status-copy">
                    output_description:{' '}
                    <strong>{memoryPromptDebug.grilloContextPacket.output_description.length}</strong>
                  </div>
                  <p>
                    {[
                      ...memoryPromptDebug.grilloContextPacket.relationship_memory,
                      ...memoryPromptDebug.grilloContextPacket.recalled_memories,
                      ...memoryPromptDebug.grilloContextPacket.thoughts,
                    ]
                      .slice(0, 4)
                      .join('\n') || 'Packet loaded with no memory rows yet.'}
                  </p>
                  <pre className="context-preview compact">
                    {JSON.stringify(memoryPromptDebug.grilloContextPacket, null, 2)}
                  </pre>
                </div>
              ) : (
                <p>No native Ladybug GRILLO packet loaded for the last prompt.</p>
              )}
            </div>
          </div>
        ) : (
          <div className="status-copy">No completed prompt injection captured yet.</div>
        )}
      </div>

      <div className="control-group">
        <div className="control-label">Memory Blocks</div>
        {recentBlocks.length > 0 ? (
          <div className="memory-list">
            {recentBlocks.map((block) => (
              <div className="memory-entry" key={block.blockId}>
                <div className="memory-entry-header">
                  <strong>{block.blockName}</strong>
                  <span>{block.participantKey}</span>
                </div>
                <ul>
                  {block.items.slice(-4).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <div className="status-copy">No promoted memory blocks yet.</div>
        )}
      </div>

      <div className="control-group">
        <div className="control-label">Recent Candidates</div>
        {recentCandidates.length > 0 ? (
          <div className="memory-list">
            {recentCandidates.map((candidate) => (
              <div className="memory-entry" key={candidate.candidateId}>
                <div className="memory-entry-header">
                  <strong>{candidate.type}</strong>
                  <span>{Math.round(candidate.confidence * 100)}%</span>
                </div>
                <div className="status-copy">{candidate.summary}</div>
                <div className="memory-pill-row">
                  <span className="memory-pill">{candidate.source}</span>
                  <span className="memory-pill">{candidate.participantKey}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="status-copy">No candidate memories captured yet.</div>
        )}
      </div>

      <div className="control-group">
        <div className="control-label">Reflective Diary</div>
        {recentDiary.length > 0 ? (
          <div className="memory-list">
            {recentDiary.map((entry) => (
              <div className="memory-entry" key={entry.diaryId}>
                <div className="memory-entry-header">
                  <strong>{entry.beatType}</strong>
                  <span>{new Date(entry.createdAt).toLocaleString()}</span>
                </div>
                <div className="status-copy">{entry.summary}</div>
                {entry.interactionSummary ? (
                  <div className="status-copy">{entry.interactionSummary}</div>
                ) : null}
                <pre className="context-preview compact">{entry.personalThought}</pre>
                {entry.emotions?.length || entry.contextTags?.length ? (
                  <div className="memory-pill-row">
                    {entry.emotions?.map((emotion) => (
                      <span className="memory-pill" key={`${entry.diaryId}:${emotion.name}`}>
                        {emotion.name} {Math.round(emotion.intensity)}/10
                      </span>
                    ))}
                    {entry.contextTags?.map((tag) => (
                      <span className="memory-pill" key={`${entry.diaryId}:${tag}`}>
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="status-copy">No reflective diary thoughts yet.</div>
        )}
      </div>

      <div className="control-group">
        <div className="control-label">Relationship Profile</div>
        <div className="status-copy">
          Messages: <strong>{messageCount}</strong>
        </div>
        <div className="status-copy">
          Draft chars: <strong>{chatDraftLength}</strong>
        </div>
        <div className="status-copy">
          Relationship stage: <strong>{relationshipMemory.relationshipStage}</strong>
        </div>
        <div className="status-copy">
          Mood: <strong>{relationshipMemory.mood}</strong>
        </div>
        <div className="status-copy">
          Stored facts: <strong>{relationshipMemory.facts.length}</strong>
        </div>
        <div className="status-copy">
          Prior turns: <strong>{relationshipMemory.turnCount}</strong>
        </div>
        <div className="status-copy">
          Last worker pass: <strong>{relationshipMemory.lastDiaryTurnCount}</strong>
        </div>
      </div>

      <div className="control-group">
        <div className="control-label">Relationship Stats</div>
        <div className="status-copy">
          Trust: <strong>{relationshipMemory.trust}</strong>
        </div>
        <div className="status-copy">
          Attraction: <strong>{relationshipMemory.attraction}</strong>
        </div>
        <div className="status-copy">
          Respect: <strong>{relationshipMemory.respect}</strong>
        </div>
        <div className="status-copy">
          Irritation: <strong>{relationshipMemory.irritation}</strong>
        </div>
        <div className="status-copy">
          Jealousy: <strong>{relationshipMemory.jealousy}</strong>
        </div>
        <div className="status-copy">
          Guard: <strong>{relationshipMemory.guard}</strong>
        </div>
        <div className="status-copy">
          Last action tag: <strong>{relationshipMemory.lastActionTag}</strong>
        </div>
      </div>

      <div className="control-group">
        <div className="control-label">Profile Summary</div>
        <pre className="context-preview">
          {relationshipMemory.summary
            ? relationshipMemory.summary
            : 'No stored relationship summary yet.'}
        </pre>
      </div>

      <div className="control-group">
        <div className="control-label">Latest Reflection Snapshot</div>
        <pre className="context-preview">
          {relationshipMemory.diaryEntry
            ? relationshipMemory.diaryEntry
            : 'No diary entry written yet.'}
        </pre>
      </div>

      <div className="control-group">
        <div className="control-label">Reset Controls</div>
        <div className="btn-row">
          <button className="btn-tech secondary" onClick={onClearChat} type="button">
            Clear Chat
          </button>
          <button className="btn-tech secondary" onClick={onClearDraft} type="button">
            Clear Draft
          </button>
        </div>
        <div className="btn-row">
          <button className="btn-tech secondary" onClick={onClearMemory} type="button">
            Clear GRILLO Memory
          </button>
          <button className="btn-tech danger" onClick={onResetContext} type="button">
            Reset Chat Context
          </button>
        </div>
        <div className="field-hint">
          Reset Chat Context clears chat history, draft text, recent Twitch/local transcript context,
          pending assistant playback, and any in-flight reply. Clear GRILLO Memory clears the
          current scope's durable relationship, GRILLO, diary, and semantic recall.
        </div>
      </div>
    </>
  );
}
