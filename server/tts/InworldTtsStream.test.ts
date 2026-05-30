import { describe, expect, it } from 'vitest';
import { extractPcmFromWavOrRaw } from './InworldTtsStream';

function makeWav(pcm: Uint8Array, sampleRate: number): Uint8Array {
  const header = new Uint8Array(44);
  const view = new DataView(header.buffer);
  header.set([0x52, 0x49, 0x46, 0x46], 0);
  view.setUint32(4, 36 + pcm.length, true);
  header.set([0x57, 0x41, 0x56, 0x45], 8);
  header.set([0x66, 0x6d, 0x74, 0x20], 12);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  header.set([0x64, 0x61, 0x74, 0x61], 36);
  view.setUint32(40, pcm.length, true);
  const wav = new Uint8Array(header.length + pcm.length);
  wav.set(header);
  wav.set(pcm, header.length);
  return wav;
}

describe('Inworld TTS audio helpers', () => {
  it('strips a WAV header and keeps the encoded sample rate', () => {
    const pcm = new Uint8Array([1, 2, 3, 4]);
    const result = extractPcmFromWavOrRaw(makeWav(pcm, 22050), 48000);
    expect([...result.audio]).toEqual([1, 2, 3, 4]);
    expect(result.sampleRate).toBe(22050);
  });

  it('passes raw PCM through with the fallback sample rate', () => {
    const pcm = new Uint8Array([5, 6]);
    const result = extractPcmFromWavOrRaw(pcm, 48000);
    expect(result.audio).toBe(pcm);
    expect(result.sampleRate).toBe(48000);
  });
});
