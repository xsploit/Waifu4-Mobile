import type { PersistedChatState } from '../chat/types';
import { normalizePersistedChatStateSnapshot } from '../chat/storage';
import type { SavedVrmModelSummary } from '../menu/types';
import type { ProviderSecretRecord } from './provider-key-vault';

export const LOCAL_TRANSFER_BACKUP_APP = 'web-waifu-4-local';
const LEGACY_LOCAL_TRANSFER_BACKUP_APPS = new Set(['yourwifey-local', 'yourwifey-byok']);
export const LOCAL_TRANSFER_BACKUP_KIND = 'local-transfer-backup';
export const LOCAL_TRANSFER_BACKUP_VERSION = 1;

export type LocalTransferSavedVrmModel = SavedVrmModelSummary & {
  dataBase64: string;
};

export type YourWifeyLocalTransferBackupV1 = {
  app: typeof LOCAL_TRANSFER_BACKUP_APP;
  exportedAt: string;
  formatVersion: typeof LOCAL_TRANSFER_BACKUP_VERSION;
  includes: {
    chatHistory: boolean;
    providerSecrets: boolean;
    relationshipMemory: boolean;
    savedVrmModels: boolean;
  };
  kind: typeof LOCAL_TRANSFER_BACKUP_KIND;
  providerSecrets: ProviderSecretRecord[];
  savedVrmModels: LocalTransferSavedVrmModel[];
  state: PersistedChatState;
};

export function createLocalTransferBackup(input: {
  exportedAt?: string;
  providerSecrets: ProviderSecretRecord[];
  savedVrmModels: LocalTransferSavedVrmModel[];
  state: PersistedChatState;
}): YourWifeyLocalTransferBackupV1 {
  return {
    app: LOCAL_TRANSFER_BACKUP_APP,
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    formatVersion: LOCAL_TRANSFER_BACKUP_VERSION,
    includes: {
      chatHistory: input.state.chatHistory.length > 0,
      providerSecrets: input.providerSecrets.length > 0,
      relationshipMemory:
        input.state.relationshipMemory.facts.length > 0 ||
        input.state.relationshipMemory.summary.trim().length > 0 ||
        Object.keys(input.state.relationshipMemories).length > 0,
      savedVrmModels: input.savedVrmModels.length > 0,
    },
    kind: LOCAL_TRANSFER_BACKUP_KIND,
    providerSecrets: input.providerSecrets.map((record) => ({ ...record })),
    savedVrmModels: input.savedVrmModels.map((model) => ({ ...model })),
    state: input.state,
  };
}

export function serializeLocalTransferBackup(backup: YourWifeyLocalTransferBackupV1) {
  return JSON.stringify(backup, null, 2);
}

export function parseLocalTransferBackup(value: string): YourWifeyLocalTransferBackupV1 {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Backup JSON must be an object.');
  }

  const backup = parsed as Partial<YourWifeyLocalTransferBackupV1>;
  if (
    (backup.app !== LOCAL_TRANSFER_BACKUP_APP &&
      !LEGACY_LOCAL_TRANSFER_BACKUP_APPS.has(String(backup.app ?? ''))) ||
    backup.kind !== LOCAL_TRANSFER_BACKUP_KIND ||
    backup.formatVersion !== LOCAL_TRANSFER_BACKUP_VERSION
  ) {
    throw new Error('Choose a Web Waifu 4 local transfer backup JSON file.');
  }
  if (!backup.state || typeof backup.state !== 'object') {
    throw new Error('Backup is missing app settings.');
  }

  return {
    app: LOCAL_TRANSFER_BACKUP_APP,
    exportedAt:
      typeof backup.exportedAt === 'string' && backup.exportedAt
        ? backup.exportedAt
        : new Date(0).toISOString(),
    formatVersion: LOCAL_TRANSFER_BACKUP_VERSION,
    includes: {
      chatHistory: Boolean(backup.includes?.chatHistory),
      providerSecrets: Boolean(backup.includes?.providerSecrets),
      relationshipMemory: Boolean(backup.includes?.relationshipMemory),
      savedVrmModels: Boolean(backup.includes?.savedVrmModels),
    },
    kind: LOCAL_TRANSFER_BACKUP_KIND,
    providerSecrets: Array.isArray(backup.providerSecrets)
      ? backup.providerSecrets
          .map(normalizeProviderSecretRecord)
          .filter((record): record is ProviderSecretRecord => Boolean(record))
      : [],
    savedVrmModels: Array.isArray(backup.savedVrmModels)
      ? backup.savedVrmModels
          .map(normalizeSavedVrmModel)
          .filter((model): model is LocalTransferSavedVrmModel => Boolean(model))
      : [],
    state: normalizePersistedChatStateSnapshot(backup.state),
  };
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

export function base64ToBlob(dataBase64: string, type = 'application/octet-stream'): Blob {
  const binary = atob(dataBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type });
}

function normalizeProviderSecretRecord(value: unknown): ProviderSecretRecord | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Partial<ProviderSecretRecord>;
  if (!record.provider || !record.keyName || !record.secret) {
    return null;
  }
  return {
    id: String(record.id ?? ''),
    workspaceId: String(record.workspaceId ?? ''),
    provider: record.provider,
    keyName: String(record.keyName),
    mode: 'local-indexeddb',
    redactedLabel: String(record.redactedLabel ?? ''),
    createdAt: String(record.createdAt ?? new Date().toISOString()),
    updatedAt: String(record.updatedAt ?? new Date().toISOString()),
    secret: String(record.secret),
  };
}

function normalizeSavedVrmModel(value: unknown): LocalTransferSavedVrmModel | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const model = value as Partial<LocalTransferSavedVrmModel>;
  if (!model.id || !model.name || !model.originalFileName || !model.dataBase64) {
    return null;
  }
  return {
    id: String(model.id),
    name: String(model.name),
    originalFileName: String(model.originalFileName),
    size: Number(model.size ?? 0),
    type: String(model.type ?? 'model/vrm'),
    createdAt: Number(model.createdAt ?? Date.now()),
    updatedAt: Number(model.updatedAt ?? Date.now()),
    dataBase64: String(model.dataBase64),
  };
}
