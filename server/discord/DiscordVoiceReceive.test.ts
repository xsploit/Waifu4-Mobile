import { EventEmitter } from 'node:events';
import { PassThrough, Transform } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { DiscordVoiceReceive, type PcmDecoder } from './DiscordVoiceReceive';
import { VoiceActivityDetector } from './VoiceActivityDetector';

class TestDecoder extends Transform implements PcmDecoder {
  public _transform(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.push(chunk);
    callback();
  }
}

class TestReceiver {
  public readonly speaking = new EventEmitter();
  public readonly streams = new Map<string, PassThrough>();

  public subscribe(userId: string): PassThrough {
    const stream = new PassThrough();
    this.streams.set(userId, stream);
    return stream;
  }
}

function stereoFrame(value: number): Buffer {
  const frame = Buffer.alloc(960 * 2 * 2);
  for (let offset = 0; offset < frame.length; offset += 2) frame.writeInt16LE(value, offset);
  return frame;
}

describe('DiscordVoiceReceive', () => {
  it('creates one human subscription, converts 48k stereo PCM to mono 20ms frames, and tears down cleanly', async () => {
    const receiver = new TestReceiver();
    const utterances: Array<{ userId: string; samples: Int16Array }> = [];
    const receive = new DiscordVoiceReceive(receiver, {
      createDecoder: () => new TestDecoder(),
      createVad: () => new VoiceActivityDetector({
        endSilenceMs: 20,
        maxUtteranceMs: 1_000,
        minSpeechMs: 20,
        sampleRate: 48_000,
        startThreshold: 0.02,
      }),
      getUser: (userId) => ({ bot: userId === 'bot', id: userId }),
      identity: { channelId: 'channel', guildId: 'guild' },
      isSelf: (userId) => userId === 'self',
      now: () => 100,
      onUtterance: (identity, utterance) => utterances.push({ userId: identity.userId, samples: utterance.frames[0]?.samples ?? new Int16Array() }),
    });

    receive.attach();
    receiver.speaking.emit('start', 'human');
    receiver.speaking.emit('start', 'human');
    receiver.speaking.emit('start', 'self');
    receiver.speaking.emit('start', 'bot');
    await new Promise((resolve) => setImmediate(resolve));
    const human = receiver.streams.get('human');
    expect(receive.subscriptionCount).toBe(1);
    human?.write(Buffer.concat([stereoFrame(12_000), stereoFrame(0), stereoFrame(0)]));
    expect(utterances).toHaveLength(1);
    expect(utterances[0]?.userId).toBe('human');
    expect(utterances[0]?.samples).toHaveLength(960);
    expect(utterances[0]?.samples[0]).toBe(12_000);

    receive.detach();
    expect(receive.subscriptionCount).toBe(0);
  });
});
