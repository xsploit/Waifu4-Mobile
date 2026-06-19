import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Request, Response } from 'express';
import { mapProviderSecrets } from '../src/shared/providerSecrets';

const DEFAULT_BACKUP_PATH = join(
  homedir(),
  'Downloads',
  'web-waifu-4-local-backup-2026-05-30T03-03-43.json',
);

type ProviderSecret = {
  keyName?: string;
  secret?: string;
};

type LocalBackup = {
  providerSecrets?: ProviderSecret[];
  state?: {
    aiSettings?: {
      llmProvider?: string;
      model?: string;
      fishSpeechVoiceId?: string;
      inworldVoiceId?: string;
      inworldModelId?: string;
      inworldDeliveryMode?: string;
      inworldBufferCharThreshold?: number;
      ttsProvider?: string;
      ttsAutoSpeak?: boolean;
    };
  };
};

export async function handleLocalBackupSettings(_req: Request, res: Response): Promise<void> {
  const backupPath = process.env.WEBWAIFU_LOCAL_BACKUP_PATH ?? DEFAULT_BACKUP_PATH;
  try {
    const backup = JSON.parse(await readFile(backupPath, 'utf8')) as LocalBackup;
    const secrets = mapProviderSecrets(backup.providerSecrets);
    const ai = backup.state?.aiSettings ?? {};
    const provider = ai.llmProvider === 'openrouter-responses' ? 'openrouter-responses' : 'vercel-gateway';
    res.json({
      provider,
      model: ai.model ?? '',
      llmKey: provider === 'openrouter-responses' ? secrets['openrouter.apiKey'] : secrets['aiGateway.apiKey'],
      byokOpenAiKey: secrets['openai.apiKey'] ?? '',
      ttsKey: secrets['fishSpeech.apiKey'] ?? '',
      fishVoiceId: ai.fishSpeechVoiceId ?? '',
      inworldKey: secrets['inworld.apiKey'] ?? '',
      inworldVoiceId: ai.inworldVoiceId ?? '',
      inworldModelId: ai.inworldModelId ?? 'inworld-tts-2',
      inworldDeliveryMode: ai.inworldDeliveryMode ?? 'BALANCED',
      inworldBufferCharThreshold: ai.inworldBufferCharThreshold ?? 120,
      ttsProvider: ai.ttsProvider ?? 'fish-speech',
      autoSpeak: ai.ttsAutoSpeak ?? true,
    });
  } catch (err) {
    res.status(404).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}
