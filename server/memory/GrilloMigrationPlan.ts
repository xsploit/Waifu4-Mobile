import type { GrilloEvidenceRecord, GrilloLedgerReplay } from './GrilloEvidenceLedger.js';

export type GrilloMigrationDisposition =
  | 'derived_runtime_state'
  | 'durable_claim_candidate'
  | 'projection_state'
  | 'requires_provenance';

export type GrilloEvidenceBackfillItem = {
  action: 'conflict' | 'insert' | 'noop';
  candidate: GrilloEvidenceRecord | null;
  reason: string;
  turnId: string;
};

export type GrilloMigrationPlan = {
  scopeKey: string;
  evidenceBackfill: {
    canApply: boolean;
    conflicts: number;
    inserts: number;
    items: GrilloEvidenceBackfillItem[];
    noops: number;
  };
  profileFields: Array<{
    disposition: GrilloMigrationDisposition;
    field: string;
    reason: string;
    value: unknown;
  }>;
  gates: {
    claimWritesPlanned: 0;
    livePromptSwitchPlanned: false;
    requiresExplicitApprovalToWrite: true;
  };
};

export type GrilloMigrationPlanInput = {
  relationshipProfile: Record<string, unknown>;
  replay: GrilloLedgerReplay;
  scopeKey: string;
  turnEvents: Array<Record<string, unknown>>;
};

const PROFILE_POLICIES: Array<{
  disposition: GrilloMigrationDisposition;
  field: string;
  path: string[];
  reason: string;
}> = [
  {
    disposition: 'derived_runtime_state',
    field: 'turnCount',
    path: ['turnCount'],
    reason: 'Recompute from canonical turn events.',
  },
  {
    disposition: 'derived_runtime_state',
    field: 'lastSeenAt',
    path: ['lastSeenAt'],
    reason: 'Recompute from canonical turn timestamps.',
  },
  {
    disposition: 'derived_runtime_state',
    field: 'lastDiaryTurnCount',
    path: ['lastDiaryTurnCount'],
    reason: 'Worker progress watermark, not a durable belief.',
  },
  ...[
    'relationshipStage',
    'mood',
    'trust',
    'attraction',
    'respect',
    'irritation',
    'jealousy',
    'guard',
    'lastActionTag',
    'summary',
  ].map((field) => ({
    disposition: 'projection_state' as const,
    field,
    path: [field],
    reason: 'Rebuild from evidence-backed claims and worker decisions; do not canonize the snapshot.',
  })),
  {
    disposition: 'projection_state',
    field: 'affectState',
    path: ['affectState'],
    reason: 'Current affect is a rebuildable state projection, not historical truth.',
  },
  {
    disposition: 'durable_claim_candidate',
    field: 'facts',
    path: ['facts'],
    reason: 'May become claims only after each fact is tied to supporting evidence.',
  },
  {
    disposition: 'requires_provenance',
    field: 'diaryEntry',
    path: ['diaryEntry'],
    reason: 'Preserve as a diary record with its original source and timestamp.',
  },
  {
    disposition: 'requires_provenance',
    field: 'diaryHistory',
    path: ['diaryHistory'],
    reason: 'Preserve as ordered diary records, not flattened claims.',
  },
];

export function buildGrilloMigrationPlan(input: GrilloMigrationPlanInput): GrilloMigrationPlan {
  const existingEvidence = new Map(input.replay.evidence.map((record) => [record.id, record]));
  const items = input.turnEvents
    .filter((record) => recordScopeKey(record) === input.scopeKey)
    .map((record) => planTurnEvidence(record, input.scopeKey, existingEvidence))
    .sort((left, right) => left.turnId.localeCompare(right.turnId));
  const profileFields = PROFILE_POLICIES.flatMap((policy) => {
    const value = readPath(input.relationshipProfile, policy.path);
    return hasValue(value) ? [{ ...policy, value }] : [];
  });
  const conflicts = items.filter((item) => item.action === 'conflict').length;
  return {
    scopeKey: input.scopeKey,
    evidenceBackfill: {
      canApply: conflicts === 0,
      conflicts,
      inserts: items.filter((item) => item.action === 'insert').length,
      items,
      noops: items.filter((item) => item.action === 'noop').length,
    },
    profileFields,
    gates: {
      claimWritesPlanned: 0,
      livePromptSwitchPlanned: false,
      requiresExplicitApprovalToWrite: true,
    },
  };
}

function planTurnEvidence(
  turn: Record<string, unknown>,
  scopeKey: string,
  existingEvidence: Map<string, GrilloEvidenceRecord>,
): GrilloEvidenceBackfillItem {
  const turnId = text(turn['turn_id'] ?? turn['turnId'] ?? turn['id']);
  const content = text(turn['content'] ?? turn['text']);
  const role = evidenceRole(turn['role']);
  const createdAt = timestamp(turn['created_at'] ?? turn['createdAt'] ?? turn['timestamp']);
  if (!turnId || !content || !role || createdAt === null) {
    return {
      action: 'conflict',
      candidate: null,
      reason: 'Turn is missing a stable ID, content, supported role, or timestamp.',
      turnId: turnId || 'unknown',
    };
  }
  const participantKey = text(turn['participant_key'] ?? turn['participantKey']);
  const source = text(turn['source']) || 'legacy-turn-event';
  const candidate: GrilloEvidenceRecord = {
    id: turnId,
    content,
    createdAt,
    kind: 'turn',
    metadata: {
      authorName: text(turn['author_name'] ?? turn['authorName']),
      channelId: text(turn['channel_id'] ?? turn['channelId']),
      interfacePath: text(turn['interface_path'] ?? turn['interfacePath']),
    },
    ...(participantKey ? { participantKey } : {}),
    role,
    scopeKey,
    source,
    sourceRecordIds: [turnId],
  };
  const existing = existingEvidence.get(turnId);
  if (!existing) {
    return { action: 'insert', candidate, reason: 'Canonical turn has no ledger evidence.', turnId };
  }
  if (
    existing.kind === 'turn' &&
    existing.scopeKey === scopeKey &&
    existing.role === candidate.role &&
    normalize(existing.content) === normalize(candidate.content)
  ) {
    return { action: 'noop', candidate, reason: 'Equivalent turn evidence already exists.', turnId };
  }
  return {
    action: 'conflict',
    candidate,
    reason: 'The ledger ID already exists with different turn evidence.',
    turnId,
  };
}

function evidenceRole(value: unknown): GrilloEvidenceRecord['role'] | null {
  const role = text(value);
  return ['assistant', 'system', 'tool', 'user', 'worker'].includes(role)
    ? (role as GrilloEvidenceRecord['role'])
    : null;
}

function readPath(source: Record<string, unknown>, path: string[]) {
  let value: unknown = source;
  for (const key of path) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const record = value as Record<string, unknown>;
    value = record[key] ?? record[toSnakeCase(key)];
  }
  return value;
}

function hasValue(value: unknown) {
  if (value === undefined || value === null || value === '') return false;
  return !Array.isArray(value) || value.length > 0;
}

function recordScopeKey(record: Record<string, unknown>) {
  return text(record['scope_key'] ?? record['scopeKey'] ?? record['user_id'] ?? record['userId']);
}

function timestamp(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : null;
}

function normalize(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function text(value: unknown) {
  return String(value ?? '').trim();
}

function toSnakeCase(value: string) {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}
