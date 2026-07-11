import type { GrilloLedgerProjection, GrilloProjectedClaim } from './GrilloLedgerProjector.js';

export type GrilloLegacyProjectionSource = {
  memoryBlocks: Array<Record<string, unknown>>;
  memorySlots: Array<Record<string, unknown>>;
  relationshipProfile: Record<string, unknown>;
  scopeKey: string;
};

export type GrilloLegacyProjectionItem = {
  container: string;
  exactClaimIds: string[];
  id: string;
  participantKey: string | null;
  predicate: string;
  source: 'block' | 'relationship_profile' | 'slot';
  value: string | number | boolean | null;
  valueKey: string;
  valueOnlyClaimIds: string[];
};

export type GrilloProjectionCoverageReport = {
  scopeKey: string;
  projectionGeneration: string;
  ready: boolean;
  coverage: {
    exact: number;
    ratio: number;
    total: number;
    valueOnly: number;
  };
  legacyItems: GrilloLegacyProjectionItem[];
  uncoveredItemIds: string[];
  ledgerOnlyClaimIds: string[];
  legacyDrift: Array<{
    container: string;
    participantKey: string | null;
    blockValues: Array<string | number | boolean | null>;
    slotValues: Array<string | number | boolean | null>;
  }>;
  ledgerIntegrityIssues: string[];
  invalidLedgerRecordIds: string[];
};

export function auditGrilloProjectionCoverage(
  projection: GrilloLedgerProjection,
  source: GrilloLegacyProjectionSource,
): GrilloProjectionCoverageReport {
  const currentClaims = projection.slots.map((slot) => slot.current);
  const legacyItems = [
    ...readCurrentBlockItems(source.memoryBlocks, source.scopeKey),
    ...readSlotItems(source.memorySlots, source.scopeKey),
    ...readRelationshipItems(source.relationshipProfile),
  ]
    .map((item) => matchLegacyItem(item, currentClaims))
    .sort(compareLegacyItems);
  const exact = legacyItems.filter((item) => item.exactClaimIds.length > 0).length;
  const valueOnly = legacyItems.filter(
    (item) => item.exactClaimIds.length === 0 && item.valueOnlyClaimIds.length > 0,
  ).length;
  const legacyDrift = findLegacyDrift(source);
  const uncoveredItemIds = legacyItems
    .filter((item) => item.exactClaimIds.length === 0)
    .map((item) => item.id);
  const exactMatchedClaimIds = new Set(legacyItems.flatMap((item) => item.exactClaimIds));
  const ledgerOnlyClaimIds = [
    ...new Set(
      currentClaims
        .filter((claim) => !exactMatchedClaimIds.has(claim.claimId))
        .map((claim) => claim.claimId),
    ),
  ].sort();
  const ledgerIntegrityIssues = [...projection.provenance.integrityIssues].sort();
  return {
    scopeKey: source.scopeKey,
    projectionGeneration: projection.generation,
    ready:
      uncoveredItemIds.length === 0 &&
      ledgerOnlyClaimIds.length === 0 &&
      legacyDrift.length === 0 &&
      ledgerIntegrityIssues.length === 0 &&
      projection.provenance.invalidRecordIds.length === 0,
    coverage: {
      exact,
      ratio: legacyItems.length > 0 ? exact / legacyItems.length : 1,
      total: legacyItems.length,
      valueOnly,
    },
    legacyItems,
    uncoveredItemIds,
    ledgerOnlyClaimIds,
    legacyDrift,
    ledgerIntegrityIssues,
    invalidLedgerRecordIds: [...projection.provenance.invalidRecordIds],
  };
}

type UnmatchedLegacyItem = Omit<
  GrilloLegacyProjectionItem,
  'exactClaimIds' | 'valueOnlyClaimIds'
>;

type LegacyValue = {
  key: string;
  value: string | number | boolean | null;
};

function readCurrentBlockItems(records: Array<Record<string, unknown>>, scopeKey: string) {
  const current = new Map<
    string,
    { container: string; participantKey: string | null; values: LegacyValue[] }
  >();
  for (const record of [...records]
    .filter((entry) => recordScopeKey(entry) === scopeKey)
    .sort((left, right) => recordTimestamp(left) - recordTimestamp(right))) {
    const container = text(record['block_name'] ?? record['blockName']) || 'memory';
    const participantKey = participant(record);
    const key = `${participantKey ?? 'scope'}\u0000${container}`;
    const values = readLegacyValues(record['items'] ?? record['items_json'] ?? record['itemsJson']);
    const previous = current.get(key)?.values ?? [];
    current.set(key, {
      container,
      participantKey,
      values:
        text(record['operation']).toLowerCase() === 'replace'
          ? uniqueLegacyValues(values)
          : uniqueLegacyValues([...previous, ...values]),
    });
  }
  return [...current.values()].flatMap((entry) =>
    entry.values.map((value, index) =>
      legacyItem('block', entry.container, entry.participantKey, value, index),
    ),
  );
}

