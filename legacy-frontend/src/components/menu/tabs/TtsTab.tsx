import type { Dispatch, SetStateAction } from 'react';
import type { AiSettings } from '../../../lib/chat/types';
import { getRemoteTtsProviderLabel, getRemoteVoiceStatus } from '../../../lib/tts/labels';
import type { PiperVoiceProfile } from '../../../lib/tts/piper';
import type { RemoteTtsProvider, RemoteTtsVoice } from '../../../lib/tts/remote';
import { Toggle } from '../ui/Toggle';
import { Slider } from '../ui/Slider';

type TtsTabProps = {
  aiSettings: AiSettings;
  onCacheVoice: () => void;
  onRefreshRemoteVoices: (provider: RemoteTtsProvider) => void;
  onRefreshVoices: () => void;
  onSelectVoice: (voiceId: string) => void;
  onSpeakLastReply: () => void;
  onStopTts: () => void;
  onTestVoice: () => void;
  setAiSettings: Dispatch<SetStateAction<AiSettings>>;
  ttsBusy: boolean;
  ttsCached: boolean;
  ttsStatus: string;
  ttsActiveVoice: PiperVoiceProfile | null;
  ttsVoices: PiperVoiceProfile[];
  remoteTtsVoices: RemoteTtsVoice[];
  remoteVoicesError: string | null;
  remoteVoicesLoading: boolean;
  voicesError: string | null;
  voicesLoading: boolean;
};

function updateAiSettings(
  setAiSettings: Dispatch<SetStateAction<AiSettings>>,
  patch: Partial<AiSettings>,
) {
  setAiSettings((current) => ({
    ...current,
    ...patch,
  }));
}

function normalizeRemoteModeForProvider(settings: AiSettings) {
  return settings.ttsProvider === 'inworld' && settings.remoteTtsMode === 'live-bridge'
    ? 'full-response'
    : settings.remoteTtsMode;
}

