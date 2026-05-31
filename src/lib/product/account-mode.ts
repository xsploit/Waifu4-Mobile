import type { ProductStorageMode, ProviderKeyMode } from './byok';

export type LocalAccountMode = {
  kind: 'local-only';
  loginAvailable: false;
  providerKeyMode: Extract<ProviderKeyMode, 'local-indexeddb'>;
  storageMode: Extract<ProductStorageMode, 'local-only'>;
  user: null;
};

export type ByokAccountMode = LocalAccountMode;

export const LOCAL_ACCOUNT_MODE: ByokAccountMode = {
  kind: 'local-only',
  loginAvailable: false,
  providerKeyMode: 'local-indexeddb',
  storageMode: 'local-only',
  user: null,
};
