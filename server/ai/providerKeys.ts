import type { Request } from 'express';

export type ProviderKeys = {
  llmKey?: string;
  byokOpenAiKey?: string;
  ttsKey?: string;
};

function header(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  if (typeof value === 'string') {
    return value;
  }
  return Array.isArray(value) ? value[0] : undefined;
}

function nonEmptyEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

export function readFishTtsEnvKey(): string | undefined {
  return (
    nonEmptyEnv(process.env.FISH_AUDIO_API_KEY) ??
    nonEmptyEnv(process.env.FISH_SPEECH_API_KEY) ??
    nonEmptyEnv(process.env.FISHSPEECH_API_KEY)
  );
}

/**
 * Request-scoped provider keys (D1): the browser forwards keys via headers; the
 * backend may fall back to server-side env vars.
 */
export function readProviderKeys(req: Request): ProviderKeys {
  return {
    llmKey: header(req, 'x-yourwifey-llm-provider-key') ?? process.env.LLM_PROVIDER_KEY,
    byokOpenAiKey: header(req, 'x-yourwifey-openai-byok-key') ?? process.env.OPENAI_BYOK_KEY,
    ttsKey: header(req, 'x-yourwifey-tts-provider-key') ?? readFishTtsEnvKey(),
  };
}
