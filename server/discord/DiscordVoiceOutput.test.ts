import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { DiscordVoiceOutput, type DiscordVoiceOutputChunk } from './DiscordVoiceOutput';

class TestPlayer extends EventEmitter {
  public readonly played: unknown[] = [];
  public throwOnPlay = false;

  public play(resource: unknown): void {
    if (this.throwOnPlay) throw new Error('player failed');
    this.played.push(resource);
  }

  public stop(): boolean { return true; }
}

function pcm16(samples: readonly number[]): Buffer {
  const pcm = Buffer.alloc(samples.length * Int16Array.BYTES_PER_ELEMENT);
  samples.forEach((sample, index) => pcm.writeInt16LE(sample, index * Int16Array.BYTES_PER_ELEMENT));
  return pcm;
}

function chunk(overrides: Partial<DiscordVoiceOutputChunk> = {}): DiscordVoiceOutputChunk {
  return {
    audio: pcm16([1]),
    chunkIndex: 0,
    sampleRate: 48_000,
    sessionId: 'session',
    utteranceId: 'utterance',
    ...overrides,
  };
}

async function read(stream: Readable): Promise<Buffer> {
  const buffers: Buffer[] = [];
  for await (const data of stream) buffers.push(Buffer.from(data));
  return Buffer.concat(buffers);
}

function flushOutputWork(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function createOutput(player = new TestPlayer()) {
  const streams: Readable[] = [];
  const output = new DiscordVoiceOutput({
    createPlayer: () => player as never,
    createResource: (stream) => {
      streams.push(stream);
      return {} as never;
    },
  });
  output.attach({ subscribe: () => ({ unsubscribe() {} }) } as never);
  return { output, player, streams };
}

describe('DiscordVoiceOutput', () => {
  it('starts playback from the first non-final PCM chunk and ends on the final chunk', async () => {
    const { output, player, streams } = createOutput();

    const first = output.tryEnqueue(chunk({ audio: pcm16([1, 2]), isFinal: false }));
    expect(typeof first).toBe('boolean');
    expect(first).toBe(true);
    expect(player.played).toHaveLength(0);
    await flushOutputWork();
    expect(player.played).toHaveLength(1);
    expect(streams).toHaveLength(1);

    expect(output.tryEnqueue(chunk({ audio: pcm16([3]), chunkIndex: 1, isFinal: true }))).toBe(true);
    await flushOutputWork();
    expect(await read(streams[0])).toEqual(pcm16([1, 1, 2, 2, 3, 3]));
  });

  it('preserves utterance order, deduplicates repeated chunks, and drops an out-of-order remainder', async () => {
    const { output, player, streams } = createOutput();
    expect(output.tryEnqueue(chunk({ audio: pcm16([1, 2]), isFinal: false }))).toBe(true);
    expect(output.tryEnqueue(chunk({ audio: pcm16([99]), isFinal: false }))).toBe(true);
    expect(output.tryEnqueue(chunk({ audio: pcm16([3]), chunkIndex: 1, isFinal: true }))).toBe(true);
    expect(output.tryEnqueue(chunk({ audio: pcm16([4]), isFinal: true, utteranceId: 'next' }))).toBe(true);
    await flushOutputWork();
    expect(player.played).toHaveLength(1);
    expect(await read(streams[0])).toEqual(pcm16([1, 1, 2, 2, 3, 3]));

    player.emit('stateChange', { status: 'playing' }, { status: 'idle' });
    expect(player.played).toHaveLength(2);
    expect(await read(streams[1])).toEqual(pcm16([4, 4]));

    expect(output.tryEnqueue(chunk({ audio: pcm16([5]), isFinal: false, utteranceId: 'bad' }))).toBe(true);
    expect(output.tryEnqueue(chunk({ audio: pcm16([6]), chunkIndex: 2, isFinal: false, utteranceId: 'bad' }))).toBe(true);
    await flushOutputWork();
    expect(output.tryEnqueue(chunk({ audio: pcm16([7]), chunkIndex: 3, isFinal: true, utteranceId: 'bad' }))).toBe(false);
  });

  it('keeps queued raw PCM at two seconds or less', () => {
    const { output } = createOutput();
    const twoSecondsPlusOneSample = Buffer.alloc((48_000 * 2 + 1) * Int16Array.BYTES_PER_ELEMENT);

    expect(output.tryEnqueue(chunk({ audio: twoSecondsPlusOneSample, isFinal: true }))).toBe(false);
    expect(output.tryEnqueue(chunk({ audio: Buffer.alloc(48_000 * Int16Array.BYTES_PER_ELEMENT), isFinal: false, utteranceId: 'accepted' }))).toBe(true);
    expect(output.tryEnqueue(chunk({ audio: Buffer.alloc(48_000 * 2 * Int16Array.BYTES_PER_ELEMENT), isFinal: true, utteranceId: 'overflow' }))).toBe(false);
  });

  it('rejects disconnected work and explicitly cancels an active utterance', async () => {
    const { output, player } = createOutput();
    expect(output.tryEnqueue(chunk({ isFinal: false }))).toBe(true);
    await flushOutputWork();
    expect(player.played).toHaveLength(1);

    expect(output.tryEnqueue(chunk({ audio: new Uint8Array(), cancel: true, chunkIndex: 1 }))).toBe(true);
    await flushOutputWork();
    output.detach();
    expect(output.tryEnqueue(chunk({ utteranceId: 'after-disconnect' }))).toBe(false);
  });

  it('isolates player failures and preserves 48 kHz and chunked 44.1 kHz conversion', async () => {
    const player = new TestPlayer();
    player.throwOnPlay = true;
    const errors: Error[] = [];
    const streams: Readable[] = [];
    const output = new DiscordVoiceOutput({
      createPlayer: () => player as never,
      createResource: (stream) => {
        streams.push(stream);
        return {} as never;
      },
      onError: (error) => errors.push(error),
    });
    output.attach({ subscribe: () => ({ unsubscribe() {} }) } as never);

    expect(output.tryEnqueue(chunk({ isFinal: true }))).toBe(true);
    await flushOutputWork();
    expect(errors).toHaveLength(1);
    player.throwOnPlay = false;
    expect(output.tryEnqueue(chunk({ audio: pcm16([-100, 100]), isFinal: true, utteranceId: '48' }))).toBe(true);
    await flushOutputWork();
    expect(await read(streams[1])).toEqual(pcm16([-100, -100, 100, 100]));

    const source = Array.from({ length: 441 }, (_, index) => index);
    expect(output.tryEnqueue(chunk({ audio: pcm16(source.slice(0, 220)), sampleRate: 44_100, utteranceId: '44', isFinal: false }))).toBe(true);
    expect(output.tryEnqueue(chunk({ audio: pcm16(source.slice(220)), chunkIndex: 1, sampleRate: 44_100, utteranceId: '44', isFinal: true }))).toBe(true);
    await flushOutputWork();
    const converted = await read(streams[2]);
    expect(converted).toHaveLength(480 * 2 * Int16Array.BYTES_PER_ELEMENT);
    expect(converted.readInt16LE(0)).toBe(0);
    expect(converted.readInt16LE(converted.length - Int16Array.BYTES_PER_ELEMENT)).toBe(440);
  });
});
