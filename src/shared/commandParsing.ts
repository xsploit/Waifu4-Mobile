export type CommandAuthMessage = {
  isBroadcaster: boolean;
  isMod: boolean;
  isTrustedController?: boolean;
  user: string;
};

export type CommandAuthOptions = {
  admins: string[];
  allowMods: boolean;
  allowTrustedControllers?: boolean;
};

export type SharedStreamCommand =
  | { kind: 'help' }
  | { kind: 'status' }
  | { kind: 'audio' }
  | { kind: 'refresh' }
  | { kind: 'ai-state' }
  | { kind: 'reset-ai-state' }
  | { kind: 'channel'; channel: string }
  | { kind: 'set-ai-model'; model: string }
  | { kind: 'list-personas' }
  | { kind: 'set-persona'; selector: string }
  | { kind: 'set-character'; selector: string }
  | { kind: 'list-vrms' }
  | { kind: 'set-vrm'; model: string }
  | { kind: 'set-camera-view'; mode: 'full-body' | 'half-body' }
  | { kind: 'list-animations' }
  | { kind: 'play-animation'; selector: string }
  | { kind: 'sequencer'; action: 'start' | 'stop' | 'next' | 'random' }
  | { kind: 'set-animation-speed'; speed: number }
  | { kind: 'set-animation-duration'; duration: number }
  | { kind: 'set-tts'; enabled: boolean }
  | { kind: 'set-auto-speak'; enabled: boolean }
  | { kind: 'say'; text: string }
  | { kind: 'set-chat-overlay'; enabled: boolean }
  | { kind: 'set-chat-replies'; enabled: boolean };

export type SharedStreamCommandParseOptions = {
  chatCommandKind: 'set-chat-overlay' | 'set-chat-replies';
  enableAudioCommand?: boolean;
};

export type SharedStreamCommandParseResult =
  | { matched: false }
  | { matched: true; authorized: false; commandText: string }
  | { matched: true; authorized: true; command: SharedStreamCommand; commandText: string };

function normalizeCommandLogin(value: string) {
  return value.trim().toLowerCase().replace(/^@/, '');
}

function normalizeCommandPrefix(value: string) {
  return value.trim().toLowerCase();
}

function parseCommandBoolean(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (['on', 'yes', 'true', '1', 'enable', 'enabled'].includes(normalized)) {
    return true;
  }
  if (['off', 'no', 'false', '0', 'disable', 'disabled'].includes(normalized)) {
    return false;
  }
  return null;
}

function tokenizeCommand(input: string) {
  const tokens: string[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(input)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3] ?? '');
  }
  return tokens;
}

export function isStreamCommandAuthorized(
  message: CommandAuthMessage,
  options: CommandAuthOptions,
) {
  const admins = new Set(options.admins.map(normalizeCommandLogin).filter(Boolean));
  return (
    admins.has(normalizeCommandLogin(message.user)) ||
    message.isBroadcaster ||
    (options.allowMods && message.isMod) ||
    (options.allowTrustedControllers === true && message.isTrustedController === true)
  );
}

