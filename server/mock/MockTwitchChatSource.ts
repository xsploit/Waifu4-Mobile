import type {
  TwitchChatSource,
  TwitchChatSourceHandlers,
} from '../twitch/TwitchChatSource.js';

export type MockChatInjection = {
  user?: string;
  displayName?: string;
  text?: string;
  badges?: string[];
  isMod?: boolean;
  isBroadcaster?: boolean;
};

export class MockTwitchChatSource implements TwitchChatSource {
  private currentChannel: string;

  constructor(
    channel: string,
    private readonly handlers: TwitchChatSourceHandlers,
  ) {
    this.currentChannel = channel.trim().toLowerCase().replace(/^#/, '') || 'mock-channel';
  }

  get channel() {
    return this.currentChannel;
  }

  start() {
    this.handlers.onStatus({
        level: 'info',
        message: `Mock Twitch chat source started for #${this.currentChannel}.`,
      });
  }

  stop() {
    this.handlers.onStatus({ level: 'info', message: 'Mock Twitch chat source stopped.' });
  }

  sendMessage(text: string) {
    this.handlers.onStatus({
      level: 'info',
      message: `Mock Twitch send to #${this.currentChannel}: ${text.slice(0, 80)}`,
    });
  }

  switchChannel(channel: string) {
    const nextChannel = channel.trim().toLowerCase().replace(/^#/, '');
    if (!nextChannel) {
      return;
    }
    const previousChannel = this.currentChannel;
    this.currentChannel = nextChannel;
    this.handlers.onStatus({
      level: 'info',
      message: `Mock Twitch channel switched from #${previousChannel} to #${this.currentChannel}.`,
    });
  }

}
