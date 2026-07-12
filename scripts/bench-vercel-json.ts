import { performance } from 'node:perf_hooks';
import { Output, streamText, wrapLanguageModel, extractJsonMiddleware } from 'ai';
import { createGateway } from '@ai-sdk/gateway';
import { assistantReplySchema } from '../src/brain/BrainTypes';

const apiKey = process.env['AI_GATEWAY_API_KEY']?.trim();
if (!apiKey) throw new Error('AI_GATEWAY_API_KEY is required');

const modelId = process.env['VERCEL_BENCH_MODEL']?.trim() || 'deepseek/deepseek-v4-flash';
const rounds = clampInt(process.env['VERCEL_BENCH_ROUNDS'], 1, 10, 3);
const providers = (process.env['VERCEL_BENCH_PROVIDERS'] || 'fireworks,deepinfra,deepseek,novita,azure')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const prompt = [
  'Reply to the user as a friendly anime AI companion.',
  'Return JSON with exactly these fields:',
  'message (string), emotion (string), face (string), valence (number -1..1),',
  'arousal (number 0..1), dominance (number -1..1), relationship_delta (object),',
  'memory_candidates (array), and nonce (string).',
  'User: Say hello in one short sentence.',
].join('\n');

type Mode = 'json-local-zod' | 'schema';
type Result = {
  provider: string;
  mode: Mode;
  round: number;
  ok: boolean;
  firstMs: number | null;
  totalMs: number;
  error?: string;
  message?: string;
  gatewayProvider?: string;
};

const results: Result[] = [];
for (let round = 1; round <= rounds; round += 1) {
  for (const provider of providers) {
    for (const mode of ['schema', 'json-local-zod'] as const) {
      results.push(await runCase(provider, mode, round));
    }
  }
}

console.log(`\nVercel JSON benchmark: ${modelId}`);
console.log(`Rounds: ${rounds}`);
console.log('| provider | mode | ok | first ms | total ms |');
console.log('| --- | --- | ---: | ---: | ---: |');
for (const provider of providers) {
  for (const mode of ['schema', 'json-local-zod'] as const) {
    const matches = results.filter((result) => result.provider === provider && result.mode === mode);
    const successes = matches.filter((result) => result.ok);
    console.log(
      `| ${provider} | ${mode} | ${successes.length}/${matches.length} | ${average(successes.map((result) => result.firstMs))} | ${average(successes.map((result) => result.totalMs))} |`,
    );
  }
}
console.log('\n```json');
console.log(JSON.stringify(results, null, 2));
console.log('```');

async function runCase(provider: string, mode: Mode, round: number): Promise<Result> {
  const started = performance.now();
  let firstMs: number | null = null;
  try {
    const gatewayModel = createGateway({ apiKey })(modelId);
    const model =
      mode === 'schema'
        ? wrapLanguageModel({ model: gatewayModel, middleware: extractJsonMiddleware() })
        : gatewayModel;
    const stream = streamText({
      model,
      prompt,
      maxOutputTokens: 350,
      output:
        mode === 'schema'
          ? Output.object({ name: 'assistant_reply', schema: assistantReplySchema })
          : Output.json({ name: 'assistant_reply' }),
      providerOptions: { gateway: { only: [provider] } },
    });
    let output: unknown;
    for await (const partial of stream.partialOutputStream) {
      firstMs ??= performance.now() - started;
      output = partial;
    }
    output = await stream.output;
    const parsed = assistantReplySchema.safeParse(output);
    if (!parsed.success) {
      throw new Error(`local Zod validation failed: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`);
    }
    const providerMetadata = await stream.providerMetadata;
    return {
      provider,
      mode,
      round,
      ok: true,
      firstMs: rounded(firstMs),
      totalMs: rounded(performance.now() - started) ?? 0,
      message: parsed.data.message,
      gatewayProvider: readGatewayProvider(providerMetadata),
    };
  } catch (error) {
    return {
      provider,
      mode,
      round,
      ok: false,
      firstMs: rounded(firstMs),
      totalMs: rounded(performance.now() - started) ?? 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function readGatewayProvider(value: unknown) {
  if (!value || typeof value !== 'object') return undefined;
  const gateway = (value as Record<string, unknown>)['gateway'];
  if (!gateway || typeof gateway !== 'object') return undefined;
  const record = gateway as Record<string, unknown>;
  for (const key of ['provider', 'providerName', 'providerId']) {
    if (typeof record[key] === 'string') return record[key] as string;
  }
  return undefined;
}

function rounded(value: number | null) {
  return value === null ? null : Math.round(value);
}

function average(values: Array<number | null>) {
  const numbers = values.filter((value): value is number => value !== null);
  return numbers.length > 0 ? Math.round(numbers.reduce((sum, value) => sum + value, 0) / numbers.length) : '-';
}

function clampInt(value: string | undefined, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.trunc(parsed))) : fallback;
}
