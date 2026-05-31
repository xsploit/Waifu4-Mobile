import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { TwitchSettings } from '../../../lib/chat/types';
import { Slider } from '../ui/Slider';
import { Toggle } from '../ui/Toggle';

type TwitchTabProps = {
  activeChatterCount: number;
  aiModeLabel: string;
  batchPending: number;
  botMentionTag: string;
  channel: string;
  chatOverlayOpen: boolean;
  connectionLabel: string;
  directChatEnabled: boolean;
  onResetTwitchState: () => void;
  onSetChannel: (channel: string) => void;
  onToggleChatOverlay: (open: boolean) => void;
  queueLength: number;
  setTwitchSettings: Dispatch<SetStateAction<TwitchSettings>>;
  streamTranscriptCount: number;
  streamTranscriptionStatus: string;
  streamVisionStatus: string;
  twitchSettings: TwitchSettings;
};

function updateTwitchSettings(
  setTwitchSettings: Dispatch<SetStateAction<TwitchSettings>>,
  patch: Partial<TwitchSettings>,
) {
  setTwitchSettings((current) => ({
    ...current,
    ...patch,
  }));
}

function NumberField({
  label,
  max,
  min,
  onChange,
  step = 1,
  value,
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step?: number;
  value: number;
}) {
  return (
    <label className="setting-row">
      <span>{label}</span>
      <input
        className="input-tech compact-input"
        max={max}
        min={min}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) {
            onChange(Math.max(min, Math.min(max, Math.round(next))));
          }
        }}
        step={step}
        type="number"
        value={value}
      />
    </label>
  );
}