function parseSharedStreamCommand(
  commandText: string,
  options: SharedStreamCommandParseOptions,
): SharedStreamCommand {
  const tokens = tokenizeCommand(commandText);
  const verb = (tokens.shift() ?? 'help').toLowerCase();
  const rest = tokens.join(' ').trim();

  if (verb === 'help' || verb === '?') {
    return { kind: 'help' };
  }
  if (verb === 'status') {
    return { kind: 'status' };
  }
  if (options.enableAudioCommand && verb === 'audio') {
    return { kind: 'audio' };
  }
  if (['state', 'aistate', 'ai-state'].includes(verb)) {
    const subcommand = (tokens[0] ?? '').toLowerCase();
    return ['reset', 'clear', 'restart'].includes(subcommand)
      ? { kind: 'reset-ai-state' }
      : { kind: 'ai-state' };
  }
  if (['resetstate', 'reset-state', 'reset-ai-state', 'clearstate', 'clear-state'].includes(verb)) {
    return { kind: 'reset-ai-state' };
  }
  if (['refresh', 'reload', 'restart'].includes(verb)) {
    return { kind: 'refresh' };
  }
  if (['channel', 'join', 'room'].includes(verb) && rest) {
    return { kind: 'channel', channel: rest.replace(/^#/, '').toLowerCase() };
  }
  if (['llm', 'model', 'ai'].includes(verb) && rest) {
    return { kind: 'set-ai-model', model: rest };
  }
  if (['personas', 'personalities', 'profiles'].includes(verb)) {
    return { kind: 'list-personas' };
  }
  if (['persona', 'personality', 'profile'].includes(verb) && rest) {
    return { kind: 'set-persona', selector: rest };
  }
  if (['character', 'char'].includes(verb) && rest) {
    return { kind: 'set-character', selector: rest };
  }
  if (verb === 'vrms') {
    return { kind: 'list-vrms' };
  }
  if (['vrm', 'avatar'].includes(verb) && rest) {
    return { kind: 'set-vrm', model: rest };
  }
  if (['camera', 'frame', 'framing'].includes(verb)) {
    const mode = (tokens[0] ?? '').toLowerCase();
    if (['full', 'full-body', 'fullbody', 'body'].includes(mode)) {
      return { kind: 'set-camera-view', mode: 'full-body' };
    }
    if (['half', 'half-body', 'halfbody', 'close', 'closeup', 'close-up'].includes(mode)) {
      return { kind: 'set-camera-view', mode: 'half-body' };
    }
  }
  if (['anims', 'animations'].includes(verb)) {
    return { kind: 'list-animations' };
  }
  if (['anim', 'animation', 'dance'].includes(verb)) {
    const subcommand = (tokens[0] ?? '').toLowerCase();
    if (['start', 'stop', 'next', 'random'].includes(subcommand)) {
      return { kind: 'sequencer', action: subcommand as 'start' | 'stop' | 'next' | 'random' };
    }
    if (subcommand === 'speed') {
      const speed = Number.parseFloat(tokens[1] ?? '');
      if (Number.isFinite(speed)) {
        return { kind: 'set-animation-speed', speed };
      }
    }
    if (['duration', 'time'].includes(subcommand)) {
      const duration = Number.parseFloat(tokens[1] ?? '');
      if (Number.isFinite(duration)) {
        return { kind: 'set-animation-duration', duration };
      }
    }
    if (rest) {
      return { kind: 'play-animation', selector: rest };
    }
  }
  if (verb === 'tts') {
    const enabled = parseCommandBoolean(tokens[0]);
    if (enabled !== null) {
      return { kind: 'set-tts', enabled };
    }
  }
  if (['autospeak', 'autosay'].includes(verb)) {
    const enabled = parseCommandBoolean(tokens[0]);
    if (enabled !== null) {
      return { kind: 'set-auto-speak', enabled };
    }
  }
  if (verb === 'say' && rest) {
    return { kind: 'say', text: rest };
  }
  if (['chat', 'reply', 'replies'].includes(verb)) {
    const enabled = parseCommandBoolean(tokens[0]);
    if (enabled !== null) {
      return { kind: options.chatCommandKind, enabled };
    }
  }

  return { kind: 'help' };
}

export function parseAuthorizedSharedStreamCommand(
  message: CommandAuthMessage & { text: string },
  authOptions: CommandAuthOptions,
  parseOptions: SharedStreamCommandParseOptions,
  prefixes: string[],
): SharedStreamCommandParseResult {
  const text = message.text.trim();
  const prefix = prefixes
    .map(normalizeCommandPrefix)
    .filter(Boolean)
    .find((candidate) => {
      const lowerText = text.toLowerCase();
      return lowerText === candidate || lowerText.startsWith(`${candidate} `);
    });

  if (!prefix) {
    return { matched: false };
  }

  const commandText = text.slice(prefix.length).trim();
  if (!isStreamCommandAuthorized(message, authOptions)) {
    return { matched: true, authorized: false, commandText };
  }

  return {
    matched: true,
    authorized: true,
    command: parseSharedStreamCommand(commandText, parseOptions),
    commandText,
  };
}
