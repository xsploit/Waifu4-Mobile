import type { WordBoundary } from './piper';

const TIMING_TICKS_PER_SECOND = 10_000_000;
const DEFAULT_SECONDS_PER_WORD = 0.22;

export function createEstimatedSubtitleWordBoundaries(
  text: string,
  secondsPerWord = DEFAULT_SECONDS_PER_WORD,
): WordBoundary[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const safeSecondsPerWord = Math.max(0.08, secondsPerWord);

  return words.map((word, index) => ({
    duration: safeSecondsPerWord * TIMING_TICKS_PER_SECOND,
    offset: index * safeSecondsPerWord * TIMING_TICKS_PER_SECOND,
    word,
  }));
}

export function getPlaybackSubtitleLine(
  text: string,
  wordBoundaries: WordBoundary[],
  elapsedSeconds: number,
  wordWindow = 14,
) {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (wordBoundaries.length === 0) {
    return cleaned;
  }

  const elapsedTicks = Math.max(0, elapsedSeconds) * TIMING_TICKS_PER_SECOND;
  const nextWordIndex = wordBoundaries.findIndex((boundary) => elapsedTicks < boundary.offset);
  const visibleCount =
    nextWordIndex === -1 ? wordBoundaries.length : Math.max(1, nextWordIndex);
  const start = Math.max(0, visibleCount - Math.max(1, wordWindow));

  return wordBoundaries
    .slice(start, visibleCount)
    .map((boundary) => boundary.word)
    .join(' ')
    .trim() || cleaned;
}
