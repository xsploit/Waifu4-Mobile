export type TwitchChatMessage = {
  id: string;
  user: string;
  displayName: string;
  text: string;
  timestamp: number;
  badges: string[];
  isMod: boolean;
  isBroadcaster: boolean;
};

export type TwitchChatMembershipEvent = {
  id: string;
  type: 'join' | 'part';
  user: string;
  displayName: string;
  channel: string;
  timestamp: number;
};

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
