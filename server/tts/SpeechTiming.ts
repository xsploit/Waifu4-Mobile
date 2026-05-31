import { createRequire } from 'node:module';
import type { TtsTimestampInfo } from '../../src/tts/TtsClient';
import type { SpeechTiming, SpeechTimingPhoneme, SpeechTimingSummary, SpeechTimingWord } from '../../src/tts/SpeechTimingTypes';
import { ZERO_SPEECH_TIMING_SUMMARY } from '../../src/tts/SpeechTimingTypes';

const require = createRequire(import.meta.url);
const { toARPABET } = require('phonemize') as {
  toARPABET: (text: string, options?: { returnArray?: boolean }) => string | string[];
};

export type NativeTimingSummary = {
  nativeWords: number;
  nativePhonemes: number;
  nativeVisemes: number;
};

export function buildSpeechTiming(timestamps: TtsTimestampInfo | undefined): SpeechTiming | undefined {
  const words = extractWords(timestamps);
  if (!words.length) {
    return undefined;
  }
  return {
    wordSource: 'provider',
    phonemeSource: 'derived',
    words,
    phonemes: words.flatMap((word, wordIndex) => derivePhonemes(word, wordIndex)),
  };
}

export function summarizeNativeTiming(timestamps: TtsTimestampInfo | undefined): NativeTimingSummary {
  const wordAlignment = timestamps?.wordAlignment;
  const nativeWords = wordAlignment?.words?.length ?? 0;
  const nativePhonemes =
    wordAlignment?.phoneticDetails?.reduce(
      (total, detail) => total + (detail.phones?.length ?? 0),
      0,
    ) ?? 0;
  const nativeVisemes = new Set(
    wordAlignment?.phoneticDetails?.flatMap((detail) =>
      (detail.phones ?? []).map((phone) => phone.visemeSymbol).filter(Boolean),
    ) ?? [],
  ).size;
  return { nativeWords, nativePhonemes, nativeVisemes };
}

export function createSpeechTimingAccumulator() {
  const words = new Map<string, SpeechTimingWord>();
  const phonemes = new Map<string, SpeechTimingPhoneme>();
  const visemes = new Set<string>();
  let timestampChunks = 0;
  let nativeWords = 0;
  let nativePhonemes = 0;
  let nativeVisemes = 0;

  return {
    add(timing: SpeechTiming | undefined, timestamps: TtsTimestampInfo | undefined) {
      const native = summarizeNativeTiming(timestamps);
      nativeWords += native.nativeWords;
      nativePhonemes += native.nativePhonemes;
      nativeVisemes = Math.max(nativeVisemes, native.nativeVisemes);
      if (!timing || timing.words.length === 0) {
        return;
      }
      timestampChunks += 1;
      timing.words.forEach((word) => {
        words.set(wordKey(word), word);
      });
      timing.phonemes.forEach((phone) => {
        phonemes.set(phoneKey(timing.words[phone.wordIndex], phone), phone);
        visemes.add(phone.viseme);
      });
    },
    summary(): SpeechTimingSummary & NativeTimingSummary {
      if (!words.size) {
        return { ...ZERO_SPEECH_TIMING_SUMMARY, nativeWords, nativePhonemes, nativeVisemes };
      }
      return {
        timestampChunks,
        words: words.size,
        phonemes: phonemes.size,
        visemes: visemes.size,
        nativeWords,
        nativePhonemes,
        nativeVisemes,
      };
    },
  };
}

function extractWords(timestamps: TtsTimestampInfo | undefined): SpeechTimingWord[] {
  const words = timestamps?.wordAlignment?.words ?? [];
  const starts = timestamps?.wordAlignment?.wordStartTimeSeconds ?? [];
  const ends = timestamps?.wordAlignment?.wordEndTimeSeconds ?? [];
  return words.flatMap((text, index): SpeechTimingWord[] => {
    const start = starts[index];
    const end = ends[index];
    if (typeof start !== 'number' || typeof end !== 'number' || end < start) {
      return [];
    }
    return [{ text, start, end }];
  });
}

function normalizeWord(word: string): string {
  return word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

export function arpabetFor(word: string): string[] {
  const clean = normalizeWord(word);
  if (!clean) {
    return [];
  }
  const phones = toARPABET(clean, { returnArray: true });
  const parts = Array.isArray(phones) ? phones : [phones];
  return parts.flatMap((part) =>
    part
      .split(/\s+/)
      .map((phone) => phone.trim())
      .filter(Boolean),
  );
}

export function visemeForPhone(phone: string): string {
  const base = phone.replace(/[0-9]/g, '').toUpperCase();
  if (['P', 'B', 'M', 'EM'].includes(base)) return 'closed';
  if (['F', 'V'].includes(base)) return 'fv';
  if (['UW', 'UH', 'W', 'OW', 'OY'].includes(base)) return 'ou';
  if (['IY', 'IH', 'Y'].includes(base)) return 'ih';
  if (['EH', 'EY', 'AE'].includes(base)) return 'ee';
  if (['AA', 'AH', 'AO', 'AW', 'AY', 'ER', 'AX', 'R', 'L', 'EL'].includes(base)) return 'aa';
  if (['CH', 'JH', 'SH', 'ZH'].includes(base)) return 'oh';
  return 'rest';
}

function derivePhonemes(word: SpeechTimingWord, wordIndex: number): SpeechTimingPhoneme[] {
  const phones = arpabetFor(word.text);
  const duration = Math.max(0, word.end - word.start);
  const phoneDuration = phones.length ? duration / phones.length : 0;
  return phones.map((phone, index) => ({
    wordIndex,
    phone,
    viseme: visemeForPhone(phone),
    start: Number((word.start + phoneDuration * index).toFixed(3)),
    end: Number((word.start + phoneDuration * (index + 1)).toFixed(3)),
  }));
}

function rounded(value: number): string {
  return value.toFixed(3);
}

function wordKey(word: SpeechTimingWord | undefined): string {
  return word ? `${word.text}|${rounded(word.start)}|${rounded(word.end)}` : 'missing';
}

function phoneKey(word: SpeechTimingWord | undefined, phone: SpeechTimingPhoneme): string {
  return `${wordKey(word)}|${phone.phone}|${rounded(phone.start)}|${rounded(phone.end)}`;
}
