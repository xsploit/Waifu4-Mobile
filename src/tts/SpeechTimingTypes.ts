export type SpeechTimingWord = {
  text: string;
  start: number;
  end: number;
};

export type SpeechTimingPhoneme = {
  wordIndex: number;
  phone: string;
  viseme: string;
  start: number;
  end: number;
};

export type SpeechTiming = {
  wordSource: 'provider';
  phonemeSource: 'derived';
  words: SpeechTimingWord[];
  phonemes: SpeechTimingPhoneme[];
};

export type SpeechTimingSummary = {
  timestampChunks: number;
  words: number;
  phonemes: number;
  visemes: number;
};

export const ZERO_SPEECH_TIMING_SUMMARY: SpeechTimingSummary = {
  timestampChunks: 0,
  words: 0,
  phonemes: 0,
  visemes: 0,
};

export function summarizeSpeechTiming(timing: SpeechTiming | undefined): SpeechTimingSummary {
  if (!timing || timing.words.length === 0) {
    return ZERO_SPEECH_TIMING_SUMMARY;
  }
  return {
    timestampChunks: 1,
    words: timing.words.length,
    phonemes: timing.phonemes.length,
    visemes: new Set(timing.phonemes.map((phone) => phone.viseme)).size,
  };
}
