import type { AnimationEntry } from '../menu/types';

export const ASSISTANT_REPLY_META_OPEN = '<yw-meta>';
export const ASSISTANT_REPLY_META_CLOSE = '</yw-meta>';

const ASSISTANT_REPLY_META_DELIMITERS = [
  { open: ASSISTANT_REPLY_META_OPEN, close: ASSISTANT_REPLY_META_CLOSE },
  { open: '<hidden block>', close: '</hidden block>' },
  { open: '<hidden-block>', close: '</hidden-block>' },
] as const;

export type AssistantEmotion =
  | 'neutral'
  | 'amused'
  | 'happy'
  | 'excited'
  | 'curious'
  | 'confused'
  | 'thinking'
  | 'surprised'
  | 'angry'
  | 'annoyed'
  | 'embarrassed'
  | 'grateful'
  | 'optimistic'
  | 'proud'
  | 'nervous'
  | 'sad'
  | 'caring';

export type AssistantFacialExpression =
  | 'neutral'
  | 'happy'
  | 'relaxed'
  | 'surprised'
  | 'angry'
  | 'sad'
  | 'embarrassed'
  | 'confused'
  | 'thinking'
  | 'caring';

export type AssistantReplyMetadata = {
  arousal: number;
  dominance: number;
  emotion: AssistantEmotion;
  valence: number;
};

export type AssistantReplyParseResult = {
  metadata: AssistantReplyMetadata | null;
  text: string;
};

export const ASSISTANT_REPLY_JSON_FORMAT = {
  name: 'yourwifey_assistant_reply',
  schema: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'Natural spoken dialogue to show and speak. TTS tags like [pause] are allowed.',
      },
      emotion: {
        type: 'string',
        enum: [
          'neutral',
          'amused',
          'happy',
          'excited',
          'curious',
          'confused',
          'thinking',
          'surprised',
          'angry',
          'annoyed',
          'embarrassed',
          'grateful',
          'optimistic',
          'proud',
          'nervous',
          'sad',
          'caring',
        ],
        description: 'The single emotion felt toward the current message. This is not an animation name.',
      },
      valence: {
        type: 'number',
        description: 'Emotional positivity from -1 negative to 1 positive.',
      },
      arousal: {
        type: 'number',
        description: 'Emotional energy from 0 calm to 1 intense.',
      },
      dominance: {
        type: 'number',
        description: 'Felt control from -1 uncertain/submissive to 1 confident/in-control.',
      },
    },
    required: ['message', 'emotion', 'valence', 'arousal', 'dominance'],
    additionalProperties: false,
  },
  strict: true,
  type: 'json_schema',
} satisfies {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
  type: 'json_schema';
};

const EMOTIONS = new Set<AssistantEmotion>([
  'neutral',
  'amused',
  'happy',
  'excited',
  'curious',
  'confused',
  'thinking',
  'surprised',
  'angry',
  'annoyed',
  'embarrassed',
  'grateful',
  'optimistic',
  'proud',
  'nervous',
  'sad',
  'caring',
]);

const EMOTION_EXPRESSION_MAP: Record<AssistantEmotion, AssistantFacialExpression> = {
  neutral: 'neutral',
  amused: 'happy',
  happy: 'happy',
  excited: 'happy',
  curious: 'thinking',
  confused: 'confused',
  thinking: 'thinking',
  surprised: 'surprised',
  angry: 'angry',
  annoyed: 'angry',
  embarrassed: 'embarrassed',
  grateful: 'caring',
  optimistic: 'happy',
  proud: 'happy',
  nervous: 'embarrassed',
  sad: 'sad',
  caring: 'caring',
};

