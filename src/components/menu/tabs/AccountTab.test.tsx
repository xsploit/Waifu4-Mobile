import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AccountTab } from './AccountTab';

describe('AccountTab', () => {
  it('renders every browser-local provider key row and local transfer controls', () => {
    const html = renderToStaticMarkup(
      <AccountTab
        localTransferStatus="Ready"
        onExportLocalBackup={() => {}}
        onImportLocalBackup={() => {}}
      />,
    );

    expect(html).toContain('Browser Provider Keys');
    expect(html).toContain('OpenAI Utility');
    expect(html).toContain('OpenRouter');
    expect(html).toContain('Vercel AI Gateway');
    expect(html).toContain('Fish Speech');
    expect(html).toContain('Inworld');
    expect(html).toContain('Tavily');
    expect(html).toContain('Local Transfer Backup');
    expect(html).toContain('Export JSON Backup');
    expect(html).toContain('Import JSON Backup');
    expect(html).toContain('Provider keys:');
    expect(html).toContain('local only');
  });
});
