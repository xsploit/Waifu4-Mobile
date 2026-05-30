import { describe, expect, it } from 'vitest';
import { formatLogLine } from './logger';

describe('formatLogLine', () => {
  it('formats a bare message', () => {
    expect(formatLogLine('info', 'boot', 'app started')).toBe('[INFO] (boot) app started');
  });

  it('appends scalar fields as key=value', () => {
    expect(formatLogLine('warn', 'tts', 'slow', { ms: 1200 })).toBe(
      '[WARN] (tts) slow ms=1200',
    );
  });

  it('json-encodes object fields', () => {
    expect(formatLogLine('error', 'llm', 'bad', { err: { code: 500 } })).toBe(
      '[ERROR] (llm) bad err={"code":500}',
    );
  });

  it('ignores an empty fields object', () => {
    expect(formatLogLine('debug', 'x', 'msg', {})).toBe('[DEBUG] (x) msg');
  });
});
