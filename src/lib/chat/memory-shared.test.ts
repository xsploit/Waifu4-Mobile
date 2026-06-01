import { describe, expect, it } from 'vitest';

import { sanitizeDiaryEntry } from './memory-shared';

describe('memory shared helpers', () => {
  it('turns object-shaped diary entries into readable text', () => {
    const entry = sanitizeDiaryEntry({
      summary: 'Subsect iterated a Discord welcome message.',
      personal_thought: 'Future replies should switch directly into recording mode when asked.',
    });

    expect(entry).toContain('Subsect iterated a Discord welcome message.');
    expect(entry).toContain('Future replies should switch directly into recording mode when asked.');
    expect(entry).not.toContain('[object Object]');
  });

  it('drops stale object-object diary strings from older persisted state', () => {
    expect(sanitizeDiaryEntry('[object Object]')).toBe('');
  });
});
