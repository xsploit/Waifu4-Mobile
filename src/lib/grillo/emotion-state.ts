export type CanonicalEmotion =
  | "happy"
  | "sad"
  | "angry"
  | "fear"
  | "disgust"
  | "surprised"
  | "neutral"
  | "relaxed";

export interface EmotionIntensities {
  happy: number;
  sad: number;
  angry: number;
  fear: number;
  disgust: number;
  surprised: number;
  neutral: number;
  relaxed: number;
}

const EMOTION_MAP: Record<string, CanonicalEmotion> = {
  happy: "happy",
  happiness: "happy",
  joy: "happy",
  excited: "happy",
  sad: "sad",
  sadness: "sad",
  depressed: "sad",
  angry: "angry",
  anger: "angry",
  mad: "angry",
  fear: "fear",
  afraid: "fear",
  anxious: "fear",
  anxiety: "fear",
  disgust: "disgust",
  disgusted: "disgust",
  grossed_out: "disgust",
  surprised: "surprised",
  surprise: "surprised",
  shocked: "surprised",
  neutral: "neutral",
  calm: "relaxed",
  relaxed: "relaxed",
};

export function emptyEmotionIntensities(): EmotionIntensities {
  return {
    happy: 0,
    sad: 0,
    angry: 0,
    fear: 0,
    disgust: 0,
    surprised: 0,
    neutral: 0,
    relaxed: 0,
  };
}

export function canonicalEmotionName(name: string): CanonicalEmotion {
  const normalized = String(name || "").toLowerCase().trim().replace(/\s+/g, "_");
  return EMOTION_MAP[normalized] || "neutral";
}
