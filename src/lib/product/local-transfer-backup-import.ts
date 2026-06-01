import type { YourWifeyLocalTransferBackupV1 } from './local-transfer-backup';

export type DecodedLocalTransferSavedVrmModel =
  YourWifeyLocalTransferBackupV1['savedVrmModels'][number] & {
    blob: Blob;
  };

export type LocalTransferBackupImportResult = {
  backup: YourWifeyLocalTransferBackupV1;
  decodedSavedVrmModels: DecodedLocalTransferSavedVrmModel[];
};

type WorkerSuccessMessage = LocalTransferBackupImportResult & {
  id: string;
  ok: true;
};

type WorkerErrorMessage = {
  error: string;
  id: string;
  ok: false;
};

type WorkerResponseMessage = WorkerSuccessMessage | WorkerErrorMessage;

type WorkerRequestMessage = {
  file: File;
  id: string;
};

export function parseLocalTransferBackupInWorker(
  file: File,
): Promise<LocalTransferBackupImportResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./local-transfer-backup-import.worker.ts', import.meta.url), {
      name: 'local-transfer-backup-import',
      type: 'module',
    });
    const id =
      typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `local-transfer-import-${Date.now()}-${Math.random().toString(36).slice(2)}`;

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
        backup: message.backup,
        decodedSavedVrmModels: message.decodedSavedVrmModels,
      });
    };

    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleError);
    worker.postMessage({ file, id } satisfies WorkerRequestMessage);
  });
}
