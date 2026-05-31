import type { TwitchChatMessage } from '../twitch/TwitchChatSource.js';

export type StreamCommand =
  | { kind: 'help' }
  | { kind: 'status' }
  | { kind: 'refresh' }
  | { kind: 'ai-state' }
  | { kind: 'reset-ai-state' }
  | { kind: 'channel'; channel: string }
  | { kind: 'set-ai-model'; model: string }
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
  | { kind: 'set-chat-replies'; enabled: boolean };

export type CommandParseResult =
  | { matched: false }
  | { matched: true; authorized: false; commandText: string }
  | { matched: true; authorized: true; command: StreamCommand; commandText: string };

export type CommandParserOptions = {
  prefixes: string[];
  admins: string[];
  allowMods: boolean;
};

const HELP_TEXT = [
  'Commands: help, status, state, resetstate, refresh, channel <name>, llm <model>, vrm <id>, vrms, camera full|half|close, anim <name|index>, anims, anim start|stop|next|random, anim speed <n>, anim duration <sec>, tts on|off, autospeak on|off, say <text>, chat on|off.',
].join(' ');

function normalizeLogin(value: string) {
  return value.trim().toLowerCase().replace(/^@/, '');
}

function normalizePrefix(value: string) {
  return value.trim().toLowerCase();
}

function parseBoolean(value: string | undefined) {
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

function tokenize(input: string) {
  const tokens: string[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(input)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3] ?? '');
  }
  return tokens;
}

export function getCommandHelp() {
  return HELP_TEXT;
}

export function isCommandAuthorized(message: TwitchChatMessage, options: CommandParserOptions) {
  const admins = new Set(options.admins.map(normalizeLogin).filter(Boolean));
  return (
    admins.has(normalizeLogin(message.user)) ||
    message.isBroadcaster ||
    (options.allowMods && message.isMod)
  );
}

export function parseStreamCommand(
  message: TwitchChatMessage,
  options: CommandParserOptions,
): CommandParseResult {
  const text = message.text.trim();
  const prefix = options.prefixes
    .map(normalizePrefix)
    .filter(Boolean)
    .find((candidate) => {
      const lowerText = text.toLowerCase();
      return lowerText === candidate || lowerText.startsWith(`${candidate} `);
    });

  if (!prefix) {
    return { matched: false };
  }

  const commandText = text.slice(prefix.length).trim();
  if (!isCommandAuthorized(message, options)) {
    return { matched: true, authorized: false, commandText };
  }

  const tokens = tokenize(commandText);
  const verb = (tokens.shift() ?? 'help').toLowerCase();
  const rest = tokens.join(' ').trim();

  if (verb === 'help' || verb === '?')
    return { matched: true, authorized: true, commandText, command: { kind: 'help' } };
  if (verb === 'status')
    return { matched: true, authorized: true, commandText, command: { kind: 'status' } };
  if (['state', 'aistate', 'ai-state'].includes(verb)) {
    const subcommand = (tokens[0] ?? '').toLowerCase();
    if (['reset', 'clear', 'restart'].includes(subcommand)) {
      return { matched: true, authorized: true, commandText, command: { kind: 'reset-ai-state' } };
    }
    return { matched: true, authorized: true, commandText, command: { kind: 'ai-state' } };
  }
  if (['resetstate', 'reset-state', 'reset-ai-state', 'clearstate', 'clear-state'].includes(verb)) {
    return { matched: true, authorized: true, commandText, command: { kind: 'reset-ai-state' } };
  }
  if (['refresh', 'reload', 'restart'].includes(verb)) {
    return { matched: true, authorized: true, commandText, command: { kind: 'refresh' } };
  }
  if (['channel', 'join', 'room'].includes(verb) && rest) {
    return {
      matched: true,
      authorized: true,
      commandText,
      command: { kind: 'channel', channel: rest.replace(/^#/, '').toLowerCase() },
    };
  }
  if (['llm', 'model', 'ai'].includes(verb) && rest) {
    return {
      matched: true,
      authorized: true,
      commandText,
      command: { kind: 'set-ai-model', model: rest },
    };
  }
  if (verb === 'vrms')
    return { matched: true, authorized: true, commandText, command: { kind: 'list-vrms' } };
  if (['vrm', 'avatar', 'character'].includes(verb) && rest) {
    return {
      matched: true,
      authorized: true,
      commandText,
      command: { kind: 'set-vrm', model: rest },
    };
  }
  if (['camera', 'frame', 'framing'].includes(verb)) {
    const mode = (tokens[0] ?? '').toLowerCase();
    if (['full', 'full-body', 'fullbody', 'body'].includes(mode)) {
      return {
        matched: true,
        authorized: true,
        commandText,
        command: { kind: 'set-camera-view', mode: 'full-body' },
      };
    }
    if (['half', 'half-body', 'halfbody', 'close', 'closeup', 'close-up'].includes(mode)) {
      return {
        matched: true,
        authorized: true,
        commandText,
        command: { kind: 'set-camera-view', mode: 'half-body' },
      };
    }
  }
  if (['anims', 'animations'].includes(verb)) {
    return { matched: true, authorized: true, commandText, command: { kind: 'list-animations' } };
  }
  if (['anim', 'animation', 'dance'].includes(verb)) {
    const subcommand = (tokens[0] ?? '').toLowerCase();
    if (['start', 'stop', 'next', 'random'].includes(subcommand)) {
      return {
        matched: true,
        authorized: true,
        commandText,
        command: { kind: 'sequencer', action: subcommand as 'start' | 'stop' | 'next' | 'random' },
      };
    }
    if (subcommand === 'speed') {
      const speed = Number.parseFloat(tokens[1] ?? '');
      if (Number.isFinite(speed)) {
        return {
          matched: true,
          authorized: true,
          commandText,
          command: { kind: 'set-animation-speed', speed },
        };
      }
    }
    if (['duration', 'time'].includes(subcommand)) {
      const duration = Number.parseFloat(tokens[1] ?? '');
      if (Number.isFinite(duration)) {
        return {
          matched: true,
          authorized: true,
          commandText,
          command: { kind: 'set-animation-duration', duration },
        };
      }
    }
    if (rest) {
      return {
        matched: true,
        authorized: true,
        commandText,
        command: { kind: 'play-animation', selector: rest },
      };
    }
  }
  if (verb === 'tts') {
    const enabled = parseBoolean(tokens[0]);
    if (enabled !== null)
      return {
        matched: true,
        authorized: true,
        commandText,
        command: { kind: 'set-tts', enabled },
      };
  }
  if (['autospeak', 'autosay'].includes(verb)) {
    const enabled = parseBoolean(tokens[0]);
    if (enabled !== null) {
      return {
        matched: true,
        authorized: true,
        commandText,
        command: { kind: 'set-auto-speak', enabled },
      };
    }
  }
  if (verb === 'say' && rest)
    return { matched: true, authorized: true, commandText, command: { kind: 'say', text: rest } };
  if (['chat', 'reply', 'replies'].includes(verb)) {
    const enabled = parseBoolean(tokens[0]);
    if (enabled !== null) {
      return {
        matched: true,
        authorized: true,
        commandText,
        command: { kind: 'set-chat-replies', enabled },
      };
    }
  }

  return { matched: true, authorized: true, commandText, command: { kind: 'help' } };
}
