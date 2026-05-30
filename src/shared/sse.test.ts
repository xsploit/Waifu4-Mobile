import { describe, expect, it } from 'vitest';
import { createSseParser, formatSseEvent } from './sse';

describe('sse', () => {
  it('round-trips a single event', () => {
    const wire = formatSseEvent('delta', { text: 'hi' });
    const events = createSseParser().push(wire);
    expect(events).toEqual([{ event: 'delta', data: '{"text":"hi"}' }]);
  });

  it('reassembles events split across chunks', () => {
    const parser = createSseParser();
    const wire = formatSseEvent('done', { ok: true });
    const mid = Math.floor(wire.length / 2);
    expect(parser.push(wire.slice(0, mid))).toEqual([]);
    const events = parser.push(wire.slice(mid));
    expect(events).toEqual([{ event: 'done', data: '{"ok":true}' }]);
  });

  it('parses multiple events in one chunk', () => {
    const wire = formatSseEvent('delta', { text: 'a' }) + formatSseEvent('delta', { text: 'b' });
    const events = createSseParser().push(wire);
    expect(events.map((e) => JSON.parse(e.data).text)).toEqual(['a', 'b']);
  });
});
