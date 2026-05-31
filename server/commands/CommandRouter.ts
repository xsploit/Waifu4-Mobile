import type { ChatProvider } from '../ai/ChatProvider.js';
import { isPremiumCostModelId } from '../../src/lib/chat/provider-defaults';
import type { StreamBotEvent } from '../scheduler/ChatScheduler.js';
import type { TwitchChatMessage, TwitchChatSource } from '../twitch/TwitchChatSource.js';
import { getCommandHelp, parseStreamCommand } from './CommandParser.js';

export type CommandRouterOptions = {
  prefixes: string[];
  admins: string[];
  allowMods: boolean;
  sendChatReplies: boolean;
  provider: ChatProvider;
  getChatSource: () => TwitchChatSource;
  getStatus: () => {
    activeChatters: number;
    overlayClients: number;
    twitchMode: string;
  };
  emit: (event: StreamBotEvent) => void;
};

export class CommandRouter {
  private sendChatReplies: boolean;

  constructor(private readonly options: CommandRouterOptions) {
    this.sendChatReplies = options.sendChatReplies;
  }

  getSendChatReplies() {
    return this.sendChatReplies;
  }

  handleMessage(message: TwitchChatMessage) {
    const parsed = parseStreamCommand(message, {
      prefixes: this.options.prefixes,
      admins: this.options.admins,
      allowMods: this.options.allowMods,
    });

    if (!parsed.matched) {
      return false;
    }

    if (!parsed.authorized) {
      this.emitStatus('warning', `Ignored unauthorized command from ${message.displayName}.`);
      return true;
    }

    const command = parsed.command;
    switch (command.kind) {
      case 'help':
        this.reply(getCommandHelp());
        break;
      case 'status': {
        const status = this.options.getStatus();
        this.reply(
          `Status: chat=#${this.options.getChatSource().channel}, mode=${status.twitchMode}, active=${status.activeChatters}, overlays=${status.overlayClients}, model=${this.options.provider.getModel?.() ?? 'unknown'}, ${this.formatProviderState()}, chatReplies=${this.sendChatReplies ? 'on' : 'off'}.`,
        );
        break;
      }
      case 'ai-state':
        this.reply(`AI state: ${this.formatProviderState()}.`);
        break;
      case 'reset-ai-state':
        this.reply('Provider state is stateless; clear app context/memory from the overlay if needed.');
        break;
      case 'refresh':
        this.options.emit({ type: 'overlay:command', payload: { action: 'reload' } });
        this.reply('Refreshing the overlay.');
        break;
      case 'channel':
        this.options.getChatSource().switchChannel(command.channel);
        this.reply(`Switching Twitch chat to #${command.channel}.`);
        break;
      case 'set-ai-model':
        if (isPremiumCostModelId(command.model)) {
          this.reply('That high-cost model is blocked by default.');
          break;
        }
        this.options.provider.setModel?.(command.model);
        this.options.emit({
          type: 'overlay:command',
          payload: { action: 'set-ai-model', model: command.model },
        });
        this.reply(`LLM model set to ${command.model}.`);
        break;
      case 'list-personas':
        this.options.emit({ type: 'overlay:command', payload: { action: 'list-personas' } });
        this.reply('Asked overlay to list personas.');
        break;
      case 'set-persona':
        this.options.emit({
          type: 'overlay:command',
          payload: { action: 'set-persona', persona: command.selector },
        });
        this.reply(`Switching persona to ${command.selector}.`);
        break;
      case 'set-character':
        this.options.emit({
          type: 'overlay:command',
          payload: { action: 'set-character', selector: command.selector },
        });
        this.reply(`Switching character to ${command.selector}.`);
        break;
      case 'list-vrms':
        this.options.emit({ type: 'overlay:command', payload: { action: 'list-vrms' } });
        this.reply('Asked overlay to list bundled VRMs in its console.');
        break;
      case 'set-vrm':
        this.options.emit({
          type: 'overlay:command',
          payload: { action: 'load-vrm', model: command.model },
        });
        this.reply(`Loading VRM ${command.model}.`);
        break;
      case 'set-camera-view':
        this.options.emit({
          type: 'overlay:command',
          payload: { action: 'set-camera-view', viewMode: command.mode },
        });
        this.reply(
          `Camera framing set to ${command.mode === 'half-body' ? 'Half Body / Close' : 'Full Body'}.`,
        );
        break;
      case 'list-animations':
        this.options.emit({ type: 'overlay:command', payload: { action: 'list-animations' } });
        this.reply('Asked overlay to list animations in its console.');
        break;
      case 'play-animation':
        this.options.emit({
          type: 'overlay:command',
          payload: { action: 'play-animation', selector: command.selector },
        });
        this.reply(`Playing animation ${command.selector}.`);
        break;
      case 'sequencer':
        this.options.emit({
          type: 'overlay:command',
          payload: { action: 'sequencer', command: command.action },
        });
        this.reply(`Animation sequencer ${command.action}.`);
        break;
      case 'set-animation-speed':
        this.options.emit({
          type: 'overlay:command',
          payload: { action: 'set-animation-speed', speed: command.speed },
        });
        this.reply(`Animation speed set to ${command.speed}.`);
        break;
      case 'set-animation-duration':
        this.options.emit({
          type: 'overlay:command',
          payload: { action: 'set-animation-duration', duration: command.duration },
        });
        this.reply(`Animation duration set to ${command.duration}s.`);
        break;
      case 'set-tts':
        this.options.emit({
          type: 'overlay:command',
          payload: { action: 'set-tts', enabled: command.enabled },
        });
        this.reply(`TTS ${command.enabled ? 'enabled' : 'disabled'}.`);
        break;
      case 'set-auto-speak':
        this.options.emit({
          type: 'overlay:command',
          payload: { action: 'set-auto-speak', enabled: command.enabled },
        });
        this.reply(`Auto-speak ${command.enabled ? 'enabled' : 'disabled'}.`);
        break;
      case 'say':
        this.options.emit({
          type: 'overlay:command',
          payload: { action: 'say', text: command.text },
        });
        this.reply('Sending manual line to the overlay.');
        break;
      case 'set-chat-replies':
        this.sendChatReplies = command.enabled;
        this.reply(`Twitch chat replies ${command.enabled ? 'enabled' : 'disabled'}.`);
        break;
    }

    return true;
  }

  private reply(message: string) {
    this.options.emit({
      type: 'command:response',
      payload: {
        text: message,
        sendToChat: this.sendChatReplies,
      },
    });
    this.emitStatus('info', message);
    if (this.sendChatReplies) {
      this.options.getChatSource().sendMessage(message);
    }
  }

  private emitStatus(level: 'info' | 'warning' | 'error', message: string) {
    this.options.emit({ type: 'system:status', payload: { level, message } });
  }

  private formatProviderState() {
    const state = this.options.provider.getState?.();
    if (!state) {
      return 'state=unavailable';
    }

    const stateMode = typeof state['stateMode'] === 'string' ? state['stateMode'] : 'unknown';
    const cachedTokens = typeof state['cachedTokens'] === 'number' ? state['cachedTokens'] : 0;
    return `state=${stateMode}, owner=app-context, cachedTokens=${cachedTokens}`;
  }
}