const EMOTION_ANIMATION_KEYWORDS: Record<AssistantEmotion, string[]> = {
  neutral: [],
  amused: ['amused', 'amusement', 'happy', 'joy', 'laugh'],
  happy: ['happy', 'joy', 'amusement'],
  excited: ['excited', 'excitement', 'happy', 'joy'],
  curious: ['curious', 'curiosity', 'thinking', 'hima'],
  confused: ['confused', 'confusion', 'curiosity'],
  thinking: ['thinking', 'hima', 'waiting'],
  surprised: ['surprised', 'surprise', 'attention'],
  angry: ['angry', 'anger', 'annoyance', 'disapproval'],
  annoyed: ['annoyed', 'annoyance', 'anger', 'disapproval'],
  embarrassed: ['embarrassed', 'embarrassment', 'nervous', 'shy'],
  grateful: ['grateful', 'gratitude', 'approval', 'caring'],
  optimistic: ['optimistic', 'optimism', 'happy', 'approval'],
  proud: ['proud', 'pride', 'approval', 'happy'],
  nervous: ['nervous', 'nervousness', 'embarrassment', 'shy'],
  sad: ['sad', 'sadness', 'disappointment'],
  caring: ['caring', 'approval', 'gratitude'],
};

export const EMOTION_VAD_DEFAULTS: Record<
  AssistantEmotion,
  { arousal: number; dominance: number; valence: number }
> = {
  angry: { arousal: 0.82, dominance: 0.55, valence: -0.72 },
  annoyed: { arousal: 0.58, dominance: 0.34, valence: -0.42 },
  amused: { arousal: 0.56, dominance: 0.25, valence: 0.58 },
  caring: { arousal: 0.32, dominance: 0.08, valence: 0.68 },
  confused: { arousal: 0.42, dominance: -0.36, valence: -0.18 },
  curious: { arousal: 0.48, dominance: 0.05, valence: 0.22 },
  embarrassed: { arousal: 0.62, dominance: -0.48, valence: -0.12 },
  excited: { arousal: 0.86, dominance: 0.42, valence: 0.78 },
  grateful: { arousal: 0.36, dominance: 0.02, valence: 0.74 },
  happy: { arousal: 0.6, dominance: 0.24, valence: 0.72 },
  nervous: { arousal: 0.68, dominance: -0.58, valence: -0.28 },
  neutral: { arousal: 0.18, dominance: 0, valence: 0 },
  optimistic: { arousal: 0.52, dominance: 0.38, valence: 0.7 },
  proud: { arousal: 0.56, dominance: 0.72, valence: 0.62 },
  sad: { arousal: 0.24, dominance: -0.42, valence: -0.68 },
  surprised: { arousal: 0.78, dominance: -0.08, valence: 0.12 },
  thinking: { arousal: 0.28, dominance: 0.06, valence: 0.04 },
};

export function buildReplyMetadataInstruction() {
  return [
    'When the reply format is JSON, return only a JSON object with message, emotion, valence, arousal, and dominance. Put the spoken dialogue in message.',
    'When the reply format is normal text, append exactly one metadata block at the very end using this exact tag shape:',
    `${ASSISTANT_REPLY_META_OPEN}{"emotion":"neutral","valence":0,"arousal":0.18,"dominance":0}${ASSISTANT_REPLY_META_CLOSE}`,
    'The block must be valid compact JSON and must not be explained. Do not use any other wrapper name such as hidden block.',
    `emotion must be one of: ${Array.from(EMOTIONS).join(', ')}.`,
    'valence must be -1 to 1, arousal must be 0 to 1, and dominance must be -1 to 1.',
    'Choose the emotion you genuinely feel toward the current message and your reply, not the topic category.',
    'Use amused for playful teasing, annoyed or angry for irritation, embarrassed or nervous for flustered/shy replies, caring or grateful for warmth, and surprised, confused, curious, or thinking for uncertainty or discovery.',
    'Use neutral only when there is no clear emotional color. Prefer a real emotion when the reply is teasing, playful, caring, irritated, surprised, embarrassed, or excited.',
    'Do not choose animation names, motions, gestures, expression ids, purposes, or implementation details.',
  ].join('\n');
}

