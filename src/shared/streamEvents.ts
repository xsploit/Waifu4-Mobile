export type StreamTwitchChatMessage = {
  id: string;
  user: string;
  displayName: string;
  text: string;
  timestamp: number;
  badges: string[];
  isMod: boolean;
  isBroadcaster: boolean;
};

export type StreamTwitchMembershipEvent = {
  id: string;
  type: 'join' | 'part';
  user: string;
  displayName: string;
  channel: string;
  timestamp: number;
};

export type StreamOverlayCommand =
  | { action: 'reload' }
  | { action: 'set-ai-model'; model: string }
  | { action: 'list-personas' }
  | { action: 'set-persona'; persona: string }
  | { action: 'set-character'; selector: string }
  | { action: 'list-vrms' }
  | { action: 'load-vrm'; model: string }
  | { action: 'set-camera-view'; viewMode: 'full-body' | 'half-body' }
  | { action: 'list-animations' }
  | { action: 'play-animation'; selector: string }
  | { action: 'sequencer'; command: 'start' | 'stop' | 'next' | 'random' }
  | { action: 'set-animation-speed'; speed: number }
  | { action: 'set-animation-duration'; duration: number }
  | { action: 'set-tts'; enabled: boolean }
  | { action: 'set-auto-speak'; enabled: boolean }
  | { action: 'say'; text: string };

export type StreamBotEvent<
  TMessage extends StreamTwitchChatMessage = StreamTwitchChatMessage,
  TMembership extends StreamTwitchMembershipEvent = StreamTwitchMembershipEvent,
> =
  | { type: 'chat:message'; payload: TMessage }
  | { type: 'twitch:membership'; payload: TMembership }
  | {
      type: 'chat:batch';
      payload: {
        activeChatters: number;
        batchSize: number;
        messages: TMessage[];
      };
    }
  | {
      type: 'ai:thinking';
      payload: {
        jobId: string;
        mode: 'direct' | 'batch';
        activeChatters: number;
      };
    }
  | {
      type: 'ai:delta';
      payload: {
        jobId: string;
        mode: 'direct' | 'batch';
        delta: string;
      };
    }
  | {
      type: 'ai:reply';
      payload: {
        jobId: string;
        mode: 'direct' | 'batch';
        text: string;
        target?: TMessage;
      };
    }
  | { type: 'overlay:command'; payload: StreamOverlayCommand }
  | { type: 'command:response'; payload: { text: string; sendToChat: boolean } }
  | { type: 'system:status'; payload: { level: 'info' | 'warning' | 'error'; message: string } };
