import { describe, expect, it, vi } from 'vitest';
import type { AnimationEntry } from '../menu/types';
import { AnimationSequencer, DEFAULT_ANIMATIONS, isBaseLoopAnimation } from './sequencer';

function loopEntry(id: string): AnimationEntry {
  return {
    enabled: true,
    experimental: false,
    format: 'fbx',
    id,
    loopEligible: true,
    name: id,
    purpose: 'ambient',
    tags: [],
    url: `/test/${id}.fbx`,
  };
}

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

  it('classifies detected neutral idle clips as autoplay candidates', () => {
    const neutralIdle = DEFAULT_ANIMATIONS.find((entry) => entry.id === 'silly-neutral-idle');

    expect(neutralIdle?.enabled).toBe(true);
    expect(neutralIdle?.purpose).toBe('ambient');
    expect(neutralIdle?.loopEligible).toBe(true);
    expect(isBaseLoopAnimation(neutralIdle!)).toBe(true);
    expect(
      isBaseLoopAnimation(DEFAULT_ANIMATIONS.find((entry) => entry.name === 'Silly Laying Idle')!),
    ).toBe(false);
  });

  it('enriches catalog tags for AI-safe animation selection', () => {
    const talk = DEFAULT_ANIMATIONS.find((entry) => entry.id === 'sachi-ruru01');
    const greeting = DEFAULT_ANIMATIONS.find((entry) => entry.id === 'silly-action-greeting');
    const walk = DEFAULT_ANIMATIONS.find((entry) => entry.id === 'sachi-unwalk1');

    expect(talk?.tags).toEqual(expect.arrayContaining(['talk', 'casual', 'upper-body']));
    expect(greeting?.tags).toEqual(expect.arrayContaining(['wave', 'greeting', 'friendly']));
    expect(walk?.tags).toEqual(expect.arrayContaining(['unsafe-loop', 'locomotion']));
  });

  it('shuffles autoplay as a non-repeating random bag without animation weights', () => {
    vi.useFakeTimers();
    const randomValues = [0.99, 0.99, 0.5, 0.1];
    const randomSpy = vi.spyOn(Math, 'random').mockImplementation(() => randomValues.shift() ?? 0.99);
    const sequencer = new AnimationSequencer();
    const played: string[] = [];
    sequencer.onAdvance = (entry) => {
      played.push(entry.id);
    };

    try {
      sequencer.start([loopEntry('idle-a'), loopEntry('idle-b'), loopEntry('idle-c')], {
        duration: 0.001,
        loop: true,
        shuffle: true,
      });
      vi.advanceTimersByTime(1);
      vi.advanceTimersByTime(1);
      vi.advanceTimersByTime(1);

      expect(played.slice(0, 3).sort()).toEqual(['idle-a', 'idle-b', 'idle-c']);
      expect(played[2]).toBe('idle-c');
      expect(played[3]).toBe('idle-a');
    } finally {
      sequencer.stop(false);
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});
