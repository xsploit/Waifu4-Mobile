import type { StreamTwitchChatMessage, StreamTwitchMembershipEvent } from '../../src/shared/streamEvents';

export type TwitchChatMessage = StreamTwitchChatMessage;
export type TwitchChatMembershipEvent = StreamTwitchMembershipEvent;

export type TwitchChatStatus = {
  level: 'info' | 'warning' | 'error';
  message: string;
};

export type TwitchChatSourceHandlers = {
  onMembership?(event: TwitchChatMembershipEvent): void;
  onMessage(message: TwitchChatMessage): void;
  onStatus(status: TwitchChatStatus): void;
};

export interface TwitchChatSource {
  readonly channel: string;
  start(): void;
  stop(): void;
  switchChannel(channel: string): void;
  sendMessage(text: string): void;
}
