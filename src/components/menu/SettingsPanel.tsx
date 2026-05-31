import { useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type {
  AiProxyHealth,
  AiSettings,
  PersonaDraft,
  PersonaProfile,
  PersonaVoiceBinding,
  RelationshipMemory,
  TwitchSettings,
  VoiceLabVoice,
} from '../../lib/chat/types';
import type {
  MemoryEmbeddingDebugSnapshot,
  MemoryPromptDebugSnapshot,
  MemoryWorkerDebugSnapshot,
} from '../../lib/chat/memory-debug';
import type {
  BundledVrmOption,
  EmotionTelemetryEvent,
  ManualPlayRequest,
  SavedVrmModelSummary,
  SequencerSettings,
  SettingsTabId,
  VisualSettings,
} from '../../lib/menu/types';
import type { PiperVoiceProfile } from '../../lib/tts/piper';
import type {
  CreatedRemoteTtsVoice,
  CreateRemoteTtsVoiceRequest,
  RemoteTtsProvider,
  RemoteTtsVoice,
} from '../../lib/tts/remote';
import { DEFAULT_PERSONA } from '../../lib/chat/defaults';
import type { ProviderModelInfo } from '../../brain/modelCapability';
import type { GrilloMemoryState } from '../../lib/chat/grillo-memory';
import type {
  LadybugGrilloRuntimeStatus,
  LadybugMemoryGraphSummary,
  LadybugMemoryStatus,
} from '../../lib/chat/ladybug-memory-client';
import { AccountTab } from './tabs/AccountTab';
import { AiTab } from './tabs/AiTab';
import { AnimTab } from './tabs/AnimTab';
import { BackgroundTab } from './tabs/BackgroundTab';
import { CharacterTab } from './tabs/CharacterTab';
import { ContextTab } from './tabs/ContextTab';
import { EmotionTelemetryTab } from './tabs/EmotionTelemetryTab';
import { TtsTab } from './tabs/TtsTab';
import { TwitchTab } from './tabs/TwitchTab';
import { VoiceLabTab } from './tabs/VoiceLabTab';
import { VrmTab } from './tabs/VrmTab';

type SettingsPanelProps = {
  activePersona: PersonaProfile | null;
  activeTab: SettingsTabId;
  activeTwitchChatters: number;
  aiProxyHealth: AiProxyHealth | null;
  aiProxyHealthError: string | null;
  aiSettings: AiSettings;
  availableModelMetadata: ReadonlyMap<string, ProviderModelInfo>;
  availableModels: string[];
  batchPending: number;
  botMentionTag: string;
  bundledModels: BundledVrmOption[];
  chatDraftLength: number;
  chatOverlayOpen: boolean;
  messageCount: number;
  currentBundledModelId: string;
  currentCustomVrmModelId: string;
  emotionTelemetryEvents: EmotionTelemetryEvent[];
  localTransferStatus: string;
  onClose: () => void;
  onDeletePersona: (id: string) => void;
  onActivatePersona: (id: string) => void;
  onImportAnimationFile: (file: File) => void;
  onCacheVoice: () => void;
  onClearChat: () => void;
  onClearDraft: () => void;
  onClearMemory: () => void;
  onDeleteSavedVrmModel: (modelId: string) => void;
  onLoadBundledModel: (modelId: string) => void;
  onLoadModelFile: (file: File) => void;
  onLoadSavedVrmModel: (modelId: string) => void;
  onLoadSample: () => void;
  onExportLocalBackup: () => void;
  onImportLocalBackup: (file: File) => void;
  onPlayAnimation: (request: ManualPlayRequest) => void;
  onRefreshModels: () => void;
  onRefreshAiProxyHealth: () => void;
  onRefreshSavedVrmModels: () => void;
  onRefreshRemoteVoices: (provider: RemoteTtsProvider) => void;
  onRefreshVoices: () => void;
  onApplyPersonaVoice: (personaId: string) => void;
  onCreateVoiceLabProviderVoice: (
    request: CreateRemoteTtsVoiceRequest,
  ) => Promise<CreatedRemoteTtsVoice>;
  onDeleteVoiceLabVoice: (voiceId: string) => void;
  onResetContext: () => void;
  onResetTwitchState: () => void;
  onRunBackendGrilloBeat: () => void;
  onRunBackendGrilloCompaction: () => void;
  onRunBackendGrilloConsolidation: () => void;
  onRunBackendGrilloSemanticIndexing: () => void;
  onRunBackendGrilloTick: () => void;
  onRunMemoryAgent: () => void;
  onSavePersona: (draft: PersonaDraft, personaId?: string) => void;
  onSaveVoiceLabVoice: (voice: VoiceLabVoice) => void;
  onSelectVoice: (voiceId: string) => void;
  onSetTwitchChannel: (channel: string) => void;
  onSpeakLastReply: () => void;
  onStopTts: () => void;
  onTabChange: (tab: SettingsTabId) => void;
  onTestVoice: () => void;
  onToggleChatOverlay: (open: boolean) => void;
  onUseCurrentVoiceAsPersonaDefault: (personaId: string) => void;
  open: boolean;
  personaVoiceBindings: Record<string, PersonaVoiceBinding>;
  personas: PersonaProfile[];
  savedVrmModels: SavedVrmModelSummary[];
  savedVrmStatus: string;
  backendGrilloTickBusy: boolean;
  grilloMemoryState: GrilloMemoryState;
  grilloRuntimeStatus: LadybugGrilloRuntimeStatus | null;
  relationshipMemory: RelationshipMemory;
  memoryAgentBusy: boolean;
  memoryAgentPendingCounts: Record<string, number>;
  memoryAgentStatus: string;
  memoryBackendStatus: LadybugMemoryStatus | null;
  memoryEmbeddingDebug: MemoryEmbeddingDebugSnapshot | null;
  memoryGraphSummary: LadybugMemoryGraphSummary | null;
  memoryPromptDebug: MemoryPromptDebugSnapshot | null;
  memoryWorkerDebug: MemoryWorkerDebugSnapshot | null;
  setAiSettings: Dispatch<SetStateAction<AiSettings>>;
  setSequencerSettings: Dispatch<SetStateAction<SequencerSettings>>;
  setTwitchSettings: Dispatch<SetStateAction<TwitchSettings>>;
  setVisualSettings: Dispatch<SetStateAction<VisualSettings>>;
  sequencerSettings: SequencerSettings;
  ttsActiveVoice: PiperVoiceProfile | null;
  ttsBusy: boolean;
  ttsCached: boolean;
  ttsStatus: string;
  ttsVoices: PiperVoiceProfile[];
  remoteTtsVoices: RemoteTtsVoice[];
  remoteVoicesError: string | null;
  remoteVoicesLoading: boolean;
  voiceLabVoices: VoiceLabVoice[];
  twitchAiModeLabel: string;
  twitchChannel: string;
  twitchConnectionLabel: string;
  twitchDirectChatEnabled: boolean;
  twitchQueueLength: number;
  twitchSettings: TwitchSettings;
  twitchStreamTranscriptCount: number;
  twitchStreamTranscriptionStatus: string;
  twitchStreamVisionStatus: string;
  visualSettings: VisualSettings;
  modelsError: string | null;
  modelsLoading: boolean;
  voicesError: string | null;
  voicesLoading: boolean;
};

const TABS: { id: SettingsTabId; label: string }[] = [
  { id: 'account', label: 'Account' },
  { id: 'vrm', label: 'Avatar' },
  { id: 'background', label: 'Background' },
  { id: 'anim', label: 'Animation' },
  { id: 'emotion-telemetry', label: 'Emotion Log' },
  { id: 'character', label: 'Character' },
  { id: 'voice-lab', label: 'Voice Lab' },
  { id: 'ai', label: 'AI' },
  { id: 'twitch', label: 'Twitch' },
  { id: 'context', label: 'Memory' },
  { id: 'tts', label: 'TTS' },
];

export function SettingsPanel({
  activePersona,
  activeTab,
  activeTwitchChatters,
  aiProxyHealth,
  aiProxyHealthError,
  aiSettings,
  availableModelMetadata,
  availableModels,
  batchPending,
  botMentionTag,
  bundledModels,
  chatDraftLength,
  chatOverlayOpen,
  messageCount,
  currentBundledModelId,
  currentCustomVrmModelId,
  emotionTelemetryEvents,
  localTransferStatus,
  onCacheVoice,
  onClearChat,
  onClearDraft,
  onClearMemory,
  onClose,
  onDeletePersona,
  onDeleteSavedVrmModel,
  onActivatePersona,
  onImportAnimationFile,
  onLoadBundledModel,
  onLoadModelFile,
  onLoadSavedVrmModel,
  onLoadSample,
  onExportLocalBackup,
  onImportLocalBackup,
  onPlayAnimation,
  onRefreshModels,
  onRefreshAiProxyHealth,
  onRefreshSavedVrmModels,
  onRefreshRemoteVoices,
  onRefreshVoices,
  onApplyPersonaVoice,
  onCreateVoiceLabProviderVoice,
  onDeleteVoiceLabVoice,
  onResetContext,
  onResetTwitchState,
  onRunBackendGrilloBeat,
  onRunBackendGrilloCompaction,
  onRunBackendGrilloConsolidation,
  onRunBackendGrilloSemanticIndexing,
  onRunBackendGrilloTick,
  onRunMemoryAgent,
  onSavePersona,
  onSaveVoiceLabVoice,
  onSelectVoice,
  onSetTwitchChannel,
  onSpeakLastReply,
  onStopTts,
  onTabChange,
  onTestVoice,
  onToggleChatOverlay,
  onUseCurrentVoiceAsPersonaDefault,
  open,
  personaVoiceBindings,
  personas,
  savedVrmModels,
  savedVrmStatus,
  backendGrilloTickBusy,
  grilloMemoryState,
  grilloRuntimeStatus,
  relationshipMemory,
  memoryAgentBusy,
  memoryAgentPendingCounts,
  memoryAgentStatus,
  memoryBackendStatus,
  memoryEmbeddingDebug,
  memoryGraphSummary,
  memoryPromptDebug,
  memoryWorkerDebug,
  setAiSettings,
  setSequencerSettings,
  setTwitchSettings,
  setVisualSettings,
  sequencerSettings,
  ttsActiveVoice,
  ttsBusy,
  ttsCached,
  ttsStatus,
  ttsVoices,
  remoteTtsVoices,
  remoteVoicesError,
  remoteVoicesLoading,
  voiceLabVoices,
  twitchAiModeLabel,
  twitchChannel,
  twitchConnectionLabel,
  twitchDirectChatEnabled,
  twitchQueueLength,
  twitchSettings,
  twitchStreamTranscriptCount,
  twitchStreamTranscriptionStatus,
  twitchStreamVisionStatus,
  visualSettings,
  modelsError,
  modelsLoading,
  voicesError,
  voicesLoading,
}: SettingsPanelProps) {
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  const activeContent =
    activeTab === 'account' ? (
      <AccountTab
        localTransferStatus={localTransferStatus}
        onExportLocalBackup={onExportLocalBackup}
        onImportLocalBackup={onImportLocalBackup}
      />
    ) : activeTab === 'anim' ? (
      <AnimTab
        onImportAnimationFile={onImportAnimationFile}
        onPlayAnimation={onPlayAnimation}
        sequencerSettings={sequencerSettings}
        setSequencerSettings={setSequencerSettings}
      />
    ) : activeTab === 'emotion-telemetry' ? (
      <EmotionTelemetryTab emotionTelemetryEvents={emotionTelemetryEvents} />
    ) : activeTab === 'background' ? (
      <BackgroundTab
        activePersonaName={activePersona?.name ?? DEFAULT_PERSONA.name}
        setVisualSettings={setVisualSettings}
        visualSettings={visualSettings}
      />
    ) : activeTab === 'character' ? (
      <CharacterTab
        activePersona={activePersona}
        onActivatePersona={onActivatePersona}
        onDeletePersona={onDeletePersona}
        onSavePersona={onSavePersona}
        personas={personas}
      />
    ) : activeTab === 'voice-lab' ? (
      <VoiceLabTab
        activePersona={activePersona}
        aiSettings={aiSettings}
        onApplyPersonaVoice={onApplyPersonaVoice}
        onCreateProviderVoice={onCreateVoiceLabProviderVoice}
        onDeleteVoice={onDeleteVoiceLabVoice}
        onSaveVoice={onSaveVoiceLabVoice}
        onUseCurrentVoiceAsPersonaDefault={onUseCurrentVoiceAsPersonaDefault}
        personaVoiceBindings={personaVoiceBindings}
        personas={personas}
        ttsVoices={ttsVoices}
        voiceLabVoices={voiceLabVoices}
      />
    ) : activeTab === 'ai' ? (
      <AiTab
        activePersonaName={activePersona?.name ?? DEFAULT_PERSONA.name}
        aiSettings={aiSettings}
        availableModelMetadata={availableModelMetadata}
        availableModels={availableModels}
        aiProxyHealth={aiProxyHealth}
        aiProxyHealthError={aiProxyHealthError}
        modelsError={modelsError}
        modelsLoading={modelsLoading}
        onRefreshAiProxyHealth={onRefreshAiProxyHealth}
        onRefreshModels={onRefreshModels}
        setAiSettings={setAiSettings}
      />
    ) : activeTab === 'twitch' ? (
      <TwitchTab
        activeChatterCount={activeTwitchChatters}
        aiModeLabel={twitchAiModeLabel}
        batchPending={batchPending}
        botMentionTag={botMentionTag}
        channel={twitchChannel}
        chatOverlayOpen={chatOverlayOpen}
        connectionLabel={twitchConnectionLabel}
        directChatEnabled={twitchDirectChatEnabled}
        onResetTwitchState={onResetTwitchState}
        onSetChannel={onSetTwitchChannel}
        onToggleChatOverlay={onToggleChatOverlay}
        queueLength={twitchQueueLength}
        setTwitchSettings={setTwitchSettings}
        streamTranscriptCount={twitchStreamTranscriptCount}
        streamTranscriptionStatus={twitchStreamTranscriptionStatus}
        streamVisionStatus={twitchStreamVisionStatus}
        twitchSettings={twitchSettings}
      />
    ) : activeTab === 'context' ? (
      <ContextTab
        aiSettings={aiSettings}
        availableModelMetadata={availableModelMetadata}
        availableModels={availableModels}
        backendGrilloTickBusy={backendGrilloTickBusy}
        chatDraftLength={chatDraftLength}
        currentModeLabel={twitchAiModeLabel}
        messageCount={messageCount}
        onClearChat={onClearChat}
        onClearDraft={onClearDraft}
        onClearMemory={onClearMemory}
        onRefreshModels={onRefreshModels}
        onResetContext={onResetContext}
        onRunBackendGrilloBeat={onRunBackendGrilloBeat}
        onRunBackendGrilloCompaction={onRunBackendGrilloCompaction}
        onRunBackendGrilloConsolidation={onRunBackendGrilloConsolidation}
        onRunBackendGrilloSemanticIndexing={onRunBackendGrilloSemanticIndexing}
        onRunBackendGrilloTick={onRunBackendGrilloTick}
        onRunMemoryAgent={onRunMemoryAgent}
        grilloMemoryState={grilloMemoryState}
        grilloRuntimeStatus={grilloRuntimeStatus}
        relationshipMemory={relationshipMemory}
        memoryAgentBusy={memoryAgentBusy}
        memoryAgentPendingCounts={memoryAgentPendingCounts}
        memoryAgentStatus={memoryAgentStatus}
        memoryBackendStatus={memoryBackendStatus}
        memoryEmbeddingDebug={memoryEmbeddingDebug}
        memoryGraphSummary={memoryGraphSummary}
        memoryPromptDebug={memoryPromptDebug}
        memoryWorkerDebug={memoryWorkerDebug}
        modelsError={modelsError}
        modelsLoading={modelsLoading}
        setAiSettings={setAiSettings}
      />
    ) : activeTab === 'tts' ? (
      <TtsTab
        aiSettings={aiSettings}
        onCacheVoice={onCacheVoice}
        onRefreshVoices={onRefreshVoices}
        onRefreshRemoteVoices={onRefreshRemoteVoices}
        onSelectVoice={onSelectVoice}
        onSpeakLastReply={onSpeakLastReply}
        onStopTts={onStopTts}
        onTestVoice={onTestVoice}
        setAiSettings={setAiSettings}
        ttsBusy={ttsBusy}
        ttsCached={ttsCached}
        ttsStatus={ttsStatus}
        ttsVoices={ttsVoices}
        remoteTtsVoices={remoteTtsVoices}
        remoteVoicesError={remoteVoicesError}
        remoteVoicesLoading={remoteVoicesLoading}
        ttsActiveVoice={ttsActiveVoice}
        voicesError={voicesError}
        voicesLoading={voicesLoading}
      />
    ) : (
      <VrmTab
        bundledModels={bundledModels}
        currentBundledModelId={currentBundledModelId}
        currentCustomVrmModelId={currentCustomVrmModelId}
        onDeleteSavedVrmModel={onDeleteSavedVrmModel}
        onLoadBundledModel={onLoadBundledModel}
        onLoadModelFile={onLoadModelFile}
        onLoadSavedVrmModel={onLoadSavedVrmModel}
        onLoadSample={onLoadSample}
        onRefreshSavedVrmModels={onRefreshSavedVrmModels}
        savedModels={savedVrmModels}
        savedStatus={savedVrmStatus}
        setVisualSettings={setVisualSettings}
        visualSettings={visualSettings}
      />
    );

  return (
    <div
      className={`settings-panel ${open ? 'open' : ''}`}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onTouchEnd={(event) => {
        event.stopPropagation();
        const touch = event.changedTouches.item(0);
        if (!touch) {
          return;
        }

        const deltaY = touch.clientY - touchStartY.current;
        const deltaX = Math.abs(touch.clientX - touchStartX.current);
        if (deltaY > 80 && deltaY > deltaX && touchStartY.current < 160) {
          onClose();
        }
      }}
      onTouchStart={(event) => {
        event.stopPropagation();
        const touch = event.touches.item(0);
        if (!touch) {
          return;
        }

        touchStartY.current = touch.clientY;
        touchStartX.current = touch.clientX;
      }}
    >
      <svg className="svg-ui-bg panel-frame" preserveAspectRatio="none" viewBox="0 0 500 800">
        <path
          d="M0,20 L20,0 L500,0 L500,780 L480,800 L0,800 Z"
          fill="var(--c-panel)"
          stroke="var(--c-border)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        <line
          stroke="var(--c-border)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
          x1="20"
          x2="480"
          y1="60"
          y2="60"
        />
        <rect fill="var(--c-text-accent)" height="4" opacity="0.5" width="50" x="20" y="790" />
      </svg>

      <div className="settings-panel-header">
        <div>
          <div className="panel-kicker">Stream controls</div>
          <div className="panel-title">Settings</div>
        </div>
      </div>

      <div className="tabs-header" aria-label="Settings sections">
        {TABS.map((tab) => (
          <button
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="panel-scroll">{activeContent}</div>
    </div>
  );
}
