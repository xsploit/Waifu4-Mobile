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
        fishTransport: 'websocket',
        format: 'pcm',
        sampleRate: 44100,
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

  it('maps Fish timestamp SSE onto the backend HTTP timestamp stream schema', () => {
    expect(
      createRemoteTtsProxyRequest({
        provider: 'fish-speech',
        text: 'hello',
        streamingMode: 'full-response',
        voiceId: 'voice-1',
        modelId: 's2',
        fishTransport: 'timestamp-sse',
      }),
    ).toMatchObject({
      provider: 'fish',
      text: 'hello',
      voiceId: 'voice-1',
      backend: 's2-pro',
      fishTransport: 'timestamp-sse',
      format: 'pcm',
      sampleRate: 44100,
    });
  });

  it('keeps Fish s2.1-pro-free requests on the new backend id', () => {
    expect(
      createRemoteTtsProxyRequest({
        provider: 'fish-speech',
        text: 'hello',
        streamingMode: 'full-response',
        modelId: 's2.1-pro-free',
        fishTransport: 'timestamp-sse',
      }),
    ).toMatchObject({
      backend: 's2.1-pro-free',
      fishTransport: 'timestamp-sse',
    });
  });

  it('carries synth-once output routing identity to the backend', () => {
    expect(
      createRemoteTtsProxyRequest({
        outputMode: 'local+discord',
        provider: 'fish-speech',
        segmentIndex: 2,
        text: 'hello',
        ttsSessionId: 'session-1',
        utteranceId: 'utterance-1',
      }),
    ).toMatchObject({
      outputMode: 'local+discord',
      segmentIndex: 2,
      ttsSessionId: 'session-1',
      utteranceId: 'utterance-1',
    });
  });

  it('clamps Fish chunk length to the rebuilt backend range', () => {
    expect(
      createRemoteTtsProxyRequest({
        provider: 'fish-speech',
        text: 'hello',
        streamingMode: 'live-bridge',
        chunkLength: 50,
      }),
    ).toMatchObject({ chunkLength: 100 });

    expect(
      createRemoteTtsProxyRequest({
        provider: 'fish-speech',
        text: 'hello',
        streamingMode: 'live-bridge',
        chunkLength: 999.4,
      }),
    ).toMatchObject({ chunkLength: 300 });
  });

  it('maps copied Inworld frontend requests onto the rebuilt backend stream schema', () => {
    expect(
      createRemoteTtsProxyRequest({
        provider: 'inworld',
        text: 'hello',
        streamingMode: 'full-response',
        voiceId: 'Ashley',
        modelId: 'inworld-tts-2',
        inworldTransport: 'websocket',
        sampleRate: 48000,
        timestampType: 'WORD',
        timestampTransportStrategy: 'SYNC',
        deliveryMode: 'BALANCED',
        bufferCharThreshold: 90,
        maxBufferDelayMs: 250,
        autoMode: true,
      }),
    ).toEqual({
      provider: 'inworld',
      text: 'hello',
      voiceId: 'Ashley',
      inworldModelId: 'inworld-tts-2',
      inworldTransport: 'websocket',
      sampleRate: 48000,
      timestampType: 'WORD',
      timestampTransportStrategy: 'SYNC',
      deliveryMode: 'BALANCED',
      bufferCharThreshold: 90,
      maxBufferDelayMs: 250,
      autoMode: true,
    });
  });

  it('clamps Inworld buffering controls to the rebuilt backend range', () => {
    expect(
      createRemoteTtsProxyRequest({
        provider: 'inworld',
        text: 'hello',
        streamingMode: 'full-response',
        bufferCharThreshold: -50,
        maxBufferDelayMs: -1,
      }),
    ).toMatchObject({ bufferCharThreshold: 1, maxBufferDelayMs: 0 });

    expect(
      createRemoteTtsProxyRequest({
        provider: 'inworld',
        text: 'hello',
        streamingMode: 'full-response',
        bufferCharThreshold: 2000.6,
        maxBufferDelayMs: 20000.4,
      }),
    ).toMatchObject({ bufferCharThreshold: 1000, maxBufferDelayMs: 10000 });
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
