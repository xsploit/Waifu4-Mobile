export type MobileMouthWeights = {
  A: number;
  I: number;
  U: number;
  E: number;
  O: number;
};

export type MobileFrequencyBands = {
  low: number;
  midLow: number;
  midHigh: number;
  high: number;
};

/**
 * VrmStage asks the browser TTS singleton for live analysis data. Android owns audio playback in
 * the hybrid app, so this drop-in singleton exposes the same read contract while the native bridge
 * supplies each analysis frame. No provider, WebSocket, or audio output is duplicated in WebView.
 */
export class TtsManager {
  currentAudio: HTMLAudioElement | null = null;
  audioContext: AudioContext | null = null;
  wordBoundaries: [] = [];
  currentPhonemes: string[] | null = null;
  wordBoundaryStartTime: number | null = null;

  private active = false;
  private amplitude = 0;
  private weights: MobileMouthWeights = { A: 0, I: 0, U: 0, E: 0, O: 0 };
  private bands: MobileFrequencyBands = { low: 0, midLow: 0, midHigh: 0, high: 0 };

  updateFrame(
    active: boolean,
    amplitude: number,
    weights: MobileMouthWeights,
    bands: MobileFrequencyBands,
  ) {
    this.active = active;
    this.amplitude = amplitude;
    this.weights = weights;
    this.bands = bands;
  }

  isPlaybackActive() {
    return this.active;
  }

  getAudioAmplitude() {
    return this.amplitude;
  }

  getLipSyncWeights() {
    return this.weights;
  }

  getFrequencyBands() {
    return this.bands;
  }
}

const instance = new TtsManager();

export function getTtsManager() {
  return instance;
}