export function TwitchTab({
  activeChatterCount,
  aiModeLabel,
  batchPending,
  botMentionTag,
  channel,
  chatOverlayOpen,
  connectionLabel,
  directChatEnabled,
  onResetTwitchState,
  onSetChannel,
  onToggleChatOverlay,
  queueLength,
  setTwitchSettings,
  streamTranscriptCount,
  streamTranscriptionStatus,
  streamVisionStatus,
  twitchSettings,
}: TwitchTabProps) {
  const [draftChannel, setDraftChannel] = useState(channel);

  useEffect(() => {
    setDraftChannel(channel);
  }, [channel]);

  const cleanDraft = draftChannel.replace(/^#/, '').trim().toLowerCase();

  return (
    <>
      <div className="control-group">
        <div className="control-label">Twitch Connection</div>
        <div className="status-grid">
          <div className="status-copy">
            IRC: <strong>{directChatEnabled ? connectionLabel : 'Disabled'}</strong>
          </div>
          <div className="status-copy">
            Channel: <strong>#{channel || 'subsect'}</strong>
          </div>
          <div className="status-copy">
            Mention tag: <strong>{botMentionTag}</strong>
          </div>
          <div className="status-copy">
            AI mode: <strong>{aiModeLabel}</strong>
          </div>
          <div className="status-copy">
            Local name: <strong>{twitchSettings.localDisplayName}</strong>
          </div>
          <div className="status-copy">
            Commands: <strong>{twitchSettings.commandsEnabled ? 'Enabled' : 'Off'}</strong>
          </div>
          <div className="status-copy">
            Stream Mode: <strong>{twitchSettings.streamModeEnabled ? 'On' : 'Local only'}</strong>
          </div>
        </div>
      </div>

      <div className="control-group">
        <div className="control-label">Chat Room</div>
        <input
          className="input-tech"
          onChange={(event) => setDraftChannel(event.target.value)}
          placeholder="subsect"
          spellCheck={false}
          type="text"
          value={draftChannel}
        />
        <div className="btn-row">
          <button
            className="btn-tech secondary"
            disabled={!cleanDraft || cleanDraft === channel}
            onClick={() => onSetChannel(cleanDraft)}
            type="button"
          >
            Switch Channel
          </button>
          <button
            className="btn-tech secondary"
            onClick={() => onToggleChatOverlay(!chatOverlayOpen)}
            type="button"
          >
            {chatOverlayOpen ? 'Collapse Overlay Chat' : 'Open Overlay Chat'}
          </button>
        </div>
        <div className="field-hint">
          Browser IRC listens read-only as anonymous Twitch chat. The local chat box is also routed
          as a trusted participant turn.
        </div>
      </div>

      <div className="control-group">
        <div className="control-label">Local Participant</div>
        <input
          className="input-tech"
          onChange={(event) =>
            updateTwitchSettings(setTwitchSettings, {
              localDisplayName: event.target.value,
            })
          }
          placeholder="Subsect"
          spellCheck={false}
          type="text"
          value={twitchSettings.localDisplayName}
        />
        <div className="setting-row">
          <span>Trusted local controls</span>
          <Toggle
            checked={twitchSettings.localTrustedControls}
            onChange={(checked) =>
              updateTwitchSettings(setTwitchSettings, { localTrustedControls: checked })
            }
          />
        </div>
        <div className="setting-row">
          <span>Chat overlay visible</span>
          <Toggle checked={chatOverlayOpen} onChange={onToggleChatOverlay} />
        </div>
        <div className="field-hint">
          Local messages still look like a viewer transcript turn, but trusted mode lets that
          participant run owner controls.
        </div>
      </div>

      <div className="control-group">
        <div className="control-label">AI Intake</div>
        <div className="status-grid">
          <div className="status-copy">
            Active chatters: <strong>{activeChatterCount}</strong>
          </div>
          <div className="status-copy">
            Direct queue: <strong>{queueLength}</strong>
          </div>
          <div className="status-copy">
            Batch pending: <strong>{batchPending}</strong>
          </div>
          <div className="status-copy">
            Overlay chat: <strong>{chatOverlayOpen ? 'Open' : 'Collapsed'}</strong>
          </div>
          <div className="status-copy">
            Direct intake: <strong>{twitchSettings.directChatterLimit} chatters</strong>
          </div>
          <div className="status-copy">
            All-chat intake:{' '}
            <strong>
              {twitchSettings.batchLowSize}/{twitchSettings.batchMidSize}/
              {twitchSettings.batchHighSize}/{twitchSettings.batchMaxSize} msgs
            </strong>
          </div>
        </div>
        <div className="setting-row">
          <span>Stream Mode</span>
          <Toggle
            checked={twitchSettings.streamModeEnabled}
            onChange={(checked) =>
              updateTwitchSettings(setTwitchSettings, { streamModeEnabled: checked })
            }
          />
        </div>
        <div className="setting-row">
          <span>AI replies from Twitch</span>
          <Toggle
            checked={twitchSettings.aiEnabled}
            onChange={(checked) => updateTwitchSettings(setTwitchSettings, { aiEnabled: checked })}
          />
        </div>
        <div className="setting-row">
          <span>Commands</span>
          <Toggle
            checked={twitchSettings.commandsEnabled}
            onChange={(checked) =>
              updateTwitchSettings(setTwitchSettings, { commandsEnabled: checked })
            }
          />
        </div>
        <div className="setting-row">
          <span>Require @mention under threshold</span>
          <Toggle
            checked={twitchSettings.mentionRequiredUnderThreshold}
            onChange={(checked) =>
              updateTwitchSettings(setTwitchSettings, { mentionRequiredUnderThreshold: checked })
            }
          />
        </div>
        <NumberField
          label="Direct mode up to chatters"
          max={250}
          min={0}
          onChange={(value) =>
            updateTwitchSettings(setTwitchSettings, { directChatterLimit: value })
          }
          value={twitchSettings.directChatterLimit}
        />
        <NumberField
          label="Transcript context kept"
          max={300}
          min={10}
          onChange={(value) => updateTwitchSettings(setTwitchSettings, { contextLimit: value })}
          value={twitchSettings.contextLimit}
        />
        <NumberField
          label="Max pending jobs"
          max={50}
          min={1}
          onChange={(value) => updateTwitchSettings(setTwitchSettings, { maxPendingJobs: value })}
          value={twitchSettings.maxPendingJobs}
        />
        <NumberField
          label="Max batch messages retained"
          max={500}
          min={10}
          onChange={(value) => updateTwitchSettings(setTwitchSettings, { maxBatchMessages: value })}
          value={twitchSettings.maxBatchMessages}
        />
        <div className="field-hint">
          Direct mode intakes one tagged Twitch/local participant message per reply. All-chat mode
          intakes every normal Twitch chat line until the configured message count or timer fires.
        </div>
        <button className="btn-tech danger" onClick={onResetTwitchState} type="button">
          Reset Twitch AI Queue
        </button>
      </div>

      <div className="control-group">
        <div className="control-label">Queue Timing</div>
        <Slider
          label={`Reply cooldown ${(twitchSettings.replyGapMs / 1000).toFixed(1)}s`}
          max={30}
          min={0}
          onInput={(value) =>
            updateTwitchSettings(setTwitchSettings, { replyGapMs: Math.round(value * 1000) })
          }
          step={0.5}
          value={twitchSettings.replyGapMs / 1000}
        />
        <Slider
          label={`Normal batch wait ${Math.round(twitchSettings.batchWaitMs / 1000)}s`}
          max={120}
          min={5}
          onInput={(value) =>
            updateTwitchSettings(setTwitchSettings, { batchWaitMs: Math.round(value * 1000) })
          }
          step={5}
          value={Math.round(twitchSettings.batchWaitMs / 1000)}
        />
        <Slider
          label={`Huge chat wait ${Math.round(twitchSettings.batchFastWaitMs / 1000)}s`}
          max={120}
          min={5}
          onInput={(value) =>
            updateTwitchSettings(setTwitchSettings, {
              batchFastWaitMs: Math.round(value * 1000),
            })
          }
          step={5}
          value={Math.round(twitchSettings.batchFastWaitMs / 1000)}
        />
      </div>

      <div className="control-group">
        <div className="control-label">Stream Audio Context</div>
        <div className="status-grid">
          <div className="status-copy">
            ASR: <strong>{twitchSettings.streamTranscriptionEnabled ? 'On' : 'Off'}</strong>
          </div>
          <div className="status-copy">
            Snippets: <strong>{streamTranscriptCount}</strong>
          </div>
          <div className="status-copy">
            Model: <strong>{twitchSettings.streamTranscriptionModel}</strong>
          </div>
        </div>
        <div className="setting-row">
          <span>Transcribe Twitch stream audio</span>
          <Toggle
            checked={twitchSettings.streamTranscriptionEnabled}
            onChange={(checked) =>
              updateTwitchSettings(setTwitchSettings, { streamTranscriptionEnabled: checked })
            }
          />
        </div>
        <label className="setting-row">
          <span>OpenRouter STT model</span>
          <input
            className="input-tech compact-input"
            onChange={(event) =>
              updateTwitchSettings(setTwitchSettings, {
                streamTranscriptionModel: event.target.value.trim() || 'openai/whisper-large-v3',
              })
            }
            spellCheck={false}
            type="text"
            value={twitchSettings.streamTranscriptionModel}
          />
        </label>
        <div className="field-hint">
          OpenRouter uses this model through /audio/transcriptions. Vercel Gateway falls back to
          Fish Speech ASR when a Fish key is saved.
        </div>
        <NumberField
          label="Sample seconds"
          max={60}
          min={5}
          onChange={(value) =>
            updateTwitchSettings(setTwitchSettings, { streamTranscriptionSampleSeconds: value })
          }
          value={twitchSettings.streamTranscriptionSampleSeconds}
        />
        <NumberField
          label="Run every seconds"
          max={600}
          min={30}
          onChange={(value) =>
            updateTwitchSettings(setTwitchSettings, { streamTranscriptionIntervalSeconds: value })
          }
          value={twitchSettings.streamTranscriptionIntervalSeconds}
        />
        <NumberField
          label="Context snippets kept"
          max={20}
          min={1}
          onChange={(value) =>
            updateTwitchSettings(setTwitchSettings, { streamTranscriptionContextLimit: value })
          }
          value={twitchSettings.streamTranscriptionContextLimit}
        />
        <div className="field-hint">
          Uses the browser-local OpenAI key through the backend. The server also needs ffmpeg plus
          yt-dlp or streamlink. Transcript snippets are ambient stream context, not chat messages.
        </div>
        <div className="status-copy">{streamTranscriptionStatus}</div>
      </div>

      <div className="control-group">
        <div className="control-label">Stream Vision Context</div>
        <div className="status-grid">
          <div className="status-copy">
            Vision: <strong>{twitchSettings.streamVisionContextEnabled ? 'On' : 'Off'}</strong>
          </div>
          <div className="status-copy">
            Detail: <strong>{twitchSettings.streamVisionDetail}</strong>
          </div>
          <div className="status-copy">
            Max age: <strong>{twitchSettings.streamVisionMaxAgeSeconds}s</strong>
          </div>
        </div>
        <div className="setting-row">
          <span>Attach Twitch stream frame to vision models</span>
          <Toggle
            checked={twitchSettings.streamVisionContextEnabled}
            onChange={(checked) =>
              updateTwitchSettings(setTwitchSettings, { streamVisionContextEnabled: checked })
            }
          />
        </div>
        <label className="setting-row">
          <span>Image detail</span>
          <select
            className="input-tech compact-input"
            onChange={(event) =>
              updateTwitchSettings(setTwitchSettings, {
                streamVisionDetail: event.target.value as TwitchSettings['streamVisionDetail'],
              })
            }
            value={twitchSettings.streamVisionDetail}
          >
            <option value="low">Low</option>
            <option value="auto">Auto</option>
            <option value="high">High</option>
          </select>
        </label>
        <NumberField
          label="Capture every seconds"
          max={600}
          min={30}
          onChange={(value) =>
            updateTwitchSettings(setTwitchSettings, { streamVisionIntervalSeconds: value })
          }
          value={twitchSettings.streamVisionIntervalSeconds}
        />
        <NumberField
          label="Use frame if younger than seconds"
          max={600}
          min={15}
          onChange={(value) =>
            updateTwitchSettings(setTwitchSettings, { streamVisionMaxAgeSeconds: value })
          }
          value={twitchSettings.streamVisionMaxAgeSeconds}
        />
        <div className="field-hint">
          Captures one JPEG frame from the Twitch stream and attaches it only when the selected
          model appears to support image input. It stays prompt context only.
        </div>
        <div className="status-copy">{streamVisionStatus}</div>
      </div>

      <div className="control-group">
        <div className="control-label">All-Chat Intake Size</div>
        <NumberField
          label="Intake msgs, 1-25 chatters"
          max={200}
          min={1}
          onChange={(value) => updateTwitchSettings(setTwitchSettings, { batchLowSize: value })}
          value={twitchSettings.batchLowSize}
        />
        <NumberField
          label="Intake msgs, 26-50 chatters"
          max={200}
          min={1}
          onChange={(value) => updateTwitchSettings(setTwitchSettings, { batchMidSize: value })}
          value={twitchSettings.batchMidSize}
        />
        <NumberField
          label="Intake msgs, 51-100 chatters"
          max={200}
          min={1}
          onChange={(value) => updateTwitchSettings(setTwitchSettings, { batchHighSize: value })}
          value={twitchSettings.batchHighSize}
        />
        <NumberField
          label="Intake msgs, 100+ chatters"
          max={300}
          min={1}
          onChange={(value) => updateTwitchSettings(setTwitchSettings, { batchMaxSize: value })}
          value={twitchSettings.batchMaxSize}
        />
      </div>
    </>
  );
}
