import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ProviderKind, ProviderSecretDescriptor } from '../../../lib/product/byok';
import { createBrowserProviderKeyVault } from '../../../lib/product/provider-key-vault';

type AccountTabProps = {
  localTransferStatus: string;
  onExportLocalBackup: () => void;
  onImportLocalBackup: (file: File) => void;
};

type LocalProviderKeyConfig = {
  keyName: string;
  label: string;
  provider: ProviderKind;
};

const LOCAL_PROVIDER_KEYS: LocalProviderKeyConfig[] = [
  { provider: 'openai', keyName: 'openai.apiKey', label: 'OpenAI Utility' },
  { provider: 'openrouter', keyName: 'openrouter.apiKey', label: 'OpenRouter' },
  { provider: 'custom', keyName: 'aiGateway.apiKey', label: 'Vercel AI Gateway' },
  { provider: 'fish_speech', keyName: 'fishSpeech.apiKey', label: 'Fish Speech' },
  { provider: 'inworld', keyName: 'inworld.apiKey', label: 'Inworld' },
  { provider: 'tavily', keyName: 'tavily.apiKey', label: 'Tavily' },
];

function findProviderDescriptor(
  descriptors: ProviderSecretDescriptor[],
  config: LocalProviderKeyConfig,
) {
  return descriptors.find(
    (descriptor) =>
      descriptor.provider === config.provider && descriptor.keyName === config.keyName,
  );
}

export function AccountTab({
  localTransferStatus,
  onExportLocalBackup,
  onImportLocalBackup,
}: AccountTabProps) {
  const mountedRef = useRef(true);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const providerVault = useMemo(
    () =>
      createBrowserProviderKeyVault({
        mode: 'local-indexeddb',
        workspaceId: 'local-browser',
      }),
    [],
  );
  const [providerInputs, setProviderInputs] = useState<Record<string, string>>({});
  const [providerDescriptors, setProviderDescriptors] = useState<ProviderSecretDescriptor[]>([]);
  const [providerStatus, setProviderStatus] = useState('Provider keys stay in this browser only.');

  const refreshProviderDescriptors = useCallback(async () => {
    const descriptors = await providerVault.listSecretDescriptors();
    if (mountedRef.current) {
      setProviderDescriptors(descriptors);
    }
  }, [providerVault]);

  useEffect(() => {
    mountedRef.current = true;
    void refreshProviderDescriptors();
    return () => {
      mountedRef.current = false;
    };
  }, [refreshProviderDescriptors]);

  async function handleSaveProviderKey(config: LocalProviderKeyConfig) {
    const secret = providerInputs[config.keyName]?.trim() ?? '';
    if (!secret) {
      setProviderStatus(`${config.label} key is empty.`);
      return;
    }

    try {
      const descriptor = await providerVault.setSecret({
        provider: config.provider,
        keyName: config.keyName,
        secret,
      });
      if (!mountedRef.current) {
        return;
      }
      setProviderInputs((previous) => ({ ...previous, [config.keyName]: '' }));
      setProviderStatus(`${config.label} saved as ${descriptor.redactedLabel}.`);
      await refreshProviderDescriptors();
    } catch (error) {
      if (mountedRef.current) {
        setProviderStatus(
          error instanceof Error ? error.message : `Could not save ${config.label} key.`,
        );
      }
    }
  }

  async function handleDeleteProviderKey(config: LocalProviderKeyConfig) {
    await providerVault.deleteSecret(config.provider, config.keyName);
    if (!mountedRef.current) {
      return;
    }
    setProviderInputs((previous) => ({ ...previous, [config.keyName]: '' }));
    setProviderStatus(`${config.label} key removed from this browser.`);
    await refreshProviderDescriptors();
  }

  return (
    <>
      <div className="control-group">
        <div className="control-label">Local Mode</div>
        <div className="status-grid">
          <div className="status-copy">
            Storage: <strong>IndexedDB + browser-local key storage</strong>
          </div>
          <div className="status-copy">
            Cloud sync: <strong>disabled</strong>
          </div>
          <div className="status-copy">
            Login: <strong>not required</strong>
          </div>
          <div className="status-copy">
            Provider keys: <strong>local only</strong>
          </div>
        </div>
        <div className="field-hint">
          Web Waifu 4 is a local streaming app. Settings, memories, saved VRMs, voices, and provider
          keys stay on this machine unless you export a backup JSON.
        </div>
      </div>

      <div className="control-group">
        <div className="control-label">Browser Provider Keys</div>
        <div className="field-hint">
          Main chat uses Vercel AI Gateway or OpenRouter. The OpenAI utility key is only for
          OpenAI-specific helpers such as Whisper/transcription and Gateway BYOK; provider keys are
          sent only to the local backend for the current request.
        </div>
        <div className="provider-key-list">
          {LOCAL_PROVIDER_KEYS.map((config) => {
            const descriptor = findProviderDescriptor(providerDescriptors, config);
            const inputValue = providerInputs[config.keyName] ?? '';
            return (
              <div className="provider-key-row" key={config.keyName}>
                <div className="provider-key-heading">
                  <span>{config.label}</span>
                  <strong>{descriptor?.redactedLabel ?? 'not set'}</strong>
                </div>
                <input
                  autoComplete="off"
                  className="input-tech"
                  onChange={(event) =>
                    setProviderInputs((previous) => ({
                      ...previous,
                      [config.keyName]: event.target.value,
                    }))
                  }
                  placeholder={`Paste ${config.label} key`}
                  spellCheck={false}
                  type="password"
                  value={inputValue}
                />
                <div className="btn-row provider-key-actions">
                  <button
                    className="btn-tech secondary"
                    disabled={!inputValue.trim()}
                    onClick={() => void handleSaveProviderKey(config)}
                    type="button"
                  >
                    Save Key
                  </button>
                  <button
                    className="btn-tech secondary"
                    disabled={!descriptor}
                    onClick={() => void handleDeleteProviderKey(config)}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="status-copy">{providerStatus}</div>
      </div>

      <div className="control-group">
        <div className="control-label">Local Transfer Backup</div>
        <div className="field-hint">
          Export a 1:1 JSON backup for another streaming PC. It includes local app settings,
          provider keys, chat and memory state, and saved custom VRM files.
        </div>
        <div className="btn-row">
          <button
            className="btn-tech secondary"
            onClick={() => void onExportLocalBackup()}
            type="button"
          >
            Export JSON Backup
          </button>
          <button
            className="btn-tech secondary"
            onClick={() => importInputRef.current?.click()}
            type="button"
          >
            Import JSON Backup
          </button>
        </div>
        <input
          ref={importInputRef}
          accept="application/json,.json"
          className="visually-hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) {
              void onImportLocalBackup(file);
            }
          }}
          type="file"
        />
        <div className="status-copy">{localTransferStatus}</div>
      </div>
    </>
  );
}
