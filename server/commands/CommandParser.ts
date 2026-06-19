import type { TwitchChatMessage } from '../twitch/TwitchChatSource.js';
import {
  parseAuthorizedSharedStreamCommand,
  type SharedStreamCommand,
} from '../../src/shared/commandParsing';

export type StreamCommand = Exclude<
  SharedStreamCommand,
  { kind: 'audio' } | { kind: 'set-chat-overlay' }
>;

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
  'Commands: help, status, state, resetstate, refresh, channel <name>, persona <name>, personas, character <name>, llm <model>, vrm <id>, vrms, camera full|half|close, anim <name|index>, anims, anim start|stop|next|random, anim speed <n>, anim duration <sec>, tts on|off, autospeak on|off, say <text>, chat on|off.',
].join(' ');

export function getCommandHelp() {
  return HELP_TEXT;
}

export function parseStreamCommand(
  message: TwitchChatMessage,
  options: CommandParserOptions,
): CommandParseResult {
  const result = parseAuthorizedSharedStreamCommand(message, options, {
    chatCommandKind: 'set-chat-replies',
    enableAudioCommand: false,
  }, options.prefixes);
  return result.matched && result.authorized
    ? { ...result, command: result.command as StreamCommand }
    : result;
}