function readSlotItems(records: Array<Record<string, unknown>>, scopeKey: string) {
  return records
    .filter((record) => recordScopeKey(record) === scopeKey)
    .flatMap((record) => {
      const container = text(record['slot_name'] ?? record['slotName']) || 'slot';
      const participantKey = participant(record);
      return readLegacyValues(record['content_json'] ?? record['contentJson']).map((value, index) =>
        legacyItem('slot', container, participantKey, value, index),
      );
    });
}

// Every top-level RelationshipMemory field the legacy prompt path can carry.
// Each entry lists the audit container name and the profile keys it reads.
const RELATIONSHIP_SCALAR_FIELDS: Array<[string, string[]]> = [
  ['turn_count', ['turnCount', 'turn_count']],
  ['last_seen_at', ['lastSeenAt', 'last_seen_at']],
  ['last_diary_turn_count', ['lastDiaryTurnCount', 'last_diary_turn_count']],
  ['relationship_stage', ['relationshipStage', 'relationship_stage']],
  ['mood', ['mood']],
  ['trust', ['trust']],
  ['attraction', ['attraction']],
  ['respect', ['respect']],
  ['irritation', ['irritation']],
  ['jealousy', ['jealousy']],
  ['guard', ['guard']],
  ['last_action_tag', ['lastActionTag', 'last_action_tag']],
  ['summary', ['summary']],
  ['diary_entry', ['diaryEntry', 'diary_entry']],
];

const RELATIONSHIP_ARRAY_FIELDS: Array<[string, string[]]> = [
  ['facts', ['facts', 'storedFacts', 'stored_facts']],
  ['diary_history', ['diaryHistory', 'diary_history']],
  ['tone_preferences', ['tone_preferences', 'tonePreferences']],
  ['interaction_style', ['interaction_style', 'interactionStyle']],
  ['boundaries', ['boundaries']],
  ['active_threads', ['active_threads', 'activeThreads']],
];

// AffectState subfields are enumerated explicitly instead of flattening the
// object, so unknown nested shapes can never manufacture exact matches.
const AFFECT_STATE_FIELDS: Array<[string, string[]]> = [
  ['affect_state_arousal', ['arousal']],
  ['affect_state_dominance', ['dominance']],
  ['affect_state_label', ['label']],
  ['affect_state_last_emotion', ['lastEmotion', 'last_emotion']],
  ['affect_state_updated_at', ['updatedAt', 'updated_at']],
  ['affect_state_valence', ['valence']],
];

function readRelationshipItems(profile: Record<string, unknown>) {
  const participantKey = participant(profile);
  const items: UnmatchedLegacyItem[] = [];
  for (const [field, keys] of RELATIONSHIP_SCALAR_FIELDS) {
    const value = scalar(firstDefined(profile, keys));
    if (value !== undefined && value !== null && value !== '') {
      items.push(legacyItem('relationship_profile', field, participantKey, legacyValue(value), 0));
    }
  }
  for (const [field, keys] of RELATIONSHIP_ARRAY_FIELDS) {
    readLegacyValues(firstDefined(profile, keys)).forEach((value, index) => {
      items.push(legacyItem('relationship_profile', field, participantKey, value, index));
    });
  }
  const affectState = record(firstDefined(profile, ['affectState', 'affect_state']));
  for (const [field, keys] of AFFECT_STATE_FIELDS) {
    const value = scalar(firstDefined(affectState, keys));
    if (value !== undefined && value !== null && value !== '') {
      items.push(legacyItem('relationship_profile', field, participantKey, legacyValue(value), 0));
    }
  }
  const stats = record(profile['stats']);
  for (const key of Object.keys(stats).sort()) {
    const value = scalar(stats[key]);
    if (value !== undefined && value !== null && value !== '') {
      items.push(
        legacyItem('relationship_profile', `stats_${key}`, participantKey, legacyValue(value), 0),
      );
    }
  }
  return items;
}

function firstDefined(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (source[key] !== undefined) return source[key];
  }
  return undefined;
}

function legacyItem(
  source: GrilloLegacyProjectionItem['source'],
  container: string,
  participantKey: string | null,
  value: LegacyValue,
  index: number,
): UnmatchedLegacyItem {
  const predicate = normalizePredicate(container);
  return {
    container,
    id: `${source}:${participantKey ?? 'scope'}:${predicate}:${index}:${value.key}`,
    participantKey,
    predicate,
    source,
    value: value.value,
    valueKey: value.key,
  };
}

function matchLegacyItem(
  item: UnmatchedLegacyItem,
  claims: GrilloProjectedClaim[],
): GrilloLegacyProjectionItem {
  const compatibleClaims = claims.filter(
    (claim) => (claim.participantKey ?? null) === item.participantKey,
  );
  const valueMatches = compatibleClaims.filter((claim) =>
    claimValueKeys(claim.effectiveValue).includes(item.valueKey),
  );
  return {
    ...item,
    exactClaimIds: valueMatches
      .filter((claim) => normalizePredicate(claim.predicate) === item.predicate)
      .map((claim) => claim.claimId)
      .sort(),
    valueOnlyClaimIds: valueMatches.map((claim) => claim.claimId).sort(),
  };
}

