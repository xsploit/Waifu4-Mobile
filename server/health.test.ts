import { describe, expect, it } from 'vitest';
import { buildHealth, SERVICE_NAME } from './health';

describe('buildHealth', () => {
  it('reports ok with the service name', () => {
    const body = buildHealth(new Date('2026-05-30T00:00:00.000Z'));
    expect(body).toEqual({
      ok: true,
      service: SERVICE_NAME,
      time: '2026-05-30T00:00:00.000Z',
    });
  });
});
