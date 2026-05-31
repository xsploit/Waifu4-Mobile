import type { VRM } from '@pixiv/three-vrm';
import type { TtsManager } from '../tts/manager';

export const PHONEME_TO_BLEND_SHAPE: Record<string, Record<string, number>> = {
  // Vowels
  'ə': { aa: 0.5, ih: 0.2 },
  'æ': { aa: 0.7 },
  a: { aa: 0.8 },
  'ɑ': { aa: 1.0 },
  'ɒ': { oh: 0.45, ou: 0.2 },
  'ɔ': { oh: 0.55, ou: 0.25 },
  o: { oh: 0.5, ou: 0.2 },
  'ʊ': { ou: 0.7 },
  u: { ou: 1.0 },
  'ʌ': { aa: 0.5, oh: 0.3 },
  'ɪ': { ih: 0.6 },
  i: { ee: 0.8, ih: 0.3 },
  e: { ee: 0.7, ih: 0.2 },
  'ɛ': { ee: 0.6, ih: 0.3 },
  'ɜ': { aa: 0.5, oh: 0.3 },
  'ɐ': { aa: 0.6 },
  // Consonants
  f: { ih: 0.3 },
  v: { ih: 0.3 },
  'θ': { ih: 0.4 },
  'ð': { ih: 0.4 },
  s: { ih: 0.4 },
  z: { ee: 0.4 },
  'ʃ': { ou: 0.4 },
  'ʒ': { ou: 0.4 },
  t: { ih: 0.3 },
  d: { ih: 0.3 },
  n: { ih: 0.3 },
  l: { ih: 0.3 },
  'ɹ': { ou: 0.4 },
  w: { ou: 0.6 },
  j: { ee: 0.4 },
  p: {},
  b: {},
  m: {},
  k: { aa: 0.4 },
  'ɡ': { aa: 0.4 },
  'ŋ': { aa: 0.3 },
  h: { aa: 0.2 },
  'ɾ': { ih: 0.3 },
  'tʃ': { ou: 0.4 },
  'dʒ': { ou: 0.4 },
};

let previousAa = 0;
let previousIh = 0;
let previousOu = 0;
let previousEe = 0;
let previousOh = 0;

const MOUTH_SMOOTHING = 0.44;
const MOUTH_CLOSE_SMOOTHING = 0.16;
const PHONEME_GAIN = 0.39;
const VISEME_DEADZONE = 0.045;
const CLOSE_GATE_START = 0.035;
const CLOSE_GATE_END = 0.16;

