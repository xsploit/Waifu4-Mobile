export type MouthWeights = {
  aa: number;
  ih: number;
  ou: number;
  ee: number;
  oh: number;
};

export const ZERO_MOUTH_WEIGHTS: MouthWeights = {
  aa: 0,
  ih: 0,
  ou: 0,
  ee: 0,
  oh: 0,
};

function clamp01(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

export function mapWLipSyncWeights(weights: Record<string, unknown>): MouthWeights {
  const next = { ...ZERO_MOUTH_WEIGHTS };
  for (const [rawName, rawValue] of Object.entries(weights)) {
    const value = clamp01(rawValue);
    switch (rawName.toUpperCase()) {
      case 'A':
        next.aa = Math.max(next.aa, value);
        break;
      case 'I':
        next.ih = Math.max(next.ih, value);
        break;
      case 'U':
        next.ou = Math.max(next.ou, value);
        break;
      case 'E':
        next.ee = Math.max(next.ee, value);
        break;
      case 'O':
        next.oh = Math.max(next.oh, value);
        break;
      default:
        break;
    }
  }
  return next;
}
