import {
  createLocalTransferBackup,
  serializeLocalTransferBackup,
  type LocalTransferSavedVrmModel,
} from './local-transfer-backup';
import type { LocalTransferBackupExportInput } from './local-transfer-backup-export';

type WorkerRequestMessage = LocalTransferBackupExportInput & {
  id: string;
};

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

self.addEventListener('message', (event: MessageEvent<WorkerRequestMessage>) => {
  const request = event.data;
  try {
    const savedVrmModels: LocalTransferSavedVrmModel[] = request.savedVrmModels.map(
      ({ dataBuffer, ...model }) => ({
        ...model,
        dataBase64: arrayBufferToBase64(dataBuffer),
      }),
    );
    const backup = createLocalTransferBackup({
      providerSecrets: request.providerSecrets,
      savedVrmModels,
      state: request.state,
    });
    const blob = new Blob([serializeLocalTransferBackup(backup)], {
      type: 'application/json',
    });
    self.postMessage({
      blob,
      exportedAt: backup.exportedAt,
      id: request.id,
      ok: true,
      providerSecretCount: backup.providerSecrets.length,
      savedVrmModelCount: backup.savedVrmModels.length,
    });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
      id: request.id,
      ok: false,
    });
  }
});