function clamp01(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

function smoothViseme(previous: number, target: number) {
  const smoothing = target < previous ? MOUTH_CLOSE_SMOOTHING : MOUTH_SMOOTHING;
  return previous + (target - previous) * (1 - smoothing);
}

function applyVisemeDeadzone(value: number) {
  if (value <= VISEME_DEADZONE) {
    return 0;
  }

  return clamp01((value - VISEME_DEADZONE) / (1 - VISEME_DEADZONE));
}

const phonemeCache = new Map<string, string[]>();

function getCleanPhonemes(raw: string) {
  let cached = phonemeCache.get(raw);
  if (!cached) {
    cached = raw
      .replace(/[ˈˌːˑ̯̩̆̃̀́̂̄]/g, '')
      .replace(/[,.!?]/g, '')
      .split('')
      .filter((character) => character.trim().length > 0);
    phonemeCache.set(raw, cached);
    if (phonemeCache.size > 500) {
      const first = phonemeCache.keys().next().value;
      if (first !== undefined) {
        phonemeCache.delete(first);
      }
    }
  }
  return cached;
}

export function updateLipSync(vrm: VRM | null, ttsManager: TtsManager) {
  if (!vrm || !vrm.expressionManager) {
    return;
  }

  const manager = vrm.expressionManager;
  const hasHtmlAudio = !!ttsManager.currentAudio;
  const isHtmlAudioActive = hasHtmlAudio
    ? !ttsManager.currentAudio?.paused && !ttsManager.currentAudio?.ended
    : false;
  const isPlaybackActive = isHtmlAudioActive || ttsManager.isPlaying;

  if (!isPlaybackActive) {
    manager.setValue('aa', 0);
    manager.setValue('ih', 0);
    manager.setValue('ou', 0);
    manager.setValue('ee', 0);
    manager.setValue('oh', 0);
    previousAa = previousIh = previousOu = previousEe = previousOh = 0;
    return;
  }

  const mfccWeights = ttsManager.getLipSyncWeights();
  const mfccEnergy = mfccWeights
    ? mfccWeights.A + mfccWeights.I + mfccWeights.U + mfccWeights.E + mfccWeights.O
    : 0;

  const audioAmplitude = ttsManager.getAudioAmplitude();
  const isAudioActive = audioAmplitude > 0.01 || mfccEnergy > 0.02;

  if (!isAudioActive) {
    manager.setValue('aa', 0);
    manager.setValue('ih', 0);
    manager.setValue('ou', 0);
    manager.setValue('ee', 0);
    manager.setValue('oh', 0);
    previousAa = previousIh = previousOu = previousEe = previousOh = 0;
    return;
  }

  const currentTime = isHtmlAudioActive
    ? ttsManager.currentAudio?.currentTime ?? 0
    : ttsManager.audioContext && ttsManager.wordBoundaryStartTime !== null
      ? Math.max(0, ttsManager.audioContext.currentTime - ttsManager.wordBoundaryStartTime)
      : 0;
  let targetAa = 0;
  let targetIh = 0;
  let targetOu = 0;
  let targetEe = 0;
  let targetOh = 0;
  const phonemeGain = PHONEME_GAIN;

  const hasValidTiming =
    ttsManager.wordBoundaries &&
    ttsManager.wordBoundaries.length > 1 &&
    ttsManager.wordBoundaries.some((wordBoundary, index) => {
      if (index === 0) {
        return false;
      }
      const previousOffset = ttsManager.wordBoundaries[index - 1]?.offset || 0;
      const currentOffset = wordBoundary.offset || 0;
      return currentOffset > previousOffset;
    });

  let currentWordBoundary: (typeof ttsManager.wordBoundaries)[0] | null = null;
  let wordIndex = -1;
  if (hasValidTiming) {
    for (let index = 0; index < ttsManager.wordBoundaries.length; index += 1) {
      const wordBoundary = ttsManager.wordBoundaries[index];
      if (!wordBoundary) {
        continue;
      }
      const wordStart = (wordBoundary.offset || 0) / 10000000;
      const wordEnd = wordStart + (wordBoundary.duration || 0) / 10000000;
      if (currentTime >= wordStart && currentTime <= wordEnd) {
        currentWordBoundary = wordBoundary;
        wordIndex = index;
        break;
      }
    }
  }

  let usedPhonemeMode = false;
  const useMfccMode = !!mfccWeights && mfccEnergy > 0.02;

  if (useMfccMode && mfccWeights) {
    const rawA = clamp01(mfccWeights.A);
    const rawI = clamp01(mfccWeights.I);
    const rawU = clamp01(mfccWeights.U);
    const rawE = clamp01(mfccWeights.E);
    const rawO = clamp01(mfccWeights.O);
    const rawTotal = rawA + rawI + rawU + rawE + rawO;
    const loudness = clamp01(rawTotal);
    const invTotal = rawTotal > 0.00001 ? 1 / rawTotal : 0;

    targetAa = rawA * invTotal * loudness * 1.45 * phonemeGain + audioAmplitude * 0.1;
    targetIh = rawI * invTotal * loudness * 1.2 * phonemeGain;
    targetOu = rawU * invTotal * loudness * 1.15 * phonemeGain;
    targetEe = rawE * invTotal * loudness * 1.25 * phonemeGain;

    const oEnergy = rawO * invTotal * loudness;
    const oCompressed = Math.pow(clamp01(oEnergy), 1.2);
    targetOh = oCompressed * 0.34 * phonemeGain;
    targetOu += oCompressed * 0.24;
    targetAa *= 1 - oCompressed * 0.16;

    const bands = ttsManager.getFrequencyBands();
    if (bands) {
      const { low, midLow, midHigh } = bands;
      const blend = 0.06;
      targetAa += low * audioAmplitude * blend;
      targetOh += (low * 0.16 + midLow * 0.1) * audioAmplitude * blend;
      targetIh += midLow * audioAmplitude * blend * 0.6;
      targetEe += midHigh * audioAmplitude * blend * 0.65;
      targetOu += (midHigh * 0.45 + low * 0.2) * audioAmplitude * blend * 0.65;
    }

    targetAa = Math.min(targetAa, 0.95);
    targetIh = Math.min(targetIh, 0.72);
    targetOu = Math.min(targetOu, 0.7);
    targetEe = Math.min(targetEe, 0.75);
    targetOh = Math.min(targetOh, 0.36);

    usedPhonemeMode = true;
  }

  if (!useMfccMode && hasValidTiming && currentWordBoundary && ttsManager.currentPhonemes) {
    let wordPhonemes = '';
    if (Array.isArray(ttsManager.currentPhonemes)) {
      if (wordIndex >= 0 && wordIndex < ttsManager.currentPhonemes.length) {
        wordPhonemes = ttsManager.currentPhonemes[wordIndex] || '';
      }
    }

    if (wordPhonemes) {
      const wordStart = (currentWordBoundary.offset || 0) / 10000000;
      const wordDuration = (currentWordBoundary.duration || 0) / 10000000;
      const timeInWord = Math.max(0, Math.min(1, (currentTime - wordStart) / wordDuration));
      const cleanPhonemes = getCleanPhonemes(wordPhonemes);

      if (cleanPhonemes.length > 0) {
        const acceleratedTime = Math.min(timeInWord * 1.5, 1.0);
        const phonemeIndex = Math.floor(acceleratedTime * cleanPhonemes.length);
        const currentPhoneme =
          cleanPhonemes[phonemeIndex] || cleanPhonemes[cleanPhonemes.length - 1] || '';

        let phonemeKey = currentPhoneme;
        if (phonemeIndex < cleanPhonemes.length - 1) {
          const nextPhoneme = cleanPhonemes[phonemeIndex + 1] || '';
          const twoCharacter = currentPhoneme + nextPhoneme;
          if (Object.prototype.hasOwnProperty.call(PHONEME_TO_BLEND_SHAPE, twoCharacter)) {
            phonemeKey = twoCharacter;
          }
        }

        const blendMap = PHONEME_TO_BLEND_SHAPE[phonemeKey] || {};
        targetAa = (blendMap['aa'] || 0) * phonemeGain;
        targetIh = (blendMap['ih'] || 0) * phonemeGain;
        targetOu = (blendMap['ou'] || 0) * phonemeGain;
        targetEe = (blendMap['ee'] || 0) * phonemeGain;
        targetOh = (blendMap['oh'] || 0) * phonemeGain;

        const hasMapping =
          targetAa > 0 || targetIh > 0 || targetOu > 0 || targetEe > 0 || targetOh > 0;

        if (hasMapping) {
          const effectiveAmplitude = Math.max(audioAmplitude, 0.22);
          const amplitudeMultiplier = Math.min(effectiveAmplitude * 1.7, 1.0);
          targetAa = Math.min(targetAa * amplitudeMultiplier + effectiveAmplitude * 0.24, 0.95);
          targetIh = Math.min(targetIh * amplitudeMultiplier + effectiveAmplitude * 0.15, 0.8);
          targetOu = Math.min(targetOu * amplitudeMultiplier + effectiveAmplitude * 0.15, 0.72);
          targetEe = Math.min(targetEe * amplitudeMultiplier + effectiveAmplitude * 0.15, 0.8);
          targetOh = Math.min(targetOh * amplitudeMultiplier + effectiveAmplitude * 0.1, 0.42);
          if (targetAa + targetIh + targetOu + targetEe + targetOh < 0.12) {
            targetAa = Math.max(targetAa, effectiveAmplitude * 0.3);
          }
          usedPhonemeMode = true;
        }
      }
    }
  }

  if (!usedPhonemeMode) {
    const bands = ttsManager.getFrequencyBands();

    if (bands) {
      const { low, midLow, midHigh, high } = bands;
      const total = low + midLow + midHigh + high;

      if (total > 0.05) {
        const normalizedLow = low / total;
        const normalizedMidLow = midLow / total;
        const normalizedMidHigh = midHigh / total;
        const normalizedHigh = high / total;

        targetAa = Math.min(normalizedLow * 1.4 * audioAmplitude * 2.0, 1.0);
        targetOh = Math.min(
          (normalizedLow * 0.35 + normalizedMidLow * 0.2) * audioAmplitude * 1.3,
          0.38,
        );
        targetIh = Math.min(
          (normalizedMidLow * 0.8 + normalizedHigh * 0.4) * audioAmplitude * 1.6,
          0.7,
        );
        targetEe = Math.min(normalizedMidHigh * 1.2 * audioAmplitude * 1.8, 0.7);
        targetOu = Math.min(
          (normalizedMidHigh * 0.62 + normalizedLow * 0.28) * audioAmplitude * 1.45 +
            targetOh * 0.28,
          0.68,
        );

        const cycle = Math.sin(currentTime * 4.2) * 0.5 + 0.5;
        if (cycle < 0.2) {
          targetAa *= 1.08;
        } else if (cycle < 0.4) {
          targetIh += audioAmplitude * 0.05;
        } else if (cycle < 0.6) {
          targetOu += audioAmplitude * 0.05;
        } else if (cycle < 0.8) {
          targetEe += audioAmplitude * 0.05;
        } else {
          targetOh += audioAmplitude * 0.03;
        }

        if (targetAa + targetIh + targetOu + targetEe + targetOh < 0.15) {
          targetAa = Math.max(audioAmplitude * 0.5, 0.15);
        }
      } else {
        targetAa = audioAmplitude * 0.3;
      }
    } else {
      targetAa = audioAmplitude * 0.8;
      targetIh = audioAmplitude * 0.15;
    }
  }

  if (targetOh > 0) {
    const softenedOh = Math.pow(clamp01(targetOh), 1.2);
    const maxOh = 0.3 + audioAmplitude * 0.14;
    targetOh = Math.min(softenedOh, maxOh);
    targetOu = Math.min(targetOu + targetOh * 0.34, 0.74);
    targetAa *= 1 - targetOh * 0.18;
    targetEe *= 1 - targetOh * 0.45;

    const roundTotal = targetOh + targetOu;
    const roundCap = 0.62 + audioAmplitude * 0.12;
    if (roundTotal > roundCap) {
      const scale = roundCap / roundTotal;
      targetOh *= scale;
      targetOu *= scale;
    }
  }

  const closeGateSource = Math.max(audioAmplitude, mfccEnergy * 0.72);
  const closeGate = clamp01((closeGateSource - CLOSE_GATE_START) / (CLOSE_GATE_END - CLOSE_GATE_START));
  targetAa *= closeGate;
  targetIh *= closeGate;
  targetOu *= closeGate;
  targetEe *= closeGate;
  targetOh *= closeGate;

  const smoothedAa = applyVisemeDeadzone(smoothViseme(previousAa, targetAa));
  const smoothedIh = applyVisemeDeadzone(smoothViseme(previousIh, targetIh));
  const smoothedOu = applyVisemeDeadzone(smoothViseme(previousOu, targetOu));
  const smoothedEe = applyVisemeDeadzone(smoothViseme(previousEe, targetEe));
  const smoothedOh = applyVisemeDeadzone(smoothViseme(previousOh, targetOh));

  manager.setValue('aa', Math.min(Math.max(smoothedAa, 0), 1.0));
  manager.setValue('ih', Math.min(Math.max(smoothedIh, 0), 1.0));
  manager.setValue('ou', Math.min(Math.max(smoothedOu, 0), 1.0));
  manager.setValue('ee', Math.min(Math.max(smoothedEe, 0), 1.0));
  manager.setValue('oh', Math.min(Math.max(smoothedOh, 0), 1.0));

  previousAa = smoothedAa;
  previousIh = smoothedIh;
  previousOu = smoothedOu;
  previousEe = smoothedEe;
  previousOh = smoothedOh;
}

export function resetLipSync(vrm: VRM | null) {
  if (!vrm?.expressionManager) {
    return;
  }

  vrm.expressionManager.setValue('aa', 0);
  vrm.expressionManager.setValue('ih', 0);
  vrm.expressionManager.setValue('ou', 0);
  vrm.expressionManager.setValue('ee', 0);
  vrm.expressionManager.setValue('oh', 0);
  previousAa = previousIh = previousOu = previousEe = previousOh = 0;
}