export function buildAnimationCatalogInstruction(_playlist: AnimationEntry[]) {
  return '';
}

export function stripAssistantReplyMetadata(text: string): AssistantReplyParseResult {
  const block = findLastMetadataBlock(text);
  if (!block) {
    return parseStructuredReplyEnvelope(text) ?? { metadata: null, text: cleanupReplyText(text) };
  }

  if (block.closeIndex === -1) {
    return { metadata: null, text: cleanupReplyText(text.slice(0, block.openIndex)) };
  }

  const rawJson = text.slice(block.openIndex + block.open.length, block.closeIndex).trim();
  const before = text.slice(0, block.openIndex);
  const after = text.slice(block.closeIndex + block.close.length);

  return {
    metadata: normalizeReplyMetadata(rawJson),
    text: cleanupReplyText(`${before}${after}`),
  };
}

export function createAssistantMetadataStreamFilter() {
  let buffer = '';
  let suppressing = false;
  let activeCloseTag = ASSISTANT_REPLY_META_CLOSE;
  let metadataBuffer = '';
  let hiddenTextLength = 0;

  return {
    push(delta: string) {
      buffer += delta;
      let visible = '';

      while (buffer) {
        if (suppressing) {
          const closeIndex = buffer.indexOf(activeCloseTag);
          if (closeIndex === -1) {
            metadataBuffer += buffer;
            hiddenTextLength += buffer.length;
            buffer = '';
            break;
          }

          metadataBuffer += buffer.slice(0, closeIndex);
          hiddenTextLength += closeIndex;
          buffer = buffer.slice(closeIndex + activeCloseTag.length);
          suppressing = false;
          activeCloseTag = ASSISTANT_REPLY_META_CLOSE;
          continue;
        }

        const openMatch = findNextMetadataOpen(buffer);
        if (openMatch) {
          visible += buffer.slice(0, openMatch.index);
          buffer = buffer.slice(openMatch.index + openMatch.open.length);
          activeCloseTag = openMatch.close;
          suppressing = true;
          continue;
        }

        const safeLength = getSafeVisibleLength(buffer);
        if (safeLength <= 0) {
          break;
        }

        visible += buffer.slice(0, safeLength);
        buffer = buffer.slice(safeLength);
      }

      return visible;
    },
    finish(finalText?: string): AssistantReplyParseResult {
      const parsed = stripAssistantReplyMetadata(finalText ?? '');
      return {
        metadata: parsed.metadata ?? normalizeReplyMetadata(metadataBuffer),
        text: parsed.text,
      };
    },
    debug() {
      return {
        bufferLength: buffer.length,
        hiddenTextLength,
        metadataBufferLength: metadataBuffer.length,
        suppressing,
      };
    },
  };
}

export function createAssistantReplyStreamFilter() {
  const metadataFilter = createAssistantMetadataStreamFilter();
  const jsonMessageFilter = createJsonMessageStreamFilter();
  let mode: 'unknown' | 'metadata' | 'json' = 'unknown';
  let probe = '';

  return {
    push(delta: string) {
      if (!delta) {
        return '';
      }

      if (mode === 'metadata') {
        return metadataFilter.push(delta);
      }

      if (mode === 'json') {
        return jsonMessageFilter.push(delta);
      }

      probe += delta;
      const trimmedStart = probe.trimStart();
      if (!trimmedStart) {
        return '';
      }

      if (trimmedStart.startsWith('{')) {
        mode = 'json';
        const leadingWhitespaceLength = probe.length - trimmedStart.length;
        const payload = probe.slice(leadingWhitespaceLength);
        probe = '';
        return jsonMessageFilter.push(payload);
      }

      mode = 'metadata';
      const payload = probe;
      probe = '';
      return metadataFilter.push(payload);
    },
    finish(finalText?: string): AssistantReplyParseResult {
      if (mode === 'json') {
        return stripAssistantReplyMetadata(finalText ?? jsonMessageFilter.rawText());
      }
      if (mode === 'unknown' && finalText?.trimStart().startsWith('{')) {
        return stripAssistantReplyMetadata(finalText);
      }
      return metadataFilter.finish(finalText);
    },
    debug() {
      return {
        mode,
        probeLength: probe.length,
        ...metadataFilter.debug(),
      };
    },
  };
}

