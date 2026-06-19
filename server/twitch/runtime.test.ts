import { describe, expect, it } from 'vitest';
import type { ChatProvider, ChatProviderRequest } from '../ai/ChatProvider.js';
import type { StreamBotEvent } from '../../src/shared/streamEvents';
import { createTwitchRuntime } from './runtime.js';

class CapturingProvider implements ChatProvider {
  requests: ChatProviderRequest[] = [];
  model = 'openai/gpt-5-nano';

  async complete(request: ChatProviderRequest) {
    this.requests.push(request);
    return { text: 'hello from runtime' };
  }

  async completeStream(request: ChatProviderRequest, handlers?: { onTextDelta?: (delta: string) => void }) {
    this.requests.push(request);
    handlers?.onTextDelta?.('hello ');
    handlers?.onTextDelta?.('from runtime');
    return { text: 'hello from runtime' };
  }

  getModel() {
    return this.model;
  }

  setModel(model: string) {
    this.model = model;
  }

  getState() {
    return { stateMode: 'stateless', cachedTokens: 0 };
  }
}

describe('Twitch runtime wiring', () => {
  it('routes mock chat through commands, scheduler, and overlay events', async () => {
    const provider = new CapturingProvider();
    const events: StreamBotEvent[] = [];
    const runtime = createTwitchRuntime({
      env: {
        TWITCH_MOCK: 'true',
        TWITCH_COMMAND_ADMINS: 'subsect',
        TWITCH_GLOBAL_REPLY_COOLDOWN_MS: '0',
        TWITCH_PER_USER_COOLDOWN_MS: '0',
      },
      provider,
      onEvent: (event) => events.push(event),
    });

    runtime.start();
    await runtime.injectMockMessage({
      displayName: 'Subsect',
      text: '!yw status',
      user: 'subsect',
    });
    await runtime.injectMockMessage({
      displayName: 'Viewer',
      text: 'hey @yourwifey',
      user: 'viewer',
    });

    expect(events.some((event) => event.type === 'command:response')).toBe(true);
    expect(events.some((event) => event.type === 'ai:reply')).toBe(true);
    expect(events.some((event) => event.type === 'ai:delta')).toBe(true);
    expect(provider.requests).toHaveLength(1);
    expect(runtime.status()).toMatchObject({
      activeChatters: 1,
      channel: 'subsect',
      pendingBatch: 0,
      sourceMode: 'mock',
      started: true,
    });
  });

  it('rejects mock injection when runtime is configured for IRC', async () => {
    const runtime = createTwitchRuntime({
      env: {
        TWITCH_BACKEND_RUNTIME_ENABLED: 'false',
        TWITCH_MOCK: 'false',
      },
      provider: new CapturingProvider(),
    });

    await expect(runtime.injectMockMessage({ text: 'hello' })).rejects.toThrow(
      'Mock chat injection requires TWITCH_MOCK=true.',
    );
  });
});
