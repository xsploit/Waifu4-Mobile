import { createWLipSyncNode, type Profile, type WLipSyncAudioNode } from 'wlipsync';
import { mapWLipSyncWeights, type MouthWeights } from './MouthWeights';
import type { AudioPlaybackTap } from '../tts/AudioPlayback';

export const DEFAULT_WLIPSYNC_PROFILE_URL = '/assets/lipsync-profile.json';

export type WLipSyncMouth = AudioPlaybackTap & {
  node: WLipSyncAudioNode;
  getMouthWeights(): MouthWeights;
  getVolume(): number;
};

export async function loadWLipSyncProfile(profileUrl = DEFAULT_WLIPSYNC_PROFILE_URL): Promise<Profile> {
  const res = await fetch(profileUrl);
  if (!res.ok) {
    throw new Error(`Failed to load WLipSync profile: HTTP ${res.status}`);
  }
  return (await res.json()) as Profile;
}

export async function createWLipSyncMouth(
  audioContext: AudioContext,
  profileUrl = DEFAULT_WLIPSYNC_PROFILE_URL,
): Promise<WLipSyncMouth> {
  const profile = await loadWLipSyncProfile(profileUrl);
  const node = await createWLipSyncNode(audioContext, profile);
  return {
    input: node,
    node,
    getMouthWeights: () => mapWLipSyncWeights(node.weights),
    getVolume: () => node.volume,
  };
}
