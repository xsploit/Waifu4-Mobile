import { describe, expect, it } from 'vitest';
import { DiscordTranscriber, encodeMonoPcm16Wav, type DiscordVoiceIdentity } from './DiscordTranscriber';
import type { VoiceUtterance } from './VoiceActivityDetector';

const identity: DiscordVoiceIdentity = { channelId: 'c', guildId: 'g', userId: 'u' };
const utterance: VoiceUtterance = {
  endTimestampMs: 20,
  frames: [{ samples: new Int16Array([100, -100]), speakerId: 'u', timestampMs: 0 }],
  speakerId: 'u',
  speechDurationMs: 20,
  startTimestampMs: 0,
};

describe('DiscordTranscriber', () => {
  it('encodes completed mono PCM utterances as WAV', () => {
    const wav = Buffer.from(encodeMonoPcm16Wav(utterance, 48_000));
    expect(wav.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(wav.subarray(8, 12).toString('ascii')).toBe('WAVE');
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(24)).toBe(48_000);
    expect(wav.readInt16LE(44)).toBe(100);
    expect(wav.readInt16LE(46)).toBe(-100);
  });

  it('bounds queued work per user and preserves speaker identity in completion callbacks', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const completed: string[] = [];
    const dropped: string[] = [];
    const transcriber = new DiscordTranscriber({
      maxConcurrent: 1,
      maxQueuedPerUser: 1,
      maxQueuedUtterances: 2,
      onDropped: (item) => dropped.push(item.userId),
      onTranscript: (item) => { completed.push(`${item.identity.userId}:${item.text}`); },
      transcribe: async (_audio, item) => {
        await gate;
        return { model: 'test', text: item.userId };
      },
    });

    expect(transcriber.enqueue(identity, utterance)).toBe(true);
    expect(transcriber.enqueue({ ...identity, userId: 'u' }, utterance)).toBe(true);
    expect(transcriber.enqueue({ ...identity, userId: 'u' }, utterance)).toBe(false);
    expect(transcriber.enqueue({ ...identity, userId: 'v' }, utterance)).toBe(true);
    expect(transcriber.enqueue({ ...identity, userId: 'w' }, utterance)).toBe(false);

    release();
    await transcriber.drain();
    expect(completed).toEqual(['u:u', 'u:u', 'v:v']);
    expect(dropped).toEqual(['u', 'w']);
  });

  it('suppresses active completion and error callbacks after shutdown', async () => {
    let resolveTranscript!: (transcript: { model: string; text: string }) => void;
    let rejectTranscript!: (error: Error) => void;
    let call = 0;
    const completed: string[] = [];
    const errors: string[] = [];
    const transcriber = new DiscordTranscriber({
      maxConcurrent: 2,
      onError: (error) => errors.push(error.message),
      onTranscript: (item) => { completed.push(item.text); },
      transcribe: async () => new Promise((resolve, reject) => {
        if (call++ === 0) {
          resolveTranscript = resolve;
        } else {
          rejectTranscript = reject;
        }
      }),
    });

    expect(transcriber.enqueue(identity, utterance)).toBe(true);
    expect(transcriber.enqueue({ ...identity, userId: 'other' }, utterance)).toBe(true);
    transcriber.close();
    resolveTranscript({ model: 'test', text: 'late success' });
    rejectTranscript(new Error('late failure'));
    await transcriber.drain();

    expect(completed).toEqual([]);
    expect(errors).toEqual([]);
  });
});
