import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ProviderKind, ProviderSecretDescriptor } from '../../../lib/product/byok';
import { createBrowserProviderKeyVault } from '../../../lib/product/provider-key-vault';

type AccountTabProps = {
  localTransferStatus: string;
  onExportLocalBackup: () => void;
  onImportLocalBackup: (file: File) => void;
};

type LocalProviderKeyConfig = {
  description: string;
  keyName: string;
  label: string;
  provider: ProviderKind;
};

const LOCAL_PROVIDER_KEYS: LocalProviderKeyConfig[] = [
  {
    provider: 'openai',
    keyName: 'openai.apiKey',
    label: 'OpenAI Utility',
    description: 'Optional Whisper transcription and Vercel Gateway BYOK helpers.',
  },
  {
    provider: 'openrouter',
    keyName: 'openrouter.apiKey',
    label: 'OpenRouter',
    description: 'Chat, model discovery, embeddings, and OpenRouter transcription.',
  },
  {
    provider: 'custom',
    keyName: 'aiGateway.apiKey',
    label: 'Vercel AI Gateway',
    description: 'Gateway chat, model routing, and supported transcription lanes.',
  },
  {
    provider: 'fish_speech',
    keyName: 'fishSpeech.apiKey',
    label: 'Fish Audio',
    description: 'Realtime TTS, Timestamp SSE, Voice Lab, and Fish transcription.',
  },
  {
    provider: 'inworld',
    keyName: 'inworld.apiKey',
    label: 'Inworld',
    description: 'Inworld TTS transports, voices, and Voice Lab operations.',
  },
  {
    provider: 'tavily',
    keyName: 'tavily.apiKey',
    label: 'Tavily',
    description: 'Web search requests made by enabled AI tools.',
  },
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
        <div className="control-label">Browser Workspace</div>
        <div className="status-grid">
          <div className="status-copy">
            App data: <strong>IndexedDB</strong>
          </div>
          <div className="status-copy">
            Provider keys: <strong>browser local</strong>
          </div>
          <div className="status-copy">
            WebWaifu account: <strong>not required</strong>
          </div>
          <div className="status-copy">
            Cloud sync: <strong>off</strong>
          </div>
        </div>
        <div className="field-hint">
          This tab manages access keys and portable app data. Settings, memories, chats, saved VRMs,
          voices, and credentials stay in this browser unless you export them.
        </div>
      </div>

      <div className="control-group">
        <div className="control-label">Provider Access</div>
        <div className="field-hint">
          Add only the services you use. A saved key is sent to the local backend only when a
          request needs that provider.
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
                <div className="provider-key-description">{config.description}</div>
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
        <div className="control-label">Transfer &amp; Backup</div>
        <div className="field-hint">
          Move the complete browser workspace to another PC or keep a restorable snapshot. The JSON
          includes settings, provider keys, scoped chats and memory, voices, and saved custom VRMs.
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
