import { describe, expect, it } from 'vitest';
import { base64ToBytes, createNdjsonParser } from './TtsClient';

describe('TTS NDJSON client helpers', () => {
  it('parses events split across stream chunks', () => {
    const parser = createNdjsonParser();
    const wire = '{"type":"audio","audio":"AQI=","format":"pcm","sampleRate":44100}\n{"type":"done","stats":{"chunks":1}}\n';
    const firstLineEnd = wire.indexOf('\n') + 1;
    expect(parser.push(wire.slice(0, 12))).toEqual([]);
    expect(parser.push(wire.slice(12, firstLineEnd))).toEqual([
      { type: 'audio', audio: 'AQI=', format: 'pcm', sampleRate: 44100 },
    ]);
    expect(parser.push(wire.slice(firstLineEnd))).toEqual([{ type: 'done', stats: { chunks: 1 } }]);
  });

  it('decodes base64 audio bytes', () => {
    expect([...base64ToBytes('AQID')]).toEqual([1, 2, 3]);
  });
});
