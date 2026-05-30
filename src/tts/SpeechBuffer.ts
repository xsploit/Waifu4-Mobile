export type SpeechBufferOptions = {
  minChars?: number;
  maxChars?: number;
};

export function createSpeechBuffer(options: SpeechBufferOptions = {}) {
  const minChars = options.minChars ?? 24;
  const maxChars = options.maxChars ?? 180;
  let buffer = '';

  function takeSegment(force: boolean): string | null {
    const trimmed = buffer.trimStart();
    const trimDelta = buffer.length - trimmed.length;
    buffer = trimmed;
    if (!buffer) {
      return null;
    }

    const punctuation = /[.!?。！？](?:["')\]]+)?(?:\s|$)/g;
    let match: RegExpExecArray | null;
    while ((match = punctuation.exec(buffer))) {
      const end = match.index + match[0].length;
      if (end >= minChars || force) {
        const segment = buffer.slice(0, end).trim();
        buffer = buffer.slice(end);
        return segment;
      }
    }

    if (buffer.length >= maxChars) {
      const end = buffer.lastIndexOf(' ', maxChars);
      const cut = end >= minChars ? end : maxChars;
      const segment = buffer.slice(0, cut).trim();
      buffer = buffer.slice(cut);
      return segment;
    }

    if (force) {
      const segment = buffer.trim();
      buffer = '';
      return segment || null;
    }

    if (trimDelta > 0) {
      buffer = `${' '.repeat(trimDelta)}${buffer}`;
    }
    return null;
  }

  return {
    push(text: string): string[] {
      buffer += text;
      const segments: string[] = [];
      for (;;) {
        const segment = takeSegment(false);
        if (!segment) {
          break;
        }
        segments.push(segment);
      }
      return segments;
    },
    flush(): string[] {
      const segments: string[] = [];
      for (;;) {
        const segment = takeSegment(true);
        if (!segment) {
          break;
        }
        segments.push(segment);
      }
      return segments;
    },
  };
}
