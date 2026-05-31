/// <reference types="vite/client" />

interface Window {
  __yourwifeyAudio?: {
    getState: () => string;
    getStream: () => MediaStream | null;
    resume: () => Promise<string>;
  };
  __YOURWIFEY_AUDIO_STREAM__?: () => MediaStream | null;
}
