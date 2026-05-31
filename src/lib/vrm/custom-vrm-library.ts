import type { SavedVrmModelSummary } from '../menu/types';

const DB_NAME = 'yourwifey-vrm-library';
const DB_VERSION = 1;
const STORE_NAME = 'vrm-models';
const MAX_VRM_SIZE_BYTES = 250 * 1024 * 1024;

type StoredVrmModel = SavedVrmModelSummary & {
  blob: Blob;
};

export type SavedVrmModelImport = {
  blob: Blob;
  createdAt?: number;
  id?: string;
  name: string;
  originalFileName: string;
  type?: string;
  updatedAt?: number;
};

function createVrmModelId() {
  const suffix =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `custom-vrm-${suffix}`;
}

export function cleanVrmModelName(fileName: string) {
  const baseName = fileName.replace(/\.[^.]+$/u, '').trim();
  return (baseName || 'Custom VRM').slice(0, 80);
}

export function validateVrmFile(file: File) {
  const fileName = file.name.trim();
  if (!/\.vrm$/iu.test(fileName)) {
    throw new Error('Choose a .vrm file.');
  }
  if (file.size <= 0) {
    throw new Error('The selected VRM file is empty.');
  }
  if (file.size > MAX_VRM_SIZE_BYTES) {
    throw new Error('VRM file is too large for the browser library.');
  }
}

function summarizeModel(model: StoredVrmModel): SavedVrmModelSummary {
  const { blob: _blob, ...summary } = model;
  return summary;
}

function openVrmDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('Saved VRM library requires browser IndexedDB.'));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error ?? new Error('Could not open VRM library.'));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function runStoreRequest<T>(
  mode: IDBTransactionMode,
  runner: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openVrmDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, mode);
        const store = transaction.objectStore(STORE_NAME);
        const request = runner(store);

        request.onerror = () => reject(request.error ?? new Error('VRM library request failed.'));
        request.onsuccess = () => resolve(request.result);
        transaction.oncomplete = () => db.close();
        transaction.onerror = () => {
          db.close();
          reject(transaction.error ?? new Error('VRM library transaction failed.'));
        };
        transaction.onabort = () => {
          db.close();
          reject(transaction.error ?? new Error('VRM library transaction aborted.'));
        };
      }),
  );
}

export async function listSavedVrmModels(): Promise<SavedVrmModelSummary[]> {
  const models = await runStoreRequest<StoredVrmModel[]>('readonly', (store) => store.getAll());
  return models
    .map(summarizeModel)
    .sort((left, right) => right.updatedAt - left.updatedAt || left.name.localeCompare(right.name));
}

export async function saveVrmModelFile(file: File): Promise<SavedVrmModelSummary> {
  validateVrmFile(file);

  const now = Date.now();
  return saveVrmModelBlob({
    blob: file,
    createdAt: now,
    id: createVrmModelId(),
    name: cleanVrmModelName(file.name),
    originalFileName: file.name,
    type: file.type || 'model/vrm',
    updatedAt: now,
  });
}

export async function saveVrmModelBlob(input: SavedVrmModelImport): Promise<SavedVrmModelSummary> {
  if (!input.id && !/\.vrm$/iu.test(input.originalFileName.trim())) {
    throw new Error('Choose a .vrm file.');
  }
  if (!input.blob.size) {
    throw new Error('The selected VRM file is empty.');
  }
  if (input.blob.size > MAX_VRM_SIZE_BYTES) {
    throw new Error('VRM file is too large for the browser library.');
  }

  const now = Date.now();
  const originalFileName = input.originalFileName.trim() || 'custom.vrm';
  const model: StoredVrmModel = {
    blob: input.blob,
    createdAt: input.createdAt ?? now,
    id: input.id?.trim() || createVrmModelId(),
    name: input.name.trim().slice(0, 80) || cleanVrmModelName(originalFileName),
    originalFileName,
    size: input.blob.size,
    type: input.type || input.blob.type || 'model/vrm',
    updatedAt: input.updatedAt ?? now,
  };

  await runStoreRequest<IDBValidKey>('readwrite', (store) => store.put(model));
  return summarizeModel(model);
}

export async function getSavedVrmModelBlob(modelId: string): Promise<Blob> {
  const model = await runStoreRequest<StoredVrmModel | undefined>('readonly', (store) =>
    store.get(modelId),
  );
  if (!model?.blob) {
    throw new Error('Saved VRM model was not found.');
  }
  return model.blob;
}

export async function deleteSavedVrmModel(modelId: string): Promise<void> {
  await runStoreRequest<undefined>('readwrite', (store) => store.delete(modelId));
}