export function resolveAnimationIndexForReplyMetadata(
  metadata: AssistantReplyMetadata | null,
  playlist: AnimationEntry[],
) {
  if (!metadata || metadata.emotion === 'neutral' || playlist.length === 0) {
    return -1;
  }

  const emotionKeywords = EMOTION_ANIMATION_KEYWORDS[metadata.emotion].map(
    normalizeAnimationSearchText,
  );
  const candidates = playlist
    .map((entry, index) => ({
      entry,
      index,
      haystack: normalizeAnimationSearchText(
        `${entry.name} ${entry.id} ${entry.purpose ?? ''} ${(entry.tags ?? []).join(' ')}`,
      ),
    }))
    .filter((candidate) => candidate.entry.enabled && candidate.entry.purpose === 'emotion')
    .map((candidate) => {
      const semanticScore =
        scoreAnimationKeywords(candidate.haystack, emotionKeywords, 2) +
        (candidate.entry.purpose === 'emotion' &&
        emotionKeywords.some((keyword) => keyword && candidate.haystack.includes(keyword))
          ? 8
          : 0);
      return {
        ...candidate,
        semanticScore,
        score: getPurposeScore(candidate.entry) + semanticScore,
      };
    })
    .filter((candidate) => candidate.score > 0 && candidate.semanticScore > 0);

  candidates.sort((a, b) => {
    const aStable = a.entry.experimental ? 0 : 1;
    const bStable = b.entry.experimental ? 0 : 1;
    if (a.score !== b.score) return b.score - a.score;
    if (a.semanticScore !== b.semanticScore) return b.semanticScore - a.semanticScore;
    if (aStable !== bStable) return bStable - aStable;
    return a.index - b.index;
  });

  return candidates[0]?.index ?? -1;
}

export function resolveFacialExpressionForReplyMetadata(metadata: AssistantReplyMetadata | null) {
  if (!metadata) {
    return 'neutral';
  }
  return EMOTION_EXPRESSION_MAP[metadata.emotion] ?? 'neutral';
}

export function resolveFacialExpressionIntensityForReplyMetadata(
  metadata: AssistantReplyMetadata | null,
) {
  if (!metadata || metadata.emotion === 'neutral') {
    return 0;
  }
  return 0.58;
}

export function resolveFacialExpressionDurationMsForReplyMetadata(
  metadata: AssistantReplyMetadata | null,
) {
  if (!metadata || metadata.emotion === 'neutral') {
    return 800;
  }
  return 3200;
}

function normalizeReplyMetadata(rawJson: string): AssistantReplyMetadata | null {
  if (!rawJson.trim()) {
    return null;
  }

  try {
    return normalizeReplyMetadataRecord(JSON.parse(rawJson) as Record<string, unknown>);
  } catch {
    return null;
  }
}

function findLastMetadataBlock(text: string) {
  let match:
    | {
        close: string;
        closeIndex: number;
        open: string;
        openIndex: number;
      }
    | null = null;
  for (const delimiter of ASSISTANT_REPLY_META_DELIMITERS) {
    const openIndex = text.lastIndexOf(delimiter.open);
    if (openIndex === -1 || (match && openIndex < match.openIndex)) {
      continue;
    }
    match = {
      close: delimiter.close,
      closeIndex: text.indexOf(delimiter.close, openIndex + delimiter.open.length),
      open: delimiter.open,
      openIndex,
    };
  }
  return match;
}

