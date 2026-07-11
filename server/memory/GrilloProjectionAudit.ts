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
  legacyDrift: Array<{
    container: string;
    participantKey: string | null;
    blockValues: Array<string | number | boolean | null>;
    slotValues: Array<string | number | boolean | null>;
  }>;
  invalidLedgerRecordIds: string[];
};

export function auditGrilloProjectionCoverage(
  projection: GrilloLedgerProjection,
  source: GrilloLegacyProjectionSource,
): GrilloProjectionCoverageReport {
  const legacyItems = [
    ...readCurrentBlockItems(source.memoryBlocks, source.scopeKey),
    ...readSlotItems(source.memorySlots, source.scopeKey),
    ...readRelationshipItems(source.relationshipProfile),
  ]
    .map((item) => matchLegacyItem(item, projection.slots.map((slot) => slot.current)))
    .sort(compareLegacyItems);
  const exact = legacyItems.filter((item) => item.exactClaimIds.length > 0).length;
  const valueOnly = legacyItems.filter(
    (item) => item.exactClaimIds.length === 0 && item.valueOnlyClaimIds.length > 0,
  ).length;
  const legacyDrift = findLegacyDrift(source);
  const uncoveredItemIds = legacyItems
    .filter((item) => item.exactClaimIds.length === 0)
    .map((item) => item.id);
  return {
    scopeKey: source.scopeKey,
    projectionGeneration: projection.generation,
    ready:
      uncoveredItemIds.length === 0 &&
      legacyDrift.length === 0 &&
      projection.provenance.invalidRecordIds.length === 0,
    coverage: {
      exact,
      ratio: legacyItems.length > 0 ? exact / legacyItems.length : 1,
      total: legacyItems.length,
      valueOnly,
    },
    legacyItems,
    uncoveredItemIds,
    legacyDrift,
    invalidLedgerRecordIds: [...projection.provenance.invalidRecordIds],
  };
}

type UnmatchedLegacyItem = Omit<
  GrilloLegacyProjectionItem,
  'exactClaimIds' | 'valueOnlyClaimIds'
>;

function readCurrentBlockItems(records: Array<Record<string, unknown>>, scopeKey: string) {
  const current = new Map<
    string,
    { container: string; participantKey: string | null; values: Array<string | number | boolean | null> }
  >();
  for (const record of [...records]
    .filter((entry) => recordScopeKey(entry) === scopeKey)
    .sort((left, right) => recordTimestamp(left) - recordTimestamp(right))) {
    const container = text(record['block_name'] ?? record['blockName']) || 'memory';
    const participantKey = participant(record);
    const key = `${participantKey ?? 'scope'}\u0000${container}`;
    const values = readScalarArray(record['items'] ?? record['items_json'] ?? record['itemsJson']);
    const previous = current.get(key)?.values ?? [];
    current.set(key, {
      container,
      participantKey,
      values:
        text(record['operation']).toLowerCase() === 'replace'
          ? uniqueScalars(values)
          : uniqueScalars([...previous, ...values]),
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
      return readScalarArray(record['content_json'] ?? record['contentJson']).map((value, index) =>
        legacyItem('slot', container, participantKey, value, index),
      );
    });
}

function readRelationshipItems(profile: Record<string, unknown>) {
  const participantKey = participant(profile);
  const items: UnmatchedLegacyItem[] = [];
  const scalarFields = [
    ['relationship_stage', profile['relationshipStage'] ?? profile['relationship_stage']],
    ['mood', profile['mood']],
    ['summary', profile['summary']],
  ] as const;
  for (const [field, rawValue] of scalarFields) {
    const value = scalar(rawValue);
    if (value !== undefined && value !== '') {
      items.push(legacyItem('relationship_profile', field, participantKey, value, 0));
    }
  }
  const arrayFields = [
    ['facts', profile['facts'] ?? profile['storedFacts']],
    ['tone_preferences', profile['tone_preferences'] ?? profile['tonePreferences']],
    ['interaction_style', profile['interaction_style'] ?? profile['interactionStyle']],
    ['boundaries', profile['boundaries']],
    ['active_threads', profile['active_threads'] ?? profile['activeThreads']],
  ] as const;
  for (const [field, rawValue] of arrayFields) {
    readScalarArray(rawValue).forEach((value, index) => {
      items.push(legacyItem('relationship_profile', field, participantKey, value, index));
    });
  }
  const stats = record(profile['stats']);
  for (const key of Object.keys(stats).sort()) {
    const value = scalar(stats[key]);
    if (value !== undefined && value !== '') {
      items.push(legacyItem('relationship_profile', `stats_${key}`, participantKey, value, 0));
    }
  }
  return items;
}

function legacyItem(
  source: GrilloLegacyProjectionItem['source'],
  container: string,
  participantKey: string | null,
  value: string | number | boolean | null,
  index: number,
): UnmatchedLegacyItem {
  const predicate = normalizePredicate(container);
  return {
    container,
    id: `${source}:${participantKey ?? 'scope'}:${predicate}:${index}:${normalizeScalar(value)}`,
    participantKey,
    predicate,
    source,
    value,
  };
}

function matchLegacyItem(
  item: UnmatchedLegacyItem,
  claims: GrilloProjectedClaim[],
): GrilloLegacyProjectionItem {
  const compatibleClaims = claims.filter(
    (claim) => !item.participantKey || !claim.participantKey || claim.participantKey === item.participantKey,
  );
  const valueMatches = compatibleClaims.filter((claim) =>
    flattenScalars(claim.effectiveValue).some(
      (value) => normalizeScalar(value) === normalizeScalar(item.value),
    ),
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
      const blockValues = uniqueScalars(
        blocks
          .filter((item) => item.container === container && item.participantKey === participantKey)
          .map((item) => item.value),
      );
      const slotValues = uniqueScalars(
        slots
          .filter((item) => item.container === container && item.participantKey === participantKey)
          .map((item) => item.value),
      );
      return { container, participantKey, blockValues, slotValues };
    })
    .filter((item) => !sameScalarSet(item.blockValues, item.slotValues))
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

function flattenScalars(value: unknown): Array<string | number | boolean | null> {
  const direct = scalar(value);
  if (direct !== undefined) return [direct];
  if (Array.isArray(value)) return value.flatMap(flattenScalars);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .flatMap((key) => flattenScalars((value as Record<string, unknown>)[key]));
  }
  return [];
}

function readScalarArray(value: unknown) {
  const parsed = typeof value === 'string' ? parseJson(value) ?? value : value;
  return Array.isArray(parsed) ? parsed.flatMap(flattenScalars) : flattenScalars(parsed);
}

function uniqueScalars(values: Array<string | number | boolean | null>) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = normalizeScalar(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sameScalarSet(
  left: Array<string | number | boolean | null>,
  right: Array<string | number | boolean | null>,
) {
  const leftKeys = left.map(normalizeScalar).sort();
  const rightKeys = right.map(normalizeScalar).sort();
  return leftKeys.length === rightKeys.length && leftKeys.every((value, index) => value === rightKeys[index]);
}

function scalar(value: unknown): string | number | boolean | null | undefined {
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return undefined;
}

function normalizeScalar(value: string | number | boolean | null) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().toLowerCase() : JSON.stringify(value);
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
