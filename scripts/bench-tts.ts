import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildSpeechTiming, createSpeechTimingAccumulator } from '../server/tts/SpeechTiming';
import { streamFishTimestampTts, streamFishTts } from '../server/tts/FishTtsStream';
import { streamInworldTts } from '../server/tts/InworldTtsStream';
import { mapProviderSecrets } from '../src/shared/providerSecrets';
import type { TtsTimestampInfo } from '../src/tts/TtsClient';
import type { SpeechTiming } from '../src/tts/SpeechTimingTypes';

const DEFAULT_TEXT = 'The little star smiled, took one careful breath, and said hello to the morning.';
const ARTIFACT_DIR = join(process.cwd(), 'art', 'benchmarks');

type ProviderSecret = {
  keyName?: string;
  secret?: string;
};

type LocalBackup = {
  providerSecrets?: ProviderSecret[];
  state?: {
    aiSettings?: {
      fishSpeechVoiceId?: string;
      inworldVoiceId?: string;
      inworldModelId?: string;
      inworldDeliveryMode?: 'STABLE' | 'BALANCED' | 'CREATIVE' | 'EXPRESSIVE';
      inworldBufferCharThreshold?: number;
    };
  };
};

type Candidate = {
  id: string;
  label: string;
  run(signal: AbortSignal): Promise<RunResult>;
};

type RunResult = {
  firstAudioMs: number | null;
  totalMs: number;
  chunks: number;
  bytes: number;
  nativeWords: number;
  nativePhones: number;
  nativeVisemes: number;
  derivedWords: number;
  derivedPhones: number;
  derivedVisemes: number;
  timestampSamples: SpeechTiming[];
  error?: string;
};

type Row = RunResult & {
  id: string;
  label: string;
  round: number;
  ok: boolean;
};

type CapturedAudio = {
  chunks: number;
  bytes: number;
  timestamps: TtsTimestampInfo[];
};

async function loadBackup(): Promise<LocalBackup> {
  const backupPath = process.env.WEBWAIFU_LOCAL_BACKUP_PATH;
  if (!backupPath) {
    return {};
  }
  return JSON.parse(await readFile(backupPath, 'utf8')) as LocalBackup;
}

function splitSegments(text: string): string[] {
  return (
    text
      .trim()
      .match(/[^.!?,;:]+[.!?,;:]?\s*/g)
      ?.map((part) => part.trim())
      .filter(Boolean) ?? [text.trim()]
  );
}

function capture(): CapturedAudio {
  return { chunks: 0, bytes: 0, timestamps: [] };
}

function addAudio(captured: CapturedAudio, chunk: Uint8Array, timestamps?: TtsTimestampInfo): void {
  captured.chunks += 1;
  captured.bytes += chunk.byteLength;
  if (timestamps) {
    captured.timestamps.push(timestamps);
  }
}

function analyzeTimestamps(timestamps: TtsTimestampInfo[]) {
  const accumulator = createSpeechTimingAccumulator();
  const samples: SpeechTiming[] = [];
  for (const item of timestamps) {
    const timing = buildSpeechTiming(item);
    accumulator.add(timing, item);
    if (timing && samples.length < 12) {
      samples.push(timing);
    }
  }
  const summary = accumulator.summary();
  return {
    nativeWords: summary.nativeWords,
    nativePhones: summary.nativePhonemes,
    nativeVisemes: summary.nativeVisemes,
    derivedWords: summary.words,
    derivedPhones: summary.phonemes,
    derivedVisemes: summary.visemes,
    timestampSamples: samples,
  };
}

function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return run(controller.signal).finally(() => clearTimeout(timer));
}

function formatRow(label: string, rows: Row[]) {
  const ok = rows.filter((row) => row.ok);
  const avg = (values: number[]) =>
    values.length ? Math.round(values.reduce((total, value) => total + value, 0) / values.length) : null;
  return {
    label,
    rounds: rows.length,
    ok: ok.length,
    firstAudioMs: avg(ok.flatMap((row) => (row.firstAudioMs === null ? [] : [row.firstAudioMs]))),
    totalMs: avg(ok.map((row) => row.totalMs)),
    chunks: avg(ok.map((row) => row.chunks)),
    kb: avg(ok.map((row) => Math.round(row.bytes / 1024))),
    nativeWords: avg(ok.map((row) => row.nativeWords)),
    nativePhones: avg(ok.map((row) => row.nativePhones)),
    derivedPhones: avg(ok.map((row) => row.derivedPhones)),
    derivedVisemes: avg(ok.map((row) => row.derivedVisemes)),
  };
}

