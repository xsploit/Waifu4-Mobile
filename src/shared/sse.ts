export type SseEvent = { event: string; data: string };

/** Serialize one named SSE event with a JSON payload. */
export function formatSseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function parseBlock(block: string): SseEvent | null {
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      let rest = line.slice(5);
      if (rest.startsWith(' ')) {
        rest = rest.slice(1);
      }
      dataLines.push(rest);
    }
  }
  return dataLines.length > 0 ? { event, data: dataLines.join('\n') } : null;
}

/** Incremental SSE parser: feed raw stream chunks, get back complete events. */
export function createSseParser() {
  let buffer = '';
  return {
    push(chunk: string): SseEvent[] {
      buffer += chunk;
      const events: SseEvent[] = [];
      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const ev = parseBlock(block);
        if (ev) {
          events.push(ev);
        }
      }
      return events;
    },
  };
}
