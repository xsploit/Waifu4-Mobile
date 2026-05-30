export type HealthBody = {
  ok: true;
  service: string;
  time: string;
};

export const SERVICE_NAME = 'webwaifu-backend';

/** Pure builder so the health contract is unit-testable. */
export function buildHealth(now: Date = new Date()): HealthBody {
  return {
    ok: true,
    service: SERVICE_NAME,
    time: now.toISOString(),
  };
}
