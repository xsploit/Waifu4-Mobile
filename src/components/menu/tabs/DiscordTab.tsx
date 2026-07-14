import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type {
  DiscordAsrProvider,
  DiscordConnectionStatus,
  DiscordSettings,
} from '../../../lib/chat/types';
import { createDefaultDiscordSettings } from '../../../lib/chat/defaults';
import { loadDiscordSettings, saveDiscordSettings } from '../../../lib/chat/storage';
import { Slider } from '../ui/Slider';
import { Toggle } from '../ui/Toggle';
import type { OverlayDiscordStatus } from '../../../lib/stream/overlay-events';

type DiscordTabProps = {
  connectionStatus?: DiscordConnectionStatus;
  discordSettings?: DiscordSettings;
  onConnect?: () => void;
  onDisconnect?: () => void;
  runtimeStatus?: OverlayDiscordStatus | null;
  setDiscordSettings?: Dispatch<SetStateAction<DiscordSettings>>;
  statusDetail?: string;
};

const TRANSCRIPTION_MODELS: Record<DiscordAsrProvider, Array<{ label: string; value: string }>> = {
  fish: [{ label: 'Fish ASR', value: 'fish-audio/asr' }],
  openrouter: [
    { label: 'Whisper large v3', value: 'openai/whisper-large-v3' },
    { label: 'Whisper 1', value: 'openai/whisper-1' },
  ],
  vercel: [{ label: 'Whisper 1', value: 'openai/whisper-1' }],
};

