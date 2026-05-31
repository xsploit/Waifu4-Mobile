export type ParsedIrcMessage = {
  raw: string;
  tags: Record<string, string>;
  prefix?: string;
  command: string;
  params: string[];
  trailing?: string;
};

function unescapeTagValue(value: string) {
  return value
    .replace(/\\s/g, ' ')
    .replace(/\\:/g, ';')
    .replace(/\\r/g, '\r')
    .replace(/\\n/g, '\n')
    .replace(/\\\\/g, '\\');
}

function parseTags(rawTags: string) {
  const tags: Record<string, string> = {};
  for (const pair of rawTags.split(';')) {
    const separatorIndex = pair.indexOf('=');
    if (separatorIndex === -1) {
      tags[pair] = '';
      continue;
    }

    const key = pair.slice(0, separatorIndex);
    tags[key] = unescapeTagValue(pair.slice(separatorIndex + 1));
  }
  return tags;
}

export function parseIrcMessage(raw: string): ParsedIrcMessage | null {
  let rest = raw.trim();
  if (!rest) {
    return null;
  }

  const tags: Record<string, string> = {};
  let prefix: string | undefined;

  if (rest.startsWith('@')) {
    const spaceIndex = rest.indexOf(' ');
    if (spaceIndex === -1) {
      return null;
    }
    Object.assign(tags, parseTags(rest.slice(1, spaceIndex)));
    rest = rest.slice(spaceIndex + 1);
  }

  if (rest.startsWith(':')) {
    const spaceIndex = rest.indexOf(' ');
    if (spaceIndex === -1) {
      return null;
    }
    prefix = rest.slice(1, spaceIndex);
    rest = rest.slice(spaceIndex + 1);
  }

  let trailing: string | undefined;
  const trailingIndex = rest.indexOf(' :');
  if (trailingIndex !== -1) {
    trailing = rest.slice(trailingIndex + 2);
    rest = rest.slice(0, trailingIndex);
  }

  const parts = rest.split(/\s+/).filter(Boolean);
  const command = parts.shift();
  if (!command) {
    return null;
  }

  return {
    raw,
    tags,
    prefix,
    command,
    params: parts,
    trailing,
  };
}

export function splitIrcFrames(data: string) {
  return data.split(/\r?\n/).filter((line) => line.trim().length > 0);
}
