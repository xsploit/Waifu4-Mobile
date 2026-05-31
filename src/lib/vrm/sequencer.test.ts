import { describe, expect, it } from 'vitest';
import { DEFAULT_ANIMATIONS, isBaseLoopAnimation } from './sequencer';

describe('animation sequencer catalog', () => {
  it('title-cases generated Silly Tavern animation names for the settings playlist', () => {
    expect(
      DEFAULT_ANIMATIONS.find((entry) => entry.id === 'silly-tavern-action-attention-seeking')
        ?.name,
    ).toBe('Silly Action Attention Seeking');
    expect(
      DEFAULT_ANIMATIONS.find((entry) => entry.id === 'silly-tavern-dance-gangnam-style')?.name,
    ).toBe('Silly Dance Gangnam Style');
  });

  it('keeps autoplay limited to safe ambient idle and talk clips', () => {
    expect(
      isBaseLoopAnimation(DEFAULT_ANIMATIONS.find((entry) => entry.id === 'sachi-idle01')!),
    ).toBe(true);
    expect(
      isBaseLoopAnimation(DEFAULT_ANIMATIONS.find((entry) => entry.id === 'sachi-ruru01')!),
    ).toBe(true);
    expect(
      isBaseLoopAnimation(DEFAULT_ANIMATIONS.find((entry) => entry.id === 'sachi-happy01')!),
    ).toBe(false);
    expect(
      isBaseLoopAnimation(DEFAULT_ANIMATIONS.find((entry) => entry.id === 'sachi-wave01')!),
    ).toBe(false);
    expect(
      isBaseLoopAnimation(DEFAULT_ANIMATIONS.find((entry) => entry.id === 'sachi-unwalk1')!),
    ).toBe(false);
  });

  it('enables emotion reactions without making them autoplay candidates', () => {
    const annoyance = DEFAULT_ANIMATIONS.find((entry) => entry.id === 'silly-annoyance');
    const curiosity = DEFAULT_ANIMATIONS.find((entry) => entry.id === 'silly-curiosity');
    const thinking = DEFAULT_ANIMATIONS.find((entry) => entry.id === 'thinking');

    expect(annoyance?.enabled).toBe(true);
    expect(annoyance?.purpose).toBe('emotion');
    expect(isBaseLoopAnimation(annoyance!)).toBe(false);
    expect(curiosity?.enabled).toBe(true);
    expect(curiosity?.purpose).toBe('emotion');
    expect(isBaseLoopAnimation(curiosity!)).toBe(false);
    expect(thinking?.enabled).toBe(true);
    expect(thinking?.purpose).toBe('emotion');
    expect(isBaseLoopAnimation(thinking!)).toBe(false);
  });
});
