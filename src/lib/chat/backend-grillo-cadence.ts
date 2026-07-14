const BACKEND_GRILLO_CADENCE_BEATS = [
  'extraction',
  'relationship',
  'reflection',
] as const;

export type BackendGrilloCadenceBeat = (typeof BACKEND_GRILLO_CADENCE_BEATS)[number];

export async function executeBackendGrilloCadence<T>({
  reason,
  runBeat,
  stateKey,
}: {
  reason: string;
  runBeat: (beatType: BackendGrilloCadenceBeat, reason: string, stateKey: string) => Promise<T>;
  stateKey: string;
}) {
  const results: Array<{ beatType: BackendGrilloCadenceBeat; result: T }> = [];
  for (const beatType of BACKEND_GRILLO_CADENCE_BEATS) {
    results.push({
      beatType,
      result: await runBeat(beatType, `${reason}_${beatType}`, stateKey),
    });
  }
  return results;
}
