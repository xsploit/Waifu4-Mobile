const MEMORY_AGENT_INTERVAL_TURNS = 7;

export function normalizeMemoryAgentIntervalMessages(value: number | undefined) {
  return Math.max(
    1,
    Math.min(100, Math.round(Number.isFinite(value) ? value! : MEMORY_AGENT_INTERVAL_TURNS)),
  );
}

export function addMemoryAgentPendingChatTurns(
  pendingCounts: Record<string, number>,
  stateKey: string,
  turnCount: number,
) {
  const key = stateKey.trim() || 'default';
  const nextCount = Math.max(0, Math.trunc(turnCount));
  pendingCounts[key] = (pendingCounts[key] ?? 0) + nextCount;
  return pendingCounts[key] ?? 0;
}

export function clearMemoryAgentPendingChatTurns(
  pendingCounts: Record<string, number>,
  stateKey: string,
) {
  pendingCounts[stateKey.trim() || 'default'] = 0;
}

export function consumeMemoryAgentPendingChatTurns(
  pendingCounts: Record<string, number>,
  stateKey: string,
  processedCount: number,
) {
  const key = stateKey.trim() || 'default';
  const current = pendingCounts[key] ?? 0;
  pendingCounts[key] = Math.max(0, current - Math.max(0, Math.trunc(processedCount)));
  return pendingCounts[key] ?? 0;
}

export function getMemoryAgentCadenceDecision(
  pendingCounts: Record<string, number>,
  stateKey: string,
  intervalMessages: number | undefined,
) {
  const interval = normalizeMemoryAgentIntervalMessages(intervalMessages);
  const pendingCount = pendingCounts[stateKey.trim() || 'default'] ?? 0;
  const remaining = Math.max(0, interval - pendingCount);
  return {
    interval,
    pendingCount,
    remaining,
    shouldQueue: pendingCount >= interval,
  };
}
