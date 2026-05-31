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

  it('streams eager visible deltas without waiting for sentence segmentation', async () => {
    const bridge = createLiveSpeechTextBridge({ chunkingStrategy: 'eager' });
    const done = collect(bridge.stream);
    bridge.push('The little ');
    bridge.push('star smiled.');
    bridge.close();

    await expect(done).resolves.toEqual(['The little ', 'star smiled.']);
  });
});
