import type {
  GrilloContextPacket,
  GrilloMemorySufficiencyReceipt,
  GrilloRetrievalIntent,
} from '../../src/shared/grilloContext.js';

type RequiredLane = GrilloMemorySufficiencyReceipt['requiredLanes'][number];

const INTENT_RULES: Array<{ intent: Exclude<GrilloRetrievalIntent, 'general'>; patterns: RegExp[] }> = [
  {
    intent: 'correction',
    patterns: [
      /\b(?:actually|correction|correct that|that(?:'s| is) wrong|i meant|not what i said)\b/i,
    ],
  },
  {
    intent: 'temporal',
    patterns: [
      /\b(?:before|previously|used to|last time|back then|when did|what changed|since then)\b/i,
    ],
  },
  {
    intent: 'commitment',
    patterns: [
      /\b(?:promised|promise|said you would|agreed to|commitment|plan|goal|supposed to)\b/i,
    ],
  },
  {
    intent: 'relationship',
    patterns: [
      /\b(?:our relationship|between us|feel about me|trust me|miss me|do you like me|are we)\b/i,
    ],
  },
  {
    intent: 'personal',
    patterns: [
      /\b(?:my favorite|my name|about me|do you remember me|what do i like|what did i tell you)\b/i,
    ],
  },
  {
    intent: 'metacognitive',
    patterns: [
      /\b(?:your memory|remember that|forget that|why did you remember|why did you forget|context window|memory system)\b/i,
    ],
  },
];

const REQUIRED_LANES: Record<Exclude<GrilloRetrievalIntent, 'general'>, RequiredLane[]> = {
  correction: ['channel_history', 'recalled_memories'],
  temporal: ['channel_history', 'recalled_memories'],
  commitment: ['channel_history', 'recalled_memories'],
  relationship: ['relationship_memory'],
  personal: ['recalled_memories'],
  metacognitive: ['channel_history', 'recalled_memories'],
};

export function assessGrilloMemorySufficiency(
  query: string,
  packet: GrilloContextPacket,
): GrilloMemorySufficiencyReceipt {
  const normalizedQuery = normalize(query);
  const detected = INTENT_RULES.filter((rule) =>
    rule.patterns.some((pattern) => pattern.test(normalizedQuery)),
  ).map((rule) => rule.intent);
  const intents: GrilloRetrievalIntent[] = detected.length > 0 ? detected : ['general'];
  const requiredLanes = unique(
    detected.flatMap((intent) => REQUIRED_LANES[intent]),
  ) as RequiredLane[];
  const missingLanes = requiredLanes.filter((lane) => laneLength(packet, lane) === 0);
  const droppedRelevantIds = unique(
    requiredLanes.flatMap((lane) => packet.provenance_receipt?.lanes[lane].droppedIds ?? []),
  );
  const reasons: string[] = [];
  if (missingLanes.length > 0) reasons.push(`missing required lanes: ${missingLanes.join(', ')}`);
  if (
    requiredLanes.includes('recalled_memories') &&
    packet.retrieval_receipt.strategy === 'none'
  ) {
    reasons.push('memory-requiring query produced no semantic or lexical recall');
  }
  if (droppedRelevantIds.length > 0) {
    reasons.push(`${droppedRelevantIds.length} relevant record(s) were dropped before prompting`);
  }
  const status =
    missingLanes.length === requiredLanes.length && requiredLanes.length > 0
      ? 'insufficient'
      : missingLanes.length > 0 || droppedRelevantIds.length > 0
        ? 'partial'
        : 'sufficient';
  return {
    intents,
    probes: buildProbes(normalizedQuery, detected),
    requiredLanes,
    missingLanes,
    droppedRelevantIds,
    reasons,
    status,
    version: '1.0.0',
  };
}

function buildProbes(
  query: string,
  intents: Array<Exclude<GrilloRetrievalIntent, 'general'>>,
) {
  const probes = [query];
  for (const intent of intents) {
    if (intent === 'correction') probes.push(`${query} previous value correction`);
    if (intent === 'temporal') probes.push(`${query} earlier history change timeline`);
    if (intent === 'commitment') probes.push(`${query} promise agreement open goal`);
    if (intent === 'relationship') probes.push(`${query} relationship trust mood history`);
    if (intent === 'personal') probes.push(`${query} user preference personal fact`);
    if (intent === 'metacognitive') probes.push(`${query} memory evidence retrieval context`);
  }
  return unique(probes.filter(Boolean));
}

function laneLength(packet: GrilloContextPacket, lane: RequiredLane) {
  return packet[lane].length;
}

function normalize(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}