function findLegacyDrift(source: GrilloLegacyProjectionSource) {
  const blocks = readCurrentBlockItems(source.memoryBlocks, source.scopeKey);
  const slots = readSlotItems(source.memorySlots, source.scopeKey);
  const keys = new Set([
    ...blocks.map((item) => `${item.participantKey ?? 'scope'}\u0000${item.container}`),
    ...slots.map((item) => `${item.participantKey ?? 'scope'}\u0000${item.container}`),
  ]);
  return [...keys]
    .map((key) => {
      const [rawParticipantKey, container] = key.split('\u0000');
      const participantKey = rawParticipantKey === 'scope' ? null : rawParticipantKey;
      const blockValues = uniqueLegacyValues(
        blocks
          .filter((item) => item.container === container && item.participantKey === participantKey)
          .map((item) => ({ key: item.valueKey, value: item.value })),
      );
      const slotValues = uniqueLegacyValues(
        slots
          .filter((item) => item.container === container && item.participantKey === participantKey)
          .map((item) => ({ key: item.valueKey, value: item.value })),
      );
      return {
        container: container ?? '',
        participantKey,
        blockValueKeys: blockValues.map((entry) => entry.key),
        slotValueKeys: slotValues.map((entry) => entry.key),
        blockValues: blockValues.map((entry) => entry.value),
        slotValues: slotValues.map((entry) => entry.value),
      };
    })
    .filter((item) => !sameKeySet(item.blockValueKeys, item.slotValueKeys))
    .map(({ blockValueKeys: _b, slotValueKeys: _s, ...item }) => item)
    .sort((left, right) =>
      (left.participantKey ?? '').localeCompare(right.participantKey ?? '') ||
      left.container.localeCompare(right.container),
    );
}

function compareLegacyItems(left: GrilloLegacyProjectionItem, right: GrilloLegacyProjectionItem) {
  return (
    left.source.localeCompare(right.source) ||
    (left.participantKey ?? '').localeCompare(right.participantKey ?? '') ||
    left.container.localeCompare(right.container) ||
    left.id.localeCompare(right.id)
  );
}

// A claim value can match a legacy item only as a whole scalar, a top-level
// array element, or a deep-equal JSON structure. Nested objects are compared
// canonically instead of flattening their scalars.
function claimValueKeys(value: unknown): string[] {
  const direct = scalar(value);
  if (direct !== undefined) return [canonicalScalarKey(direct)];
  if (Array.isArray(value)) return value.map((element) => legacyValue(element).key);
  return [jsonValueKey(value)];
}

function readLegacyValues(raw: unknown): LegacyValue[] {
  const parsed = typeof raw === 'string' ? parseJson(raw) ?? raw : raw;
  if (parsed === undefined || parsed === null || parsed === '') return [];
  if (Array.isArray(parsed)) return parsed.map((element) => legacyValue(element));
  return [legacyValue(parsed)];
}

function legacyValue(raw: unknown): LegacyValue {
  const direct = scalar(raw);
  if (direct !== undefined) {
    return { key: canonicalScalarKey(direct), value: direct };
  }
  return { key: jsonValueKey(raw), value: stableJson(raw) };
}

function uniqueLegacyValues(values: LegacyValue[]) {
  const seen = new Set<string>();
  return values.filter((entry) => {
    if (seen.has(entry.key)) return false;
    seen.add(entry.key);
    return true;
  });
}

function sameKeySet(left: string[], right: string[]) {
  const leftKeys = [...left].sort();
  const rightKeys = [...right].sort();
  return leftKeys.length === rightKeys.length && leftKeys.every((value, index) => value === rightKeys[index]);
}

function scalar(value: unknown): string | number | boolean | null | undefined {
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return undefined;
}

// Type-prefixed so "5" (string) can never equal 5 (number).
function canonicalScalarKey(value: string | number | boolean | null) {
  if (value === null) return 'null';
  if (typeof value === 'string') return `str:${value.replace(/\s+/g, ' ').trim().toLowerCase()}`;
  if (typeof value === 'number') return `num:${JSON.stringify(value)}`;
  return `bool:${JSON.stringify(value)}`;
}

function jsonValueKey(value: unknown) {
  return `json:${stableJson(value)}`;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const entries = value as Record<string, unknown>;
  return `{${Object.keys(entries)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(entries[key])}`)
    .join(',')}}`;
}

function normalizePredicate(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function participant(value: Record<string, unknown>) {
  return (
    text(
      value['participant_key'] ??
        value['participantKey'] ??
        value['speaker_key'] ??
        value['speakerKey'],
    ) || null
  );
}

function recordScopeKey(value: Record<string, unknown>) {
  return text(value['scope_key'] ?? value['scopeKey'] ?? value['user_id'] ?? value['userId']);
}

function recordTimestamp(value: Record<string, unknown>) {
  const timestamp = Number(
    value['updated_at'] ?? value['updatedAt'] ?? value['created_at'] ?? value['createdAt'] ?? 0,
  );
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown) {
  return String(value ?? '').trim();
}

function parseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}
