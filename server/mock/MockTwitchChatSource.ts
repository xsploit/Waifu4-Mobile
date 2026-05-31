import type {
  TwitchChatMessage,
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
  private started = false;

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
    this.started = true;
    this.handlers.onStatus({
        level: 'info',
        message: `Mock Twitch chat source started for #${this.currentChannel}.`,
      });
  }

  stop() {
    this.started = false;
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

  inject(input: MockChatInjection) {
    if (!this.started) {
      this.start();
    }

    const user = (input.user || input.displayName || `viewer${Math.floor(Math.random() * 10000)}`)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_');
    const displayName = input.displayName?.trim() || user;
    const badges = input.badges ?? [];
    const message: TwitchChatMessage = {
      id: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      user,
      displayName,
      text: input.text?.trim() || 'hello @yourwifey',
      timestamp: Date.now(),
      badges,
      isMod: input.isMod ?? badges.some((badge) => badge.startsWith('moderator/')),
      isBroadcaster: input.isBroadcaster ?? badges.some((badge) => badge.startsWith('broadcaster/')),
    };
    this.handlers.onMessage(message);
  }
}
