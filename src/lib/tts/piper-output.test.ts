import { afterEach, describe, expect, it, vi } from 'vitest';
import { uploadPiperWav } from './piper-output';

vi.mock('./remote', () => ({
  getTtsProxyUrl: () => 'http://localhost:8797/tts/piper-output',
}));

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;

afterEach(() => {
  globalThis.fetch = originalFetch;
  Object.assign(globalThis, { window: originalWindow });
});

describe('uploadPiperWav', () => {
  it('posts the synthesized WAV with routing metadata only for Discord output modes', async () => {
    const fetchMock = vi.fn(async (..._args: Parameters<typeof fetch>) => new Response(null, { status: 202 }));
    globalThis.fetch = fetchMock as typeof fetch;
    Object.assign(globalThis, { window: { location: { href: 'http://localhost:5173/' } } });
    const wav = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/wav' });

    await uploadPiperWav(wav, {
      outputMode: 'local+discord',
      segmentIndex: 2,
      ttsSessionId: 'session-1',
      utteranceId: 'utterance-1',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toMatchObject({
      pathname: '/tts/piper-output',
      search: '?outputMode=local%2Bdiscord&segmentIndex=2&ttsSessionId=session-1&utteranceId=utterance-1',
    });
    expect(init).toMatchObject({ body: wav, headers: { 'content-type': 'audio/wav' }, method: 'POST' });

    for (const outputMode of ['local-only', 'external'] as const) {
      await uploadPiperWav(wav, {
        outputMode,
        segmentIndex: 3,
        ttsSessionId: 'session-2',
        utteranceId: 'utterance-2',
      });
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
