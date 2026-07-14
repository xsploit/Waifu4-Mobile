import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AccountTab } from './AccountTab';

describe('AccountTab', () => {
  it('renders every browser-local provider key row and transfer controls', () => {
    const html = renderToStaticMarkup(
      <AccountTab
        localTransferStatus="Ready"
        onExportLocalBackup={() => {}}
        onImportLocalBackup={() => {}}
      />,
    );

    expect(html).toContain('Browser Workspace');
    expect(html).toContain('Provider Access');
    expect(html).toContain('OpenAI Utility');
    expect(html).toContain('OpenRouter');
    expect(html).toContain('Vercel AI Gateway');
    expect(html).toContain('Fish Audio');
    expect(html).toContain('Inworld');
    expect(html).toContain('Tavily');
    expect(html).toContain('Transfer &amp; Backup');
    expect(html).toContain('Export JSON Backup');
    expect(html).toContain('Import JSON Backup');
    expect(html).toContain('Provider keys:');
    expect(html).toContain('browser local');
  });
});
