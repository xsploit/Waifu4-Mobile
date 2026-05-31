function normalizeChunk(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

const MIN_SENTENCE_CHUNK_LENGTH = 10;
const MIN_CLAUSE_CHUNK_LENGTH = 44;
const MIN_WORD_CHUNK_LENGTH = 34;
const HARD_CHUNK_LENGTH = 68;

function findLastWordBoundary(text: string, maxLength: number) {
  const search = text.slice(0, maxLength + 1);
  for (let index = search.length - 1; index >= MIN_WORD_CHUNK_LENGTH; index -= 1) {
    if (/\s/.test(search[index] ?? '')) {
      return index + 1;
    }
  }
  return -1;
}

function findChunkBoundary(text: string, force = false) {
  const trimmed = text.trim();
  if (!trimmed) {
    return -1;
  }

  const sentenceMatch = text.match(/^[\s\S]{6,}?[.!?]["')\]]?(?=\s|$)/);
  if (sentenceMatch && sentenceMatch[0].trim().length >= MIN_SENTENCE_CHUNK_LENGTH) {
    return sentenceMatch[0].length;
  }

  if (text.length >= MIN_CLAUSE_CHUNK_LENGTH) {
    let best = -1;
    const clauseRegex = /[,;:]\s+|[-]\s+/g;
    for (const match of text.matchAll(clauseRegex)) {
      if (match.index != null && match.index >= MIN_WORD_CHUNK_LENGTH) {
        best = match.index + match[0].length;
      }
    }
    if (best !== -1) {
      return best;
    }
  }

  if (text.length >= HARD_CHUNK_LENGTH) {
    const wordBoundary = findLastWordBoundary(text, HARD_CHUNK_LENGTH);
    return wordBoundary !== -1 ? wordBoundary : HARD_CHUNK_LENGTH;
  }

  if (force) {
    return text.length;
  }

  return -1;
}

export function extractSpeakableChunks(text: string, force = false) {
  const chunks: string[] = [];
  let remaining = text;

  while (true) {
    const boundary = findChunkBoundary(remaining, force);
    if (boundary === -1) {
      break;
    }

    const nextChunk = normalizeChunk(remaining.slice(0, boundary));
    remaining = remaining.slice(boundary).replace(/^\s+/, '');

    if (nextChunk) {
      chunks.push(nextChunk);
    }

    if (force && !remaining.trim()) {
      break;
    }
  }

  return { chunks, remaining };
}

export function getChunkRevealDelay(chunk: string) {
  const sentenceCount = Math.max((chunk.match(/[.!?]/g) ?? []).length, 1);
  const ms = 60 + sentenceCount * 45 + Math.min(chunk.length * 1.25, 220);
  return Math.min(Math.max(ms, 85), 280);
}