export function TtsTab({
  aiSettings,
  onCacheVoice,
  onRefreshRemoteVoices,
  onRefreshVoices,
  onSelectVoice,
  onSpeakLastReply,
  onStopTts,
  onTestVoice,
  setAiSettings,
  ttsBusy,
  ttsCached,
  ttsStatus,
  ttsActiveVoice,
  ttsVoices,
  remoteTtsVoices,
  remoteVoicesError,
  remoteVoicesLoading,
  voicesError,
  voicesLoading,
}: TtsTabProps) {
  const selectedVoice = ttsVoices.find((voice) => voice.key === aiSettings.ttsVoice) ?? null;
  const selectedRemoteProvider: RemoteTtsProvider | null =
    aiSettings.ttsProvider === 'piper' ? null : aiSettings.ttsProvider;
  const remoteProviderSelected = selectedRemoteProvider !== null;
  const selectedRemoteVoiceId =
    aiSettings.ttsProvider === 'fish-speech'
      ? aiSettings.fishSpeechVoiceId
      : aiSettings.ttsProvider === 'inworld'
        ? aiSettings.inworldVoiceId
        : '';
  const selectedRemoteVoice =
    remoteProviderSelected && selectedRemoteVoiceId
      ? (remoteTtsVoices.find((voice) => voice.id === selectedRemoteVoiceId) ?? null)
      : null;
  const remoteVoiceOptions =
    !remoteProviderSelected || selectedRemoteVoice
      ? remoteTtsVoices
      : selectedRemoteVoiceId
        ? [
            {
              provider: selectedRemoteProvider,
              id: selectedRemoteVoiceId,
              name: `Manual: ${selectedRemoteVoiceId}`,
            },
            ...remoteTtsVoices,
          ]
        : remoteTtsVoices;
  const remoteVoiceStatus = remoteProviderSelected
    ? getRemoteVoiceStatus({
        error: remoteVoicesError,
        listedVoiceCount: remoteTtsVoices.length,
        loading: remoteVoicesLoading,
        provider: selectedRemoteProvider,
        selectedVoiceId: selectedRemoteVoiceId,
        selectedVoiceListed: selectedRemoteVoice !== null,
      })
    : '';

  const renderRemoteVoiceOptions = () =>
    remoteVoiceOptions.map((voice) => {
      const label = [voice.name, voice.id, voice.languages?.join(','), voice.source]
        .filter(Boolean)
        .join(' | ');
      return (
        <option key={`${voice.provider}-${voice.id}`} value={voice.id}>
          {label}
        </option>
      );
    });

  return (
    <>
      <div className="control-group">
        <div className="control-label">Speech Output</div>
        <div className="toggle-row">
          <span>Enable TTS</span>
          <Toggle
            checked={aiSettings.ttsEnabled}
            onChange={(checked) => updateAiSettings(setAiSettings, { ttsEnabled: checked })}
          />
        </div>
        <div className="toggle-row">
          <span>Auto Speak Replies</span>
          <Toggle
            checked={aiSettings.ttsAutoSpeak}
            onChange={(checked) => updateAiSettings(setAiSettings, { ttsAutoSpeak: checked })}
          />
        </div>
        <div className="toggle-row">
          <span>Chunk Text Into TTS</span>
          <Toggle
            checked={aiSettings.ttsSimulatedStreaming}
            onChange={(checked) =>
              updateAiSettings(setAiSettings, { ttsSimulatedStreaming: checked })
            }
          />
        </div>
        <div className="toggle-row">
          <span>LLM Expression Tags</span>
          <Toggle
            checked={aiSettings.ttsExpressionTagsEnabled}
            onChange={(checked) =>
              updateAiSettings(setAiSettings, { ttsExpressionTagsEnabled: checked })
            }
          />
        </div>
      </div>

      <div className="control-group">
        <div className="control-label">TTS Engine</div>
        <select
          className="select-tech"
          onChange={(event) =>
            updateAiSettings(setAiSettings, {
              ttsProvider: event.target.value as AiSettings['ttsProvider'],
            })
          }
          value={aiSettings.ttsProvider}
        >
          <option value="piper">Piper Web</option>
          <option value="fish-speech">Fish Speech Live Bridge</option>
          <option value="inworld">Inworld Stream</option>
        </select>
        <div className="field-hint">
          Remote engines stream through the bot server so browser-local provider keys stay out of
          the browser audio playback path.
        </div>
      </div>

      {remoteProviderSelected ? (
        <div className="control-group">
          <div className="control-label">Remote TTS Pacing</div>
          <select
            className="select-tech"
            onChange={(event) =>
              updateAiSettings(setAiSettings, {
                remoteTtsMode: event.target.value as AiSettings['remoteTtsMode'],
              })
            }
            value={normalizeRemoteModeForProvider(aiSettings)}
          >
            {aiSettings.ttsProvider === 'fish-speech' ? (
              <option value="live-bridge">Fish Speech Live Bridge</option>
            ) : null}
            <option value="full-response">Stable Stream</option>
            <option value="sentence-chunks">Sentence Chunks</option>
          </select>
          <div className="field-hint">
            Fish Speech Live Bridge feeds Responses text deltas into one realtime Fish Speech
            stream. Inworld uses its SDK stream endpoint per request. Sentence chunks starts
            sooner, but each chunk can shift voice or prosody.
          </div>
        </div>
      ) : null}

      {aiSettings.ttsProvider === 'piper' ? (
        <div className="control-group">
          <div className="control-label">Piper Voice</div>
          <select
            className="select-tech"
            disabled={voicesLoading}
            onChange={(event) => onSelectVoice(event.target.value)}
            value={aiSettings.ttsVoice}
          >
            {ttsVoices.map((voice) => {
              const label = [
                voice.name,
                voice.key,
                voice.quality,
                voice.kind === 'custom' ? 'local' : voice.language?.name_english,
              ]
                .filter(Boolean)
                .join(' | ');

              return (
                <option key={voice.key} value={voice.key}>
                  {label}
                </option>
              );
            })}
          </select>
          <div className="btn-row">
            <button className="btn-tech secondary" onClick={onRefreshVoices} type="button">
              {voicesLoading ? 'Refreshing...' : 'Refresh Voices'}
            </button>
            <button
              className="btn-tech secondary"
              disabled={!selectedVoice || voicesLoading}
              onClick={onCacheVoice}
              title="Load the selected Piper voice model into the browser and prime audio."
              type="button"
            >
              {ttsCached ? 'Reload Model' : 'Load Model'}
            </button>
          </div>
          {voicesError ? <div className="status-copy">{voicesError}</div> : null}
          <div className="status-copy">
            Voice cache: <strong>{ttsCached ? 'ready' : 'not cached'}</strong>
          </div>
          <div className="status-copy">
            Selected: <strong>{selectedVoice?.name ?? 'none'}</strong> / Active:{' '}
            <strong>{ttsActiveVoice?.name ?? 'none'}</strong>
          </div>
          <div className="status-copy">{ttsStatus}</div>
        </div>
      ) : null}

      {aiSettings.ttsProvider === 'fish-speech' ? (
        <div className="control-group">
          <div className="control-label">Fish Speech Live</div>
          <select
            className="select-tech"
            onChange={(event) =>
              updateAiSettings(setAiSettings, {
                fishSpeechVoiceScope: event.target.value as AiSettings['fishSpeechVoiceScope'],
              })
            }
            value={aiSettings.fishSpeechVoiceScope}
          >
            <option value="all">My Models + Public</option>
            <option value="mine">My Fish Models</option>
            <option value="public">Public Models</option>
          </select>
          <select
            className="select-tech"
            disabled={remoteVoicesLoading}
            onChange={(event) =>
              updateAiSettings(setAiSettings, { fishSpeechVoiceId: event.target.value })
            }
            value={aiSettings.fishSpeechVoiceId}
          >
            <option value="">Server default / manual Fish reference</option>
            {renderRemoteVoiceOptions()}
          </select>
          <input
            autoComplete="off"
            className="input-tech"
            onChange={(event) =>
              updateAiSettings(setAiSettings, { fishSpeechVoiceId: event.target.value })
            }
            placeholder="Fish reference_id; blank uses server default"
            value={aiSettings.fishSpeechVoiceId}
          />
          <div className="btn-row">
            <button
              className="btn-tech secondary"
              disabled={remoteVoicesLoading}
              onClick={() => onRefreshRemoteVoices('fish-speech')}
              type="button"
            >
              {remoteVoicesLoading ? 'Fetching...' : 'Fetch Fish Voices'}
            </button>
          </div>
          <div className="status-copy">{remoteVoiceStatus}</div>
          <select
            className="select-tech"
            onChange={(event) =>
              updateAiSettings(setAiSettings, { fishSpeechModel: event.target.value })
            }
            value={aiSettings.fishSpeechModel}
          >
            <option value="s2">s2</option>
            <option value="s2-mini">s2-mini</option>
            <option value="s1">s1</option>
            <option value="s1-mini">s1-mini</option>
            <option value="speech-1.6">speech-1.6</option>
            <option value="speech-1.5">speech-1.5</option>
            <option value="agent-x0">agent-x0</option>
          </select>
          <select
            className="select-tech"
            onChange={(event) =>
              updateAiSettings(setAiSettings, {
                fishSpeechLatency: event.target.value as AiSettings['fishSpeechLatency'],
              })
            }
            value={aiSettings.fishSpeechLatency}
          >
            <option value="balanced">Balanced / fastest</option>
            <option value="normal">Normal quality</option>
          </select>
          <div className="toggle-row">
            <span>Condition Previous Chunks</span>
            <Toggle
              checked={aiSettings.fishSpeechConditionOnPreviousChunks}
              onChange={(checked) =>
                updateAiSettings(setAiSettings, {
                  fishSpeechConditionOnPreviousChunks: checked,
                })
              }
            />
          </div>
          <Slider
            label={`Fish Chunk ${aiSettings.fishSpeechChunkLength} chars`}
            max={300}
            min={100}
            onInput={(value) =>
              updateAiSettings(setAiSettings, { fishSpeechChunkLength: Math.round(value) })
            }
            step={10}
            value={aiSettings.fishSpeechChunkLength}
          />
          <div className="status-copy">{ttsStatus}</div>
        </div>
      ) : null}

      {aiSettings.ttsProvider === 'inworld' ? (
        <div className="control-group">
          <div className="control-label">{getRemoteTtsProviderLabel('inworld')} Stream</div>
          <select
            className="select-tech"
            disabled={remoteVoicesLoading}
            onChange={(event) =>
              updateAiSettings(setAiSettings, { inworldVoiceId: event.target.value })
            }
            value={aiSettings.inworldVoiceId}
          >
            <option value="">Server default / manual Inworld voice</option>
            {renderRemoteVoiceOptions()}
          </select>
          <input
            autoComplete="off"
            className="input-tech"
            onChange={(event) =>
              updateAiSettings(setAiSettings, { inworldVoiceId: event.target.value })
            }
            placeholder="Inworld voiceId; blank uses server default"
            value={aiSettings.inworldVoiceId}
          />
          <div className="btn-row">
            <button
              className="btn-tech secondary"
              disabled={remoteVoicesLoading}
              onClick={() => onRefreshRemoteVoices('inworld')}
              type="button"
            >
              {remoteVoicesLoading ? 'Fetching...' : 'Fetch Inworld Voices'}
            </button>
          </div>
          <div className="status-copy">{remoteVoiceStatus}</div>
          <input
            autoComplete="off"
            className="input-tech"
            onChange={(event) =>
              updateAiSettings(setAiSettings, { inworldModelId: event.target.value })
            }
            placeholder="inworld-tts-2"
            value={aiSettings.inworldModelId}
          />
          <select
            className="select-tech"
            onChange={(event) =>
              updateAiSettings(setAiSettings, {
                inworldDeliveryMode: event.target.value as AiSettings['inworldDeliveryMode'],
              })
            }
            value={aiSettings.inworldDeliveryMode}
          >
            <option value="STABLE">Stable</option>
            <option value="BALANCED">Balanced</option>
            <option value="CREATIVE">Creative</option>
          </select>
          <Slider
            label={`Buffer ${aiSettings.inworldBufferCharThreshold} chars`}
            max={300}
            min={20}
            onInput={(value) =>
              updateAiSettings(setAiSettings, {
                inworldBufferCharThreshold: Math.round(value),
              })
            }
            step={10}
            value={aiSettings.inworldBufferCharThreshold}
          />
          <div className="status-copy">{ttsStatus}</div>
        </div>
      ) : null}

      <div className="control-group">
        <div className="control-label">Controls</div>
        {remoteProviderSelected ? null : (
          <div className="status-copy">
            Voice cache: <strong>{ttsCached ? 'ready' : 'not cached'}</strong>
          </div>
        )}
        <div className="btn-row">
          <button
            className="btn-tech secondary"
            disabled={!aiSettings.ttsEnabled || ttsBusy}
            onClick={onTestVoice}
            type="button"
          >
            Test Voice
          </button>
          <button
            className="btn-tech secondary"
            disabled={!aiSettings.ttsEnabled || ttsBusy}
            onClick={onSpeakLastReply}
            type="button"
          >
            Speak Last Reply
          </button>
          <button className="btn-tech secondary" onClick={onStopTts} type="button">
            Stop Audio
          </button>
        </div>
      </div>

      <div className="control-group">
        <div className="control-label">Playback</div>
        <Slider
          label={`Speed ${aiSettings.ttsPlaybackRate.toFixed(2)}x`}
          max={1.35}
          min={0.7}
          onInput={(value) =>
            updateAiSettings(setAiSettings, {
              ttsPlaybackRate: Number(value.toFixed(2)),
            })
          }
          step={0.05}
          value={aiSettings.ttsPlaybackRate}
        />
        <Slider
          label={`Volume ${aiSettings.ttsVolume.toFixed(2)}x`}
          max={2}
          min={0}
          onInput={(value) =>
            updateAiSettings(setAiSettings, {
              ttsVolume: Number(value.toFixed(2)),
            })
          }
          step={0.05}
          value={aiSettings.ttsVolume}
        />
        <div className="field-hint">
          Speed and volume are browser playback controls. Remote providers still use their own
          server-side generation settings.
        </div>
      </div>
    </>
  );
}
