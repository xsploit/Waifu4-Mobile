import { useEffect, useState } from 'react';

type HealthState =
  | { kind: 'checking' }
  | { kind: 'ok'; service: string }
  | { kind: 'down'; reason: string };

export function StatusPanel() {
  const [health, setHealth] = useState<HealthState>({ kind: 'checking' });

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch('/health');
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const body = (await res.json()) as { ok?: boolean; service?: string };
        if (!cancelled) {
          setHealth(
            body.ok
              ? { kind: 'ok', service: body.service ?? 'backend' }
              : { kind: 'down', reason: 'backend reported not ok' },
          );
        }
      } catch (err) {
        if (!cancelled) {
          setHealth({ kind: 'down', reason: err instanceof Error ? err.message : String(err) });
        }
      }
    };
    void check();
    const timer = setInterval(check, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const { label, color } =
    health.kind === 'checking'
      ? { label: 'checking backend…', color: '#888' }
      : health.kind === 'ok'
        ? { label: `backend up · ${health.service}`, color: '#3ddc84' }
        : { label: `backend down · ${health.reason}`, color: '#ff5470' };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
      <span style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
      <span>{label}</span>
    </div>
  );
}
