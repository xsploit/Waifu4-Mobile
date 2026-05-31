import { describe, expect, it } from 'vitest';
import { renderYourWifeyPomlMessages, stringifyPomlContent } from './PomlRenderer';

describe('PomlRenderer', () => {
  it('renders the Web Waifu 4 template with the fixed pomljs parser', async () => {
    const messages = await renderYourWifeyPomlMessages({
      animation_catalog_context: 'Available animation if mood_points < 8 && mood_points > 2',
      diary_context: '',
      persona_context: 'You are Hikari. Stay in character.',
      relationship_memory_context: 'Known user facts: ["likes POML"]',
      reply_metadata_instruction: '<yw-meta>{"emotion":"neutral"}</yw-meta>',
      semantic_memory_context: '',
      turn_metadata_context: 'Turn metadata: {"source":"twitch"}',
      tts_context: '',
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ role: 'system' });
    expect(messages[0]?.content).toContain('You are Hikari');
    expect(messages[0]?.content).toContain('- persona: Web Waifu 4');
    expect(messages[0]?.content).toContain('mood_points < 8 && mood_points > 2');
    expect(messages[0]?.content).toContain('<yw-meta>');
    expect(messages[0]?.content).not.toContain('[{');
    expect(messages[0]?.content).not.toContain('{{');
  });

  it('supports patched POML condition expressions and tool policy blocks', async () => {
    const messages = await renderYourWifeyPomlMessages(
      {
        mood_points: '4',
      },
      `<poml>
        <system-msg>
          <tool-policy>Use web_search only when fresh data would help.</tool-policy>
          <if condition="{{ mood_points < 8 && mood_points > 2 }}">
            Conditional Twitch context is enabled.
          </if>
        </system-msg>
      </poml>`,
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]?.content).toContain('Use web_search only when fresh data would help.');
    expect(messages[0]?.content).toContain('Conditional Twitch context is enabled.');
  });

  it('omits patched POML condition false branches', async () => {
    const messages = await renderYourWifeyPomlMessages(
      {
        mood_points: '1',
      },
      `<poml>
        <system-msg>
          Always-on context.
          <if condition="{{ mood_points < 8 && mood_points > 2 }}">
            Conditional Twitch context is enabled.
          </if>
        </system-msg>
      </poml>`,
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]?.content).toContain('Always-on context.');
    expect(messages[0]?.content).not.toContain('Conditional Twitch context is enabled.');
  });

  it('serializes rich list content as plain prompt text instead of JSON blobs', async () => {
    const messages = await renderYourWifeyPomlMessages(
      {},
      `<poml>
        <system-msg>
          <list>
            <item>persona: Hikari</item>
            <item>turn_source: twitch</item>
          </list>
        </system-msg>
      </poml>`,
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]?.content).toContain('- persona: Hikari');
    expect(messages[0]?.content).toContain('- turn_source: twitch');
    expect(messages[0]?.content).not.toContain('[{');
  });

  it('does not flatten unknown rich-node metadata as loose prompt lines', () => {
    const output = stringifyPomlContent({
      attrs: {
        id: 'private-node-id',
      },
      score: 7,
      type: 'custom-widget',
    } as never);

    expect(output).toBe(
      JSON.stringify({
        attrs: {
          id: 'private-node-id',
        },
        score: 7,
        type: 'custom-widget',
      }),
    );
    expect(output).not.toContain('\nprivate-node-id\n');
  });
});