function defaultModelFor(provider: DiscordAsrProvider) {
  return TRANSCRIPTION_MODELS[provider][0]?.value ?? 'openai/whisper-1';
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

function parseControllerIds(value: string) {
  return Array.from(new Set(value.split(/[\s,]+/).map((id) => id.trim()).filter(Boolean))).slice(0, 50);
}

export function DiscordTab({
  connectionStatus = 'disconnected',
  discordSettings,
  onConnect,
  onDisconnect,
  runtimeStatus,
  setDiscordSettings,
  statusDetail,
}: DiscordTabProps) {
  const [localSettings, setLocalSettings] = useState(createDefaultDiscordSettings);
  const settings = discordSettings ?? localSettings;
  const detail = statusDetail ?? (setDiscordSettings ? 'Runtime bridge idle.' : 'Runtime bridge not wired.');

  useEffect(() => {
    if (discordSettings) {
      return;
    }
    void loadDiscordSettings().then(setLocalSettings);
  }, [discordSettings]);

  function updateSettings(patch: Partial<DiscordSettings>) {
    if (setDiscordSettings) {
      setDiscordSettings((current) => ({ ...current, ...patch }));
      return;
    }
    setLocalSettings((current) => {
      const next = { ...current, ...patch };
      void saveDiscordSettings(next);
      return next;
    });
  }

  const transcriptionModels = TRANSCRIPTION_MODELS[settings.asrProvider];
  const runtimeConfigurationChanged = Boolean(
    runtimeStatus?.asrProvider &&
      (runtimeStatus.asrProvider !== settings.asrProvider ||
        runtimeStatus.transcriptionModel !== settings.transcriptionModel),
  );

  return (
    <>
      <div className="control-group">
        <div className="control-label">Discord Voice Bridge</div>
        <div className="status-grid">
          <div className={`status-copy discord-status discord-status--${connectionStatus}`}>
            Connection: <strong>{connectionStatus}</strong>
          </div>
          <div className="status-copy">
            Voice intake: <strong>{settings.listenEnabled ? 'On' : 'Off'}</strong>
          </div>
        </div>
        <div className="status-copy">{detail}</div>
        {runtimeStatus?.asrProvider ? (
          <div className="status-copy">
            Live ASR: <strong>{runtimeStatus.asrProvider} / {runtimeStatus.transcriptionModel ?? 'default'}</strong>
          </div>
        ) : null}
        {runtimeConfigurationChanged ? (
          <div className="error-copy">Saved ASR settings differ from the live bridge. Reconnect to apply them.</div>
        ) : null}
        <div className="setting-row">
          <span>Enable Discord bridge</span>
          <Toggle checked={settings.enabled} onChange={(enabled) => updateSettings({ enabled })} />
        </div>
        <div className="setting-row">
          <span>Connect when runtime starts</span>
          <Toggle
            checked={settings.connectOnStart}
            onChange={(connectOnStart) => updateSettings({ connectOnStart })}
          />
        </div>
        <div className="btn-row">
          <button className="btn-tech secondary" disabled={!onConnect} onClick={onConnect} type="button">
            {connectionStatus === 'disconnected' ? 'Connect' : 'Reconnect / Apply'}
          </button>
          <button
            className="btn-tech secondary"
            disabled={!onDisconnect}
            onClick={onDisconnect}
            type="button"
          >
            Disconnect
          </button>
        </div>
      </div>

      <div className="control-group">
        <div className="control-label">Bot Identity</div>
        <input
          aria-label="Discord bot token"
          className="input-tech"
          onChange={(event) => updateSettings({ botToken: event.target.value })}
          placeholder="Paste Discord bot token"
          spellCheck={false}
          type="password"
          value={settings.botToken}
        />
        <div className="field-hint">Stored only in this browser's local settings and masked here.</div>
        <input
          aria-label="Discord guild ID"
          className="input-tech"
          inputMode="numeric"
          onChange={(event) => updateSettings({ guildId: event.target.value })}
          placeholder="Guild ID"
          spellCheck={false}
          type="text"
          value={settings.guildId}
        />
        <input
          aria-label="Discord voice channel ID"
          className="input-tech"
          inputMode="numeric"
          onChange={(event) => updateSettings({ voiceChannelId: event.target.value })}
          placeholder="Voice channel ID"
          spellCheck={false}
          type="text"
          value={settings.voiceChannelId}
        />
      </div>

      <div className="control-group">
        <div className="control-label">Speech Intake</div>
        <div className="setting-row">
          <span>Listen to voice channel</span>
          <Toggle
            checked={settings.listenEnabled}
            onChange={(listenEnabled) => updateSettings({ listenEnabled })}
          />
        </div>
        <label className="setting-row">
          <span>ASR provider</span>
          <select
            className="input-tech compact-input"
            onChange={(event) => {
              const asrProvider = event.target.value as DiscordAsrProvider;
              updateSettings({
                asrProvider,
                transcriptionModel: defaultModelFor(asrProvider),
              });
            }}
            value={settings.asrProvider}
          >
            <option value="fish">Fish</option>
            <option value="openrouter">OpenRouter</option>
            <option value="vercel">Vercel AI Gateway</option>
          </select>
        </label>
        <label className="setting-row">
          <span>Transcription model</span>
          <select
            className="input-tech compact-input"
            onChange={(event) => updateSettings({ transcriptionModel: event.target.value })}
            value={settings.transcriptionModel}
          >
            {transcriptionModels.map((model) => (
              <option key={model.value} value={model.value}>
                {model.label}
              </option>
            ))}
          </select>
        </label>
        <input
          aria-label="Speech language hint"
          className="input-tech"
          onChange={(event) => updateSettings({ languageHint: event.target.value })}
          placeholder="Language hint, e.g. en"
          spellCheck={false}
          type="text"
          value={settings.languageHint}
        />
      </div>

      <div className="control-group">
        <div className="control-label">Voice Activity</div>
        <Slider
          label={`VAD threshold ${settings.vadThreshold.toFixed(3)}`}
          max={0.5}
          min={0.005}
          onInput={(vadThreshold) => updateSettings({ vadThreshold: Number(vadThreshold.toFixed(3)) })}
          step={0.005}
          value={settings.vadThreshold}
        />
        <NumberField
          label="End silence ms"
          max={5000}
          min={100}
          onChange={(vadEndSilenceMs) => updateSettings({ vadEndSilenceMs })}
          value={settings.vadEndSilenceMs}
        />
        <NumberField
          label="Minimum speech ms"
          max={10000}
          min={50}
          onChange={(vadMinSpeechMs) => updateSettings({ vadMinSpeechMs })}
          value={settings.vadMinSpeechMs}
        />
        <NumberField
          label="Maximum speech ms"
          max={120000}
          min={500}
          onChange={(vadMaxSpeechMs) => updateSettings({ vadMaxSpeechMs })}
          value={settings.vadMaxSpeechMs}
        />
      </div>

      <div className="control-group">
        <div className="control-label">Replies And Control</div>
        <div className="setting-row">
          <span>Post reply text in voice chat</span>
          <Toggle
            checked={settings.sendReplyText}
            onChange={(sendReplyText) => updateSettings({ sendReplyText })}
          />
        </div>
        <label className="setting-row">
          <span>Interruption policy</span>
          <select
            className="input-tech compact-input"
            onChange={(event) =>
              updateSettings({
                interruptionPolicy: event.target.value as DiscordSettings['interruptionPolicy'],
              })
            }
            value={settings.interruptionPolicy}
          >
            <option value="ignore">Ignore</option>
            <option value="stop-speaking">Stop speaking</option>
            <option value="barge-in">Barge in</option>
          </select>
        </label>
        <label className="control-label" htmlFor="discord-controller-ids">
          Trusted controller user IDs
        </label>
        <textarea
          className="textarea-tech discord-controller-ids"
          id="discord-controller-ids"
          onChange={(event) =>
            updateSettings({ trustedControllerUserIds: parseControllerIds(event.target.value) })
          }
          placeholder="One Discord user ID per line"
          spellCheck={false}
          value={settings.trustedControllerUserIds.join('\n')}
        />
      </div>
    </>
  );
}
