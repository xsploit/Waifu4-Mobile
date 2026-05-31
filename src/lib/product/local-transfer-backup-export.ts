import type { PersistedChatState } from '../chat/types';
import type { SavedVrmModelSummary } from '../menu/types';
import type { ProviderSecretRecord } from './provider-key-vault';

export type LocalTransferBackupExportVrmModel = SavedVrmModelSummary & {
  dataBuffer: ArrayBuffer;
};

export type LocalTransferBackupExportInput = {
  providerSecrets: ProviderSecretRecord[];
  savedVrmModels: LocalTransferBackupExportVrmModel[];
  state: PersistedChatState;
};

export type LocalTransferBackupExportResult = {
  blob: Blob;
  exportedAt: string;
  providerSecretCount: number;
  savedVrmModelCount: number;
};

type WorkerSuccessMessage = LocalTransferBackupExportResult & {
  id: string;
  ok: true;
};

type WorkerErrorMessage = {
  error: string;
  id: string;
  ok: false;
};

type WorkerResponseMessage = WorkerSuccessMessage | WorkerErrorMessage;

export function createLocalTransferBackupBlobInWorker(
  input: LocalTransferBackupExportInput,
): Promise<LocalTransferBackupExportResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./local-transfer-backup-export.worker.ts', import.meta.url), {
      name: 'local-transfer-backup-export',
      type: 'module',
    });
    const id =
      typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `local-transfer-export-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const cleanup = () => {
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
      worker.terminate();
    };
    const handleError = (event: ErrorEvent) => {
      cleanup();
      reject(event.error instanceof Error ? event.error : new Error(event.message));
    };
    const handleMessage = (event: MessageEvent<WorkerResponseMessage>) => {
      const message = event.data;
      if (!message || message.id !== id) {
        return;
      }
      cleanup();
      if (!message.ok) {
        reject(new Error(message.error));
        return;
      }
      resolve({
        blob: message.blob,
        exportedAt: message.exportedAt,
        providerSecretCount: message.providerSecretCount,
        savedVrmModelCount: message.savedVrmModelCount,
      });
    };

    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleError);
    worker.postMessage(
      {
        id,
        providerSecrets: input.providerSecrets,
        savedVrmModels: input.savedVrmModels,
        state: input.state,
      },
      input.savedVrmModels.map((model) => model.dataBuffer),
    );
  });
}
