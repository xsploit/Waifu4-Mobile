import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ChatBar } from './ChatBar';

function renderChatBar(isGenerating: boolean) {
  return renderToStaticMarkup(
    <ChatBar
      activePersonaName="Hikari"
      inputValue="hello"
      isGenerating={isGenerating}
      messageCount={2}
      model="gpt-test"
      onInputChange={() => {}}
      onSend={() => {}}
    />,
  );
}

describe('ChatBar', () => {
  it('locks local send while an assistant reply is still active', () => {
    const html = renderChatBar(true);

    expect(html).toContain('disabled=""');
    expect(html).toContain('Wait for the current reply to finish');
  });

  it('keeps local send enabled while idle', () => {
    const html = renderChatBar(false);

    expect(html).not.toContain('disabled=""');
    expect(html).toContain('title="Send"');
  });
});
