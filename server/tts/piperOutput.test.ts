import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { TtsOutputFanout } from './outputFanout';
import { extractMonoPcm16Wav, handlePiperOutput } from './piperOutput';

function createWav(
  audio: Uint8Array,
  sampleRate = 32_000,
  options: { bitDepth?: number; channels?: number } = {},
): Uint8Array {
  const channels = options.channels ?? 1;
  const bitDepth = options.bitDepth ?? 16;
  const bytesPerSample = bitDepth / 8;
  const header = new Uint8Array(44);
  const view = new DataView(header.buffer);
  header.set([0x52, 0x49, 0x46, 0x46], 0);
  view.setUint32(4, 36 + audio.length, true);
  header.set([0x57, 0x41, 0x56, 0x45], 8);
  header.set([0x66, 0x6d, 0x74, 0x20], 12);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, bitDepth, true);
  header.set([0x64, 0x61, 0x74, 0x61], 36);
  view.setUint32(40, audio.length, true);
  const wav = new Uint8Array(header.length + audio.length);
  wav.set(header);
  wav.set(audio, header.length);
  return wav;
}

function createResponse() {
  const response = {
    body: undefined as unknown,
    code: 200,
    end: vi.fn(),
    json: vi.fn(function (this: typeof response, body: unknown) {
      this.body = body;
      return this;
    }),
    status: vi.fn(function (this: typeof response, code: number) {
      this.code = code;
      return this;
    }),
  };
  return response;
}

function createRequest(body: Uint8Array, outputMode = 'local+discord') {
  return {
    body,
    header: (name: string) => name === 'x-yourwifey-discord-token' ? 'bot-secret' : undefined,
    query: {
      outputMode,
      segmentIndex: '3',
      ttsSessionId: 'session-1',
      utteranceId: 'utterance-1',
    },
  } as unknown as Request;
}

describe('Piper output fanout', () => {
  it('strictly extracts mono PCM16 WAV audio and its header sample rate', () => {
    const audio = new Uint8Array([1, 2, 3, 4]);
    expect(extractMonoPcm16Wav(createWav(audio, 22_050))).toEqual({ audio, sampleRate: 22_050 });
    expect(() => extractMonoPcm16Wav(createWav(audio, 32_000, { channels: 2 }))).toThrow('mono PCM16');
    expect(() => extractMonoPcm16Wav(createWav(audio, 32_000, { bitDepth: 8 }))).toThrow('mono PCM16');
    expect(() => extractMonoPcm16Wav(new Uint8Array([0, 1, 2]))).toThrow('RIFF/WAVE');
  });

  it('forwards one final PCM chunk with the WAV rate and routing IDs', () => {
    const tryEnqueue = vi.fn(() => true);
    const fanout = new TtsOutputFanout();
    fanout.setDiscordSink({ tryEnqueue });
    const response = createResponse();
    const audio = new Uint8Array([1, 2, 3, 4]);

    handlePiperOutput(
      createRequest(createWav(audio, 32_000)),
      response as unknown as Response,
      fanout,
      (token) => token === 'bot-secret',
    );

    expect(response.code).toBe(202);
    expect(response.body).toEqual({ ok: true, forwarded: true });
    expect(tryEnqueue).toHaveBeenCalledWith({
      audio,
      chunkIndex: 0,
      format: 'pcm',
      isFinal: true,
      sampleRate: 32_000,
      segmentIndex: 3,
      sessionId: 'session-1',
      utteranceId: 'utterance-1',
    });
  });

  it('does not parse or fan out local-only and external uploads', () => {
    const tryEnqueue = vi.fn(() => true);
    const fanout = new TtsOutputFanout();
    fanout.setDiscordSink({ tryEnqueue });

    for (const outputMode of ['local-only', 'external']) {
      const response = createResponse();
      handlePiperOutput(
        createRequest(new Uint8Array([0]), outputMode),
        response as unknown as Response,
        fanout,
      );
      expect(response.code).toBe(204);
    }
    expect(tryEnqueue).not.toHaveBeenCalled();
  });

  it('rejects Discord output without the connected bot token', () => {
    const response = createResponse();
    handlePiperOutput(
      createRequest(createWav(new Uint8Array([1, 2]))),
      response as unknown as Response,
      new TtsOutputFanout(),
      () => false,
    );
    expect(response.code).toBe(403);
  });
});
