import {
  isStreamCommandAuthorized,
  parseAuthorizedSharedStreamCommand,
  type SharedStreamCommand,
} from '../../shared/commandParsing';

export type StreamCommandMessage = {
  displayName: string;
  isBroadcaster: boolean;
  isMod: boolean;
  isTrustedController?: boolean;
  text: string;
  user: string;
};

export type DirectStreamCommand = Exclude<SharedStreamCommand, { kind: 'set-chat-replies' }>;

export type DirectStreamCommandParseResult =
  | { matched: false }
  | { matched: true; authorized: false; commandText: string }
  | { matched: true; authorized: true; command: DirectStreamCommand; commandText: string };

export type DirectStreamCommandParserOptions = {
  admins: string[];
  allowMods: boolean;
  allowTrustedControllers: boolean;
  prefixes: string[];
};

const HELP_TEXT =
  'Commands: status, audio, state, state reset, refresh, channel <name>, persona <riko|neuro|hikari>, personas, llm <model>, vrm <id>, vrms, camera full|half|close, anim <name|index>, anims, anim start|stop|next|random, anim speed <n>, anim duration <sec>, tts on|off, autospeak on|off, say <text>, chat on|off.';

export function getDirectStreamCommandHelp() {
  return HELP_TEXT;
}

export function isDirectStreamCommandAuthorized(
  message: StreamCommandMessage,
  options: Pick<
    DirectStreamCommandParserOptions,
    'admins' | 'allowMods' | 'allowTrustedControllers'
  >,
) {
  return isStreamCommandAuthorized(message, options);
}

export function parseDirectStreamCommand(
  message: StreamCommandMessage,
  options: DirectStreamCommandParserOptions,
): DirectStreamCommandParseResult {
  const result = parseAuthorizedSharedStreamCommand(message, options, {
    chatCommandKind: 'set-chat-overlay',
    enableAudioCommand: true,
  }, options.prefixes);
  return result.matched && result.authorized
    ? { ...result, command: result.command as DirectStreamCommand }
    : result;
}
