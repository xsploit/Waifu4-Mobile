import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./FishTtsStream', () => ({
  streamFishTimestampTts: vi.fn(),
  streamFishTts: vi.fn(async (_options, onChunk: (chunk: Uint8Array) => void) => {
    onChunk(new Uint8Array([1, 2, 3, 4]));
    return { bytes: 4, chunks: 1 };
  }),
}));

vi.mock('./InworldTtsStream', () => ({ streamInworldTts: vi.fn() }));

import { handleTtsStream } from './stream';
import { TtsOutputFanout } from './outputFanout';

function createResponse(log: string[]) {
  const response = new EventEmitter() as EventEmitter & Partial<Response> & {
    lines: string[];
  };
  response.lines = [];
  response.writeHead = vi.fn(() => response as Response);
  response.write = vi.fn((value: string) => {
    log.push('browser');
    response.lines.push(value);
    return true;
  });
  response.end = vi.fn(() => response as Response);
  return response as Response & { lines: string[] };
}

describe('TTS stream output fanout', () => {
  it('writes the unchanged browser event before a synchronous Discord sidecar enqueue', async () => {
    const log: string[] = [];
    const fanout = new TtsOutputFanout();
    const sidecarChunks: unknown[] = [];
    fanout.setDiscordSink({
      tryEnqueue: (chunk) => {
        log.push('sidecar');
        sidecarChunks.push(chunk);
        return true;
      },
    });
    const req = {
      body: {
        format: 'pcm',
        outputMode: 'local+discord',
        provider: 'fish',
        sampleRate: 44_100,
        segmentIndex: 2,
        text: 'hello',
        ttsSessionId: 'session-1',
        utteranceId: 'utterance-1',
      },
      headers: { 'x-yourwifey-tts-provider-key': 'key' },
    } as unknown as Request;
    const res = createResponse(log);

    await handleTtsStream(req, res, fanout);

    const browserEvents = res.lines.map((line) => JSON.parse(line));
    expect(browserEvents[0]).toEqual({
      audio: Buffer.from([1, 2, 3, 4]).toString('base64'),
      format: 'pcm',
      sampleRate: 44_100,
      type: 'audio',
    });
    expect(log.slice(0, 2)).toEqual(['browser', 'sidecar']);
    expect(sidecarChunks).toMatchObject([
      { chunkIndex: 0, segmentIndex: 2, sessionId: 'session-1', utteranceId: 'utterance-1' },
      { chunkIndex: 1, isFinal: true, sessionId: 'session-1', utteranceId: 'utterance-1' },
    ]);
  });

  it('does not invoke a Discord sink in local-only mode', async () => {
    const tryEnqueue = vi.fn(() => true);
    const fanout = new TtsOutputFanout();
    fanout.setDiscordSink({ tryEnqueue });
    const req = {
      body: { provider: 'fish', text: 'hello' },
      headers: { 'x-yourwifey-tts-provider-key': 'key' },
    } as unknown as Request;

    await handleTtsStream(req, createResponse([]), fanout);
    expect(tryEnqueue).not.toHaveBeenCalled();
  });
});
