import { describe, expect, it } from 'vitest';
import {
  createRemoteTtsProxyRequest,
  parseRemoteTtsStreamEvent,
  remoteTtsStreamEventToAudioChunk,
} from './remote';

describe('remote TTS proxy compatibility', () => {
  it('maps copied Fish frontend requests onto the rebuilt backend stream schema', () => {
    expect(
      createRemoteTtsProxyRequest({
        provider: 'fish-speech',
        text: 'hello',
        streamingMode: 'live-bridge',
        voiceId: 'voice-1',
        modelId: 's2',
        latency: 'balanced',
        conditionOnPreviousChunks: true,
        chunkLength: 160,
      }),
    ).toEqual({
      provider: 'fish',
      text: 'hello',
      voiceId: 'voice-1',
      backend: 's2-pro',
      fishTransport: 'websocket',
      format: 'pcm',
      sampleRate: 44100,
      latency: 'balanced',
      conditionOnPreviousChunks: true,
      chunkLength: 160,
    });
  });

  it('maps copied Inworld frontend requests onto the rebuilt backend stream schema', () => {
    expect(
      createRemoteTtsProxyRequest({
        provider: 'inworld',
        text: 'hello',
        streamingMode: 'full-response',
        voiceId: 'Ashley',
        modelId: 'inworld-tts-2',
        deliveryMode: 'BALANCED',
        bufferCharThreshold: 90,
      }),
    ).toEqual({
      provider: 'inworld',
      text: 'hello',
      voiceId: 'Ashley',
      inworldModelId: 'inworld-tts-2',
      inworldTransport: 'http',
      deliveryMode: 'BALANCED',
      bufferCharThreshold: 90,
    });
  });

  it('decodes rebuilt backend audio events that send format instead of mimeType', async () => {
    const event = parseRemoteTtsStreamEvent(
      JSON.stringify({
        type: 'audio',
        audio: btoa(String.fromCharCode(1, 2, 3, 4)),
        format: 'pcm',
        sampleRate: 44100,
        timestamps: { words: ['hello'] },
      }),
    );
    const chunk = remoteTtsStreamEventToAudioChunk(event);

    expect(chunk?.mimeType).toBe('audio/pcm');
    expect(chunk?.sampleRate).toBe(44100);
    expect(chunk?.timestamps).toEqual({ words: ['hello'] });
    await expect(chunk?.audioBlob.arrayBuffer()).resolves.toHaveProperty('byteLength', 4);
  });
});
