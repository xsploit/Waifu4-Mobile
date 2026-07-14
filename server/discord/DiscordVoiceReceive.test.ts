import { EventEmitter } from 'node:events';
import { PassThrough, Transform } from 'node:stream';
import { EndBehaviorType } from '@discordjs/voice';
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
  public readonly subscribeOptions = new Map<string, unknown>();
  public subscribeCalls = 0;

  public subscribe(userId: string, options?: unknown): PassThrough {
    this.subscribeCalls += 1;
    const stream = new PassThrough();
    this.streams.set(userId, stream);
    this.subscribeOptions.set(userId, options);
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
    expect(receiver.subscribeOptions.get('human')).toEqual({
      end: { behavior: EndBehaviorType.Manual },
    });
    human?.write(Buffer.concat([stereoFrame(12_000), stereoFrame(0), stereoFrame(0)]));
    expect(utterances).toHaveLength(1);
    expect(utterances[0]?.userId).toBe('human');
    expect(utterances[0]?.samples).toHaveLength(960);
    expect(utterances[0]?.samples[0]).toBe(12_000);

    receive.detach();
    expect(receive.subscriptionCount).toBe(0);
  });

  it('flushes voiced audio when Discord ends the stream without sending silence frames', async () => {
    const receiver = new TestReceiver();
    const utterances: number[] = [];
    const receive = new DiscordVoiceReceive(receiver, {
      createDecoder: () => new TestDecoder(),
      createVad: () => new VoiceActivityDetector({
        endSilenceMs: 850,
        maxUtteranceMs: 1_000,
        minSpeechMs: 20,
        sampleRate: 48_000,
        startThreshold: 0.02,
      }),
      getUser: (userId) => ({ bot: false, id: userId }),
      identity: { channelId: 'channel', guildId: 'guild' },
      isSelf: () => false,
      onUtterance: (_identity, utterance) => utterances.push(utterance.speechDurationMs),
    });

    receive.attach();
    receiver.speaking.emit('start', 'human');
    await new Promise((resolve) => setImmediate(resolve));
    receiver.streams.get('human')?.write(stereoFrame(12_000));
    receiver.streams.get('human')?.end();
    await new Promise((resolve) => setImmediate(resolve));

    expect(utterances).toEqual([20]);
    expect(receive.subscriptionCount).toBe(0);
    receive.detach();
  });

  it('drops a receive subscription that never yields decoded PCM', async () => {
    const receiver = new TestReceiver();
    const receive = new DiscordVoiceReceive(receiver, {
      createDecoder: () => new TestDecoder(),
      getUser: (userId) => ({ bot: false, id: userId }),
      identity: { channelId: 'channel', guildId: 'guild' },
      isSelf: () => false,
      onUtterance: () => {},
      receiveSilenceMs: 5,
    });

    receive.attach();
    receiver.speaking.emit('start', 'human');
    await new Promise((resolve) => setTimeout(resolve, 15));

    expect(receive.subscriptionCount).toBe(0);
    receive.detach();
  });

  it('reuses one receive stream across repeated utterances from the same speaker', async () => {
    const receiver = new TestReceiver();
    const utterances: number[] = [];
    const receive = new DiscordVoiceReceive(receiver, {
      createDecoder: () => new TestDecoder(),
      createVad: () => new VoiceActivityDetector({
        endSilenceMs: 500,
        maxUtteranceMs: 5_000,
        minSpeechMs: 20,
        sampleRate: 48_000,
        startThreshold: 0.02,
      }),
      getUser: (userId) => ({ bot: false, id: userId }),
      identity: { channelId: 'channel', guildId: 'guild' },
      isSelf: () => false,
      onUtterance: (_identity, utterance) => utterances.push(utterance.speechDurationMs),
      vad: { endSilenceMs: 5 },
    });

    receive.attach();
    receiver.speaking.emit('start', 'human');
    await new Promise((resolve) => setImmediate(resolve));
    const stream = receiver.streams.get('human');
    stream?.write(stereoFrame(12_000));
    receiver.speaking.emit('end', 'human');
    await new Promise((resolve) => setTimeout(resolve, 15));

    receiver.speaking.emit('start', 'human');
    stream?.write(stereoFrame(10_000));
    receiver.speaking.emit('end', 'human');
    await new Promise((resolve) => setTimeout(resolve, 15));

    expect(utterances).toEqual([20, 20]);
    expect(receiver.subscribeCalls).toBe(1);
    expect(receive.subscriptionCount).toBe(1);
    receive.detach();
  });

  it('keeps overlapping speakers in independent receive and VAD sessions', async () => {
    const receiver = new TestReceiver();
    const utterances: string[] = [];
    const receive = new DiscordVoiceReceive(receiver, {
      createDecoder: () => new TestDecoder(),
      createVad: () => new VoiceActivityDetector({
        endSilenceMs: 20,
        maxUtteranceMs: 1_000,
        minSpeechMs: 20,
        sampleRate: 48_000,
        startThreshold: 0.02,
      }),
      getUser: (userId) => ({ bot: false, displayName: userId.toUpperCase(), id: userId }),
      identity: { channelId: 'channel', guildId: 'guild' },
      isSelf: () => false,
      now: () => 100,
      onUtterance: (identity) => utterances.push(`${identity.userId}:${identity.displayName}`),
    });

    receive.attach();
    receiver.speaking.emit('start', 'alice');
    receiver.speaking.emit('start', 'bob');
    await new Promise((resolve) => setImmediate(resolve));
    expect(receive.subscriptionCount).toBe(2);

    receiver.streams.get('alice')?.write(Buffer.concat([stereoFrame(12_000), stereoFrame(0)]));
    receiver.streams.get('bob')?.write(Buffer.concat([stereoFrame(10_000), stereoFrame(0)]));
    expect(utterances).toEqual(['alice:ALICE', 'bob:BOB']);

    receive.detach();
    expect(receive.subscriptionCount).toBe(0);
  });
});