async function main() {
  const text = process.argv.slice(2).join(' ').trim() || DEFAULT_TEXT;
  const rounds = Number(process.env.WEBWAIFU_TTS_BENCH_ROUNDS ?? 2);
  const backup = await loadBackup();
  const secrets = mapProviderSecrets(backup.providerSecrets);
  const ai = backup.state?.aiSettings ?? {};
  const fishKey = process.env.FISH_AUDIO_API_KEY ?? process.env.FISHSPEECH_API_KEY ?? secrets['fishSpeech.apiKey'];
  const inworldKey = process.env.INWORLD_API_KEY ?? secrets['inworld.apiKey'];
  const fishVoiceId = ai.fishSpeechVoiceId;
  const inworldVoiceId = ai.inworldVoiceId || 'Ashley';
  const inworldModelId = ai.inworldModelId || 'inworld-tts-2';

  const candidates: Candidate[] = [];
  if (fishKey) {
    candidates.push(
      {
        id: 'fish-realtime-ws',
        label: 'Fish realtime WS',
        async run(signal) {
          const captured = capture();
          const stats = await streamFishTts(
            {
              apiKey: fishKey,
              text,
              textSegments: splitSegments(text),
              voiceId: fishVoiceId,
              backend: 's2.1-pro-free',
              format: 'pcm',
              sampleRate: 44100,
              chunkLength: 200,
              latency: 'balanced',
              conditionOnPreviousChunks: true,
              signal,
            },
            (chunk) => addAudio(captured, chunk),
          );
          return {
            firstAudioMs: stats.firstAudioMs,
            totalMs: stats.totalMs,
            chunks: captured.chunks,
            bytes: captured.bytes,
            nativeWords: 0,
            nativePhones: 0,
            nativeVisemes: 0,
            derivedWords: 0,
            derivedPhones: 0,
            derivedVisemes: 0,
            timestampSamples: [],
          };
        },
      },
      {
        id: 'fish-timestamp-sse',
        label: 'Fish timestamp SSE',
        async run(signal) {
          const captured = capture();
          const stats = await streamFishTimestampTts(
            {
              apiKey: fishKey,
              text,
              voiceId: fishVoiceId,
              backend: 's2.1-pro-free',
              format: 'pcm',
              sampleRate: 44100,
              chunkLength: 200,
              latency: 'balanced',
              conditionOnPreviousChunks: true,
              signal,
            },
            (chunk, meta) => addAudio(captured, chunk, meta.timestamps),
          );
          const timing = analyzeTimestamps(captured.timestamps);
          return {
            firstAudioMs: stats.firstAudioMs,
            totalMs: stats.totalMs,
            chunks: captured.chunks,
            bytes: captured.bytes,
            ...timing,
          };
        },
      },
    );
  }

  if (inworldKey) {
    candidates.push(
      {
        id: 'inworld-http',
        label: 'Inworld HTTP',
        async run(signal) {
          const captured = capture();
          const stats = await streamInworldTts(
            {
              apiKey: inworldKey,
              text,
              voiceId: inworldVoiceId,
              modelId: inworldModelId,
              transport: 'http',
              sampleRate: 48000,
              timestampType: 'WORD',
              timestampTransportStrategy: 'SYNC',
              deliveryMode: ai.inworldDeliveryMode ?? 'BALANCED',
              bufferCharThreshold: ai.inworldBufferCharThreshold ?? 120,
              autoMode: true,
              signal,
            },
            (chunk, meta) => addAudio(captured, chunk, meta.timestamps),
          );
          const timing = analyzeTimestamps(captured.timestamps);
          return {
            firstAudioMs: stats.firstAudioMs,
            totalMs: stats.totalMs,
            chunks: captured.chunks,
            bytes: captured.bytes,
            ...timing,
            nativeWords: timing.nativeWords || stats.words,
            nativePhones: timing.nativePhones || stats.phonemes,
            nativeVisemes: timing.nativeVisemes || stats.visemes,
          };
        },
      },
      {
        id: 'inworld-websocket',
        label: 'Inworld WebSocket',
        async run(signal) {
          const captured = capture();
          const stats = await streamInworldTts(
            {
              apiKey: inworldKey,
              text,
              voiceId: inworldVoiceId,
              modelId: inworldModelId,
              transport: 'websocket',
              sampleRate: 48000,
              timestampType: 'WORD',
              timestampTransportStrategy: 'SYNC',
              deliveryMode: ai.inworldDeliveryMode ?? 'BALANCED',
              bufferCharThreshold: ai.inworldBufferCharThreshold ?? 120,
              autoMode: true,
              signal,
            },
            (chunk, meta) => addAudio(captured, chunk, meta.timestamps),
          );
          const timing = analyzeTimestamps(captured.timestamps);
          return {
            firstAudioMs: stats.firstAudioMs,
            totalMs: stats.totalMs,
            chunks: captured.chunks,
            bytes: captured.bytes,
            ...timing,
            nativeWords: timing.nativeWords || stats.words,
            nativePhones: timing.nativePhones || stats.phonemes,
            nativeVisemes: timing.nativeVisemes || stats.visemes,
          };
        },
      },
    );
  }

  if (!candidates.length) {
    throw new Error('No Fish or Inworld TTS key found in env/local backup');
  }

  const rows: Row[] = [];
  for (let round = 1; round <= rounds; round += 1) {
    for (const candidate of candidates) {
      const started = Date.now();
      try {
        const result = await withTimeout(60_000, (signal) => candidate.run(signal));
        rows.push({ id: candidate.id, label: candidate.label, round, ok: true, ...result });
      } catch (err) {
        rows.push({
          id: candidate.id,
          label: candidate.label,
          round,
          ok: false,
          firstAudioMs: null,
          totalMs: Date.now() - started,
          chunks: 0,
          bytes: 0,
          nativeWords: 0,
          nativePhones: 0,
          nativeVisemes: 0,
          derivedWords: 0,
          derivedPhones: 0,
          derivedVisemes: 0,
          timestampSamples: [],
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  const summary = [...new Set(rows.map((row) => row.label))].map((label) =>
    formatRow(
      label,
      rows.filter((row) => row.label === label),
    ),
  );
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const jsonPath = join(ARTIFACT_DIR, `tts-benchmark-${timestamp}.json`);
  const mdPath = join(ARTIFACT_DIR, `tts-benchmark-${timestamp}.md`);
  const payload = { text, rounds, generatedAt: new Date().toISOString(), summary, rows };
  await writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await writeFile(mdPath, toMarkdown(payload), 'utf8');
  console.log(`wrote ${mdPath}`);
  console.log(`wrote ${jsonPath}`);
}

function toMarkdown(payload: {
  text: string;
  rounds: number;
  generatedAt: string;
  summary: ReturnType<typeof formatRow>[];
  rows: Row[];
}): string {
  const table = [
    '| voice | ok/rounds | first ms | net ms | chunks | KB | native words | native phones | derived phones | derived visemes |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...payload.summary.map(
      (row) =>
        `| ${row.label} | ${row.ok}/${row.rounds} | ${row.firstAudioMs ?? 'n/a'} | ${row.totalMs ?? 'n/a'} | ${row.chunks ?? 'n/a'} | ${row.kb ?? 'n/a'} | ${row.nativeWords ?? 'n/a'} | ${row.nativePhones ?? 'n/a'} | ${row.derivedPhones ?? 'n/a'} | ${row.derivedVisemes ?? 'n/a'} |`,
    ),
  ].join('\n');
  return [
    '# WebWaifu TTS CLI benchmark',
    '',
    `Generated: ${payload.generatedAt}`,
    `Text: ${payload.text}`,
    `Rounds: ${payload.rounds}`,
    '',
    table,
    '',
    '## Samples',
    '',
    '```json',
    JSON.stringify(
      payload.rows
        .filter((row) => row.timestampSamples.length)
        .map((row) => ({
          id: row.id,
          label: row.label,
          round: row.round,
          samples: row.timestampSamples.slice(0, 6),
        })),
      null,
      2,
    ),
    '```',
    '',
    '## Raw',
    '',
    '```json',
    JSON.stringify(payload.rows, null, 2),
    '```',
    '',
  ].join('\n');
}

void main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
