import {
  createProviderSecretDescriptor,
  normalizeSettingKey,
  type ProviderKind,
  type ProviderKeyMode,
  type ProviderSecretDescriptor,
} from './byok';

export type ProviderSecretRecord = ProviderSecretDescriptor & {
  secret: string;
};

export type ProviderKeyVaultStorage = {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
};

export type ProviderKeyVault = {
  deleteSecret(provider: ProviderKind, keyName: string): Promise<void>;
  exportSecrets(): Promise<ProviderSecretRecord[]>;
  getSecret(provider: ProviderKind, keyName: string): Promise<string | null>;
  importSecrets(records: ProviderSecretRecord[], now?: string): Promise<ProviderSecretDescriptor[]>;
  listSecretDescriptors(): Promise<ProviderSecretDescriptor[]>;
  setSecret(input: {
    provider: ProviderKind;
    keyName: string;
    secret: string;
    now?: string;
  }): Promise<ProviderSecretDescriptor>;
};

const STORAGE_PREFIX = 'yourwifey:byok-provider-keys:v1';
const INDEX_KEY = 'index';

export function createBrowserProviderKeyVault(input: {
  workspaceId: string;
  mode?: ProviderKeyMode;
  storage?: ProviderKeyVaultStorage | null;
}): ProviderKeyVault {
  const workspaceId = normalizeVaultPart(input.workspaceId);
  const mode = input.mode ?? 'local-indexeddb';
  const storage = input.storage ?? getLocalStorage();

  return {
    async deleteSecret(provider, keyName) {
      if (!storage) {
        return;
      }
      const id = buildSecretId(workspaceId, provider, keyName);
      storage.removeItem(buildRecordKey(id));
      writeIndex(
        storage,
        readIndex(storage).filter((item) => item !== id),
      );
    },

    async exportSecrets() {
      if (!storage) {
        return [];
      }
      return readWorkspaceIndex(storage, workspaceId)
        .map((id) => readSecretRecord(storage, id))
        .filter((record): record is ProviderSecretRecord => Boolean(record))
        .map((record) => ({ ...record }))
        .sort((a, b) => a.provider.localeCompare(b.provider) || a.keyName.localeCompare(b.keyName));
    },

    async getSecret(provider, keyName) {
      if (!storage) {
        return null;
      }
      const record = readSecretRecord(storage, buildSecretId(workspaceId, provider, keyName));
      return record?.secret ?? null;
    },

    async importSecrets(records, now) {
      const descriptors: ProviderSecretDescriptor[] = [];
      for (const record of records) {
        descriptors.push(
          await this.setSecret({
            provider: normalizeProviderKind(record.provider),
            keyName: record.keyName,
            secret: record.secret,
            now: now || record.updatedAt || undefined,
          }),
        );
      }
      return descriptors;
    },

    async listSecretDescriptors() {
      if (!storage) {
        return [];
      }
      return readWorkspaceIndex(storage, workspaceId)
        .map((id) => readSecretRecord(storage, id))
        .filter((record): record is ProviderSecretRecord => Boolean(record))
        .map(stripSecret)
        .sort((a, b) => a.provider.localeCompare(b.provider) || a.keyName.localeCompare(b.keyName));
    },

    async setSecret({ provider, keyName, now, secret }) {
      if (!storage) {
        throw new Error('Provider key vault storage is not available in this environment.');
      }

      const trimmedSecret = secret.trim();
      if (!trimmedSecret) {
        throw new Error('Provider secret cannot be empty.');
      }

      const createdAt = now ?? new Date().toISOString();
      const normalizedKeyName = normalizeSettingKey(keyName);
      const id = buildSecretId(workspaceId, provider, normalizedKeyName);
      const previous = readSecretRecord(storage, id);
      const descriptor = createProviderSecretDescriptor({
        id,
        workspaceId,
        provider,
        keyName: normalizedKeyName,
        mode,
        secretPreview: trimmedSecret,
        createdAt: previous?.createdAt ?? createdAt,
        updatedAt: createdAt,
      });
      const record: ProviderSecretRecord = {
        ...descriptor,
        secret: trimmedSecret,
      };

      storage.setItem(buildRecordKey(id), JSON.stringify(record));
      writeIndex(storage, Array.from(new Set([...readIndex(storage), id])));
      return stripSecret(record);
    },
  };
}

function normalizeProviderKind(provider: unknown): ProviderKind {
  switch (provider) {
    case 'openai':
    case 'openrouter':
    case 'fish_speech':
    case 'inworld':
    case 'tavily':
    case 'custom':
      return provider;
    default:
      return 'custom';
  }
}

export function exportProviderSecretDescriptorsForSync(
  descriptors: ProviderSecretDescriptor[],
): ProviderSecretDescriptor[] {
  return descriptors.map((descriptor) => ({ ...descriptor }));
}

function stripSecret(record: ProviderSecretRecord): ProviderSecretDescriptor {
  const { secret: _secret, ...descriptor } = record;
  return descriptor;
}

function readSecretRecord(
  storage: ProviderKeyVaultStorage,
  id: string,
): ProviderSecretRecord | null {
  try {
    const parsed = JSON.parse(storage.getItem(buildRecordKey(id)) ?? 'null') as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    const record = parsed as Partial<ProviderSecretRecord>;
    if (
      !record.id ||
      !record.workspaceId ||
      !record.provider ||
      !record.keyName ||
      !record.mode ||
      !record.secret
    ) {
      return null;
    }
    return {
      id: String(record.id),
      workspaceId: String(record.workspaceId),
      provider: record.provider,
      keyName: String(record.keyName),
      mode: record.mode,
      redactedLabel: String(record.redactedLabel ?? ''),
      createdAt: String(record.createdAt ?? ''),
      updatedAt: String(record.updatedAt ?? ''),
      secret: String(record.secret),
    };
  } catch {
    return null;
  }
}

function readIndex(storage: ProviderKeyVaultStorage) {
  try {
    const parsed = JSON.parse(storage.getItem(buildIndexKey()) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((item) => String(item)).filter(Boolean);
  } catch {
    return [];
  }
}

function readWorkspaceIndex(storage: ProviderKeyVaultStorage, workspaceId: string) {
  const prefix = `${workspaceId}:`;
  return readIndex(storage).filter((id) => id.startsWith(prefix));
}

function writeIndex(storage: ProviderKeyVaultStorage, ids: string[]) {
  storage.setItem(buildIndexKey(), JSON.stringify(Array.from(new Set(ids)).sort()));
}

function buildSecretId(workspaceId: string, provider: ProviderKind, keyName: string) {
  return [workspaceId, provider, normalizeVaultPart(keyName)].join(':');
}

function buildRecordKey(id: string) {
  return `${STORAGE_PREFIX}:record:${id}`;
}

function buildIndexKey() {
  return `${STORAGE_PREFIX}:${INDEX_KEY}`;
}

function normalizeVaultPart(value: string) {
  return normalizeSettingKey(value)
    .replace(/[^a-z0-9_.:-]+/gi, '-')
    .slice(0, 160);
}

function getLocalStorage(): ProviderKeyVaultStorage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