function findNextMetadataOpen(text: string) {
  let match:
    | {
        close: string;
        index: number;
        open: string;
      }
    | null = null;
  for (const delimiter of ASSISTANT_REPLY_META_DELIMITERS) {
    const index = text.indexOf(delimiter.open);
    if (index === -1 || (match && index >= match.index)) {
      continue;
    }
    match = {
      close: delimiter.close,
      index,
      open: delimiter.open,
    };
  }
  return match;
}

function normalizeReplyMetadataRecord(parsed: Record<string, unknown>): AssistantReplyMetadata {
  const emotion = normalizeSetValue(parsed['emotion'], EMOTIONS, 'neutral');
  const fallback = getDefaultVadForEmotion(emotion);
  return {
    arousal: clampNumber(parsed['arousal'], 0, 1, fallback.arousal),
    dominance: clampNumber(parsed['dominance'], -1, 1, fallback.dominance),
    emotion,
    valence: clampNumber(parsed['valence'], -1, 1, fallback.valence),
  };
}

function getDefaultVadForEmotion(emotion: AssistantEmotion) {
  return EMOTION_VAD_DEFAULTS[emotion] ?? EMOTION_VAD_DEFAULTS.neutral;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function parseStructuredReplyEnvelope(text: string): AssistantReplyParseResult | null {
  const candidate = unwrapJsonText(text);
  if (!candidate) {
    return null;
  }

  try {
    const parsed = JSON.parse(candidate) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    const visibleText = readStructuredReplyText(record);
    if (!visibleText.found) {
      return null;
    }

    return {
      metadata: normalizeReplyMetadataRecord(record),
      text: cleanupReplyText(visibleText.text),
    };
  } catch {
    return null;
  }
}

function unwrapJsonText(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return '';
  }
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  return candidate.startsWith('{') && candidate.endsWith('}') ? candidate : '';
}

function readStructuredReplyText(record: Record<string, unknown>) {
  for (const key of [
    'reply',
    'text',
    'message',
    'content',
    'spoken',
    'spokenText',
    'visibleText',
    'dialogue',
    'response',
  ]) {
    const value = record[key];
    if (typeof value === 'string') {
      return { found: true, text: value };
    }
  }
  return { found: false, text: '' };
}

function getPurposeScore(entry: AnimationEntry) {
  if (entry.purpose === 'movement' || entry.purpose === 'pose') {
    return -8;
  }
  if (entry.purpose === 'emotion') {
    return 8;
  }
  if (entry.purpose === 'gesture') {
    return 3;
  }
  return 0;
}

function scoreAnimationKeywords(haystack: string, keywords: string[], multiplier: number) {
  return keywords.reduce((score, keyword, keywordIndex) => {
    if (!keyword || !haystack.includes(keyword)) {
      return score;
    }
    return score + Math.max(1, keywords.length - keywordIndex) * multiplier;
  }, 0);
}

function normalizeSetValue<T extends string>(value: unknown, allowed: Set<T>, fallback: T) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return allowed.has(normalized as T) ? (normalized as T) : fallback;
}

