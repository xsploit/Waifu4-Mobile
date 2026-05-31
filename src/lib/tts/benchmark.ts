import type { SpeechTiming, SpeechTimingSummary } from '../../tts/SpeechTimingTypes';
import { summarizeSpeechTiming, ZERO_SPEECH_TIMING_SUMMARY } from '../../tts/SpeechTimingTypes';

export type TtsBenchmarkTimingTotals = SpeechTimingSummary;

export type TtsBenchmarkResult = {
  id: string;
  label: string;
  round: number;
  ok: boolean;
  firstAudioMs: number | null;
  totalMs: number;
  playbackMs: number;
  chunks: number;
  bytes: number;
  timing: TtsBenchmarkTimingTotals;
  error?: string;
};

export type TtsBenchmarkSummaryRow = {
  label: string;
  rounds: number;
  firstAudioMs: number | null;
  totalMs: number | null;
  playbackMs: number | null;
  chunks: number | null;
  kb: number | null;
  words: number | null;
  phones: number | null;
};

export const DEFAULT_TTS_BENCHMARK_TEXT =
  'The little star smiled, took one careful breath, and said hello to the morning.';

export const ZERO_TTS_BENCHMARK_TIMING: TtsBenchmarkTimingTotals =
  ZERO_SPEECH_TIMING_SUMMARY;

type TimestampLike = {
  wordAlignment?: {
    words?: unknown[];
    phoneticDetails?: Array<{
      phones?: Array<{
        visemeSymbol?: string;
      }>;
    }>;
  };
  fishAlignment?: {
    segments?: unknown[];
  };
  words?: unknown[];
};

function average(values: number[]) {
  return values.length
    ? Math.round(values.reduce((total, value) => total + value, 0) / values.length)
    : null;
}

export function mergeTtsBenchmarkTiming(
  left: TtsBenchmarkTimingTotals,
  right: TtsBenchmarkTimingTotals,
): TtsBenchmarkTimingTotals {
  return {
    timestampChunks: left.timestampChunks + right.timestampChunks,
    words: left.words + right.words,
    phonemes: left.phonemes + right.phonemes,
    visemes: left.visemes + right.visemes,
  };
}

export function summarizeTtsBenchmarkTiming(
  timestamps: unknown,
  speechTiming?: unknown,
): TtsBenchmarkTimingTotals {
  const derived = summarizeSpeechTiming(speechTiming as SpeechTiming | undefined);
  if (derived.timestampChunks) {
    return derived;
  }

  if (!timestamps || typeof timestamps !== 'object') {
    return ZERO_TTS_BENCHMARK_TIMING;
  }

  const value = timestamps as TimestampLike;
  const words =
    value.wordAlignment?.words?.length ??
    value.words?.length ??
    value.fishAlignment?.segments?.length ??
    0;
  const phones =
    value.wordAlignment?.phoneticDetails?.reduce(
      (total, detail) => total + (detail.phones?.length ?? 0),
      0,
    ) ?? 0;
  const visemes = new Set(
    value.wordAlignment?.phoneticDetails?.flatMap((detail) =>
      (detail.phones ?? []).map((phone) => phone.visemeSymbol).filter(Boolean),
    ) ?? [],
  ).size;

  return {
    timestampChunks: words || phones || visemes ? 1 : 0,
    words,
    phonemes: phones,
    visemes,
  };
}

export function summarizeTtsBenchmarkResults(
  results: TtsBenchmarkResult[],
): TtsBenchmarkSummaryRow[] {
  const groups = new Map<string, TtsBenchmarkResult[]>();
  for (const result of results.filter((entry) => entry.ok)) {
    groups.set(result.label, [...(groups.get(result.label) ?? []), result]);
  }

  return [...groups.entries()].map(([label, rows]) => ({
    label,
    rounds: rows.length,
    firstAudioMs: average(rows.flatMap((row) => (row.firstAudioMs === null ? [] : [row.firstAudioMs]))),
    totalMs: average(rows.map((row) => row.totalMs)),
    playbackMs: average(rows.map((row) => row.playbackMs)),
    chunks: average(rows.map((row) => row.chunks)),
    kb: average(rows.map((row) => Math.round(row.bytes / 1024))),
    words: average(rows.map((row) => row.timing.words)),
    phones: average(rows.map((row) => row.timing.phonemes)),
  }));
}

export function formatTtsBenchmarkResults(text: string, results: TtsBenchmarkResult[]) {
  const summary = summarizeTtsBenchmarkResults(results);
  const table = [
    '| voice | rounds | first ms | net ms | play ms | chunks | KB | words | phones |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...summary.map(
      (row) =>
        `| ${row.label} | ${row.rounds} | ${row.firstAudioMs ?? 'n/a'} | ${row.totalMs ?? 'n/a'} | ${row.playbackMs ?? 'n/a'} | ${row.chunks ?? 'n/a'} | ${row.kb ?? 'n/a'} | ${row.words ?? 'n/a'} | ${row.phones ?? 'n/a'} |`,
    ),
  ].join('\n');

  return [
    '# WebWaifu TTS benchmark',
    '',
    `Text: ${text.trim()}`,
    '',
    table,
    '',
    '```json',
    JSON.stringify(results, null, 2),
    '```',
  ].join('\n');
}
