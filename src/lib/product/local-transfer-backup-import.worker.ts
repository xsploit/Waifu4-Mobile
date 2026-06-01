import { base64ToBlob, parseLocalTransferBackup } from './local-transfer-backup';
import type { LocalTransferBackupImportResult } from './local-transfer-backup-import';

type WorkerRequestMessage = {
  file: File;
  id: string;
};

self.addEventListener('message', async (event: MessageEvent<WorkerRequestMessage>) => {
  const request = event.data;
  try {
    const backup = parseLocalTransferBackup(await request.file.text());
    const decodedSavedVrmModels: LocalTransferBackupImportResult['decodedSavedVrmModels'] =
      backup.savedVrmModels.map((model) => ({
        ...model,
        blob: base64ToBlob(model.dataBase64, model.type),
      }));

    self.postMessage({
      backup,
      decodedSavedVrmModels,
      id: request.id,
      ok: true,
    });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
      id: request.id,
      ok: false,
    });
  }
});
