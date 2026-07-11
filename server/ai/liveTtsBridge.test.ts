import { describe, expect, it } from 'vitest';
import { createLiveSpeechTextBridge, normalizeLiveTtsBridge } from './liveTtsBridge';

async function collect(stream: AsyncIterable<string>) {
  const chunks: string[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return chunks;
}

describe('live TTS bridge', () => {
  it('normalizes old frontend Fish live bridge settings for the rebuilt backend', () => {
    expect(
      normalizeLiveTtsBridge({
        provider: 'fish-speech',
        streamingMode: 'live-bridge',
        voiceId: 'voice-1',
        modelId: 's2',
        latency: 'balanced',
        conditionOnPreviousChunks: true,
        chunkLength: 160,
      }),
    ).toEqual({
      backend: 's2-pro',
      chunkingStrategy: undefined,
      chunkLength: 160,
      conditionOnPreviousChunks: true,
      latency: 'balanced',
      maxBufferChars: undefined,
      minBufferChars: undefined,
      softBufferChars: undefined,
      voiceId: 'voice-1',
    });
  });

  it('passes Fish s2.1-pro-free through the live bridge', () => {
    expect(
      normalizeLiveTtsBridge({
        provider: 'fish-speech',
        streamingMode: 'live-bridge',
        modelId: 's2.1-pro-free',
      }),
    ).toMatchObject({
      backend: 's2.1-pro-free',
    });
  });

  it('streams eager visible deltas without waiting for sentence segmentation', async () => {
    const bridge = createLiveSpeechTextBridge({ chunkingStrategy: 'eager' });
    const done = collect(bridge.stream);
    bridge.push('The little ');
    bridge.push('star smiled.');
    bridge.close();

    await expect(done).resolves.toEqual(['The little ', 'star smiled.']);
  });

  it('buffers default live bridge deltas to speakable phrase boundaries', async () => {
    const bridge = createLiveSpeechTextBridge();
    const done = collect(bridge.stream);
    bridge.push('The little ');
    bridge.push('star smiled warmly, ');
    bridge.push('then waved.');
    bridge.close();

    await expect(done).resolves.toEqual(['The little star smiled warmly, ', 'then waved. ']);
  });

  it('supports the Fish latency-test safe phrase chunker as an added mode', async () => {
    const bridge = createLiveSpeechTextBridge({ chunkingStrategy: 'safe-phrase' });
    const done = collect(bridge.stream);
    bridge.push('The little star smiled warmly, ');
    bridge.push('then took one careful breath before saying hello to the morning. ');
    bridge.push('She waited. ');
    bridge.close();

    await expect(done).resolves.toEqual([
      'The little star smiled warmly, then took one careful breath before saying hello to the morning. ',
      'She waited. ',
    ]);
  });
});
