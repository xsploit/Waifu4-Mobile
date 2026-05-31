export type AuthProvider = 'local';

export type DatabaseProvider = 'indexeddb';

export type AssetStorageProvider = 'indexeddb' | 'local-file';

export type ProductStorageMode = 'local-only';

export type ProviderKeyMode = 'local-indexeddb';

export type ProviderKind =
  | 'openai'
  | 'openrouter'
  | 'fish_speech'
  | 'inworld'
  | 'tavily'
  | 'custom';

export type SettingStorageClass =
  | 'public-overlay'
  | 'local-setting'
  | 'local-secret'
  | 'server-only';

export type ProductStackDecision = {
  authProvider: AuthProvider;
  databaseProvider: DatabaseProvider;
  assetStorageProvider: AssetStorageProvider;
  defaultStorageMode: ProductStorageMode;
  defaultProviderKeyMode: ProviderKeyMode;
  localOnlySupported: boolean;
  paymentsInScope: boolean;
};

export type ProviderSecretDescriptor = {
  id: string;
  workspaceId: string;
  provider: ProviderKind;
  keyName: string;
  mode: ProviderKeyMode;
  redactedLabel: string;
  createdAt: string;
  updatedAt: string;
};

export const PROVIDER_SECRET_ENV_NAMES: Record<ProviderKind, readonly string[]> = {
  openai: ['OPENAI_API_KEY'],
  openrouter: ['OPENROUTER_API_KEY'],
  fish_speech: ['FISH_AUDIO_API_KEY', 'FISH_SPEECH_API_KEY'],
  inworld: ['INWORLD_API_KEY'],
  tavily: ['TAVILY_API_KEY'],
  custom: [],
};

export const LOCAL_STACK_DECISION: ProductStackDecision = {
  authProvider: 'local',
  databaseProvider: 'indexeddb',
  assetStorageProvider: 'indexeddb',
  defaultStorageMode: 'local-only',
  defaultProviderKeyMode: 'local-indexeddb',
  localOnlySupported: true,
  paymentsInScope: false,
};

export const BYOK_STACK_DECISION = LOCAL_STACK_DECISION;

const LOCAL_SECRET_SETTING_KEYS = new Set([
  'openai.apikey',
  'openrouter.apikey',
  'aigateway.apikey',
  'fishspeech.apikey',
  'inworld.apikey',
  'tavily.apikey',
]);

const PUBLIC_OVERLAY_SETTING_KEYS = new Set([
  'scene.name',
  'scene.twitchchannel',
  'character.personaid',
  'character.vrmmodelid',
  'character.backgroundassetid',
  'visualsettings',
  'sequencersettings',
  'twitchsettings',
]);

const SERVER_ONLY_SETTING_KEYS = new Set(['overlay.signingsecret', 'database.url']);

export function classifyLocalSetting(key: string): SettingStorageClass {
  const canonical = canonicalizeSettingKey(key);
  if (SERVER_ONLY_SETTING_KEYS.has(canonical)) {
    return 'server-only';
  }
  if (LOCAL_SECRET_SETTING_KEYS.has(canonical)) {
    return 'local-secret';
  }
  if (PUBLIC_OVERLAY_SETTING_KEYS.has(canonical)) {
    return 'public-overlay';
  }
  return 'local-setting';
}

export const classifyByokSetting = classifyLocalSetting;

export function normalizeSettingKey(key: string) {
  return key.trim().replace(/\s+/g, '');
}

function canonicalizeSettingKey(key: string) {
  return normalizeSettingKey(key).toLowerCase();
}

export function normalizeTwitchChannelName(value: string) {
  return value.trim().toLowerCase().replace(/^#/, '');
}

export function isValidTwitchChannelName(value: string) {
  return /^[a-z0-9_]{1,25}$/.test(normalizeTwitchChannelName(value));
}

export function redactProviderSecret(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.length <= 10) {
    return `${trimmed.slice(0, 2)}...${trimmed.slice(-2)}`;
  }
  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
}

export function createProviderSecretDescriptor(input: {
  id: string;
  workspaceId: string;
  provider: ProviderKind;
  keyName: string;
  mode: ProviderKeyMode;
  secretPreview: string;
  createdAt: string;
  updatedAt?: string;
}): ProviderSecretDescriptor {
  return {
    id: input.id,
    workspaceId: input.workspaceId,
    provider: input.provider,
    keyName: normalizeSettingKey(input.keyName),
    mode: input.mode,
    redactedLabel: redactProviderSecret(input.secretPreview),
    createdAt: input.createdAt,
    updatedAt: input.updatedAt ?? input.createdAt,
  };
}