function cleanupReplyText(text: string) {
  return text
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

function createJsonMessageStreamFilter() {
  let raw = '';
  let state:
    | 'start'
    | 'keyStart'
    | 'key'
    | 'colon'
    | 'valueStart'
    | 'valueString'
    | 'skipValue'
    | 'afterValue' = 'start';
  let key = '';
  let activeKey = '';
  let keyEscape = false;
  let valueEscape = false;
  let unicodeEscape: string | null = null;
  let skipString = false;
  let skipEscape = false;
  let skipDepth = 0;

  const emitEscaped = (value: string) => {
    switch (value) {
      case '"':
      case '\\':
      case '/':
        return value;
      case 'b':
        return '\b';
      case 'f':
        return '\f';
      case 'n':
        return '\n';
      case 'r':
        return '\r';
      case 't':
        return '\t';
      default:
        return value;
    }
  };

  const push = (delta: string) => {
    raw += delta;
    let visible = '';

    for (const char of delta) {
      if (state === 'start') {
        if (/\s/.test(char)) continue;
        if (char === '{') state = 'keyStart';
        continue;
      }

      if (state === 'keyStart') {
        if (/\s|,/.test(char)) continue;
        if (char === '}') {
          state = 'afterValue';
          continue;
        }
        if (char === '"') {
          key = '';
          keyEscape = false;
          state = 'key';
        }
        continue;
      }

      if (state === 'key') {
        if (keyEscape) {
          key += emitEscaped(char);
          keyEscape = false;
          continue;
        }
        if (char === '\\') {
          keyEscape = true;
          continue;
        }
        if (char === '"') {
          activeKey = key;
          state = 'colon';
          continue;
        }
        key += char;
        continue;
      }

      if (state === 'colon') {
        if (/\s/.test(char)) continue;
        if (char === ':') state = 'valueStart';
        continue;
      }

      if (state === 'valueStart') {
        if (/\s/.test(char)) continue;
        if (char === '"') {
          valueEscape = false;
          unicodeEscape = null;
          state = 'valueString';
          continue;
        }
        skipString = false;
        skipEscape = false;
        skipDepth = char === '{' || char === '[' ? 1 : 0;
        state = 'skipValue';
        continue;
      }

      if (state === 'valueString') {
        if (unicodeEscape !== null) {
          unicodeEscape += char;
          if (unicodeEscape.length === 4) {
            if (activeKey === 'message') {
              visible += String.fromCharCode(Number.parseInt(unicodeEscape, 16));
            }
            unicodeEscape = null;
            valueEscape = false;
          }
          continue;
        }
        if (valueEscape) {
          if (char === 'u') {
            unicodeEscape = '';
            continue;
          }
          if (activeKey === 'message') {
            visible += emitEscaped(char);
          }
          valueEscape = false;
          continue;
        }
        if (char === '\\') {
          valueEscape = true;
          continue;
        }
        if (char === '"') {
          state = 'afterValue';
          continue;
        }
        if (activeKey === 'message') {
          visible += char;
        }
        continue;
      }

      if (state === 'skipValue') {
        if (skipString) {
          if (skipEscape) {
            skipEscape = false;
          } else if (char === '\\') {
            skipEscape = true;
          } else if (char === '"') {
            skipString = false;
          }
          continue;
        }
        if (char === '"') {
          skipString = true;
          continue;
        }
        if (char === '{' || char === '[') {
          skipDepth += 1;
          continue;
        }
        if (char === '}' || char === ']') {
          skipDepth -= 1;
          if (skipDepth <= 0) {
            state = 'afterValue';
          }
          continue;
        }
        if (skipDepth === 0 && (char === ',' || char === '}')) {
          state = char === ',' ? 'keyStart' : 'afterValue';
        }
        continue;
      }

      if (state === 'afterValue') {
        if (/\s/.test(char)) continue;
        if (char === ',') {
          state = 'keyStart';
        }
      }
    }

    return visible;
  };

  return {
    push,
    rawText() {
      return raw;
    },
  };
}

function getSafeVisibleLength(value: string) {
  const maxTail = Math.max(
    ...ASSISTANT_REPLY_META_DELIMITERS.map((delimiter) => delimiter.open.length - 1),
  );
  const maxLength = value.length;
  for (let tailLength = Math.min(maxTail, maxLength); tailLength > 0; tailLength -= 1) {
    const tail = value.slice(maxLength - tailLength);
    if (ASSISTANT_REPLY_META_DELIMITERS.some((delimiter) => delimiter.open.startsWith(tail))) {
      return maxLength - tailLength;
    }
  }
  return maxLength;
}

function normalizeAnimationSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/^cc0animation/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
