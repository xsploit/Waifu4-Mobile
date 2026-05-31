import type { AnimationEntry, AnimationFormat, AnimationPurpose } from '../menu/types';
import { SILLY_TAVERN_ANIMATION_FILES } from './silly-tavern-manifest';

type BundledAnimationDefinition = {
  id: string;
  name: string;
  url: string;
  format: AnimationFormat;
  enabled?: boolean;
  experimental?: boolean;
  loopEligible?: boolean;
  purpose?: AnimationPurpose;
  tags?: string[];
  weight?: number;
};

const SACHI_VRMA_DIR = '/assets/animations/sachi-vrma';
const SILLY_BVH_DIR = '/assets/animations/silly-bvh';
const SILLY_TAVERN_BVH_DIR = '/assets/animations/silly-tavern';
const DEFAULT_ANIMATION_WEIGHTS: Record<AnimationPurpose, number> = {
  ambient: 1.25,
  gesture: 0.75,
  emotion: 0.6,
  movement: 0.18,
  pose: 0.22,
};
const MOVEMENT_TAG_WEIGHT_PENALTIES: Array<{ tag: string; multiplier: number }> = [
  { tag: 'spin', multiplier: 0.08 },
  { tag: 'rotate', multiplier: 0.08 },
  { tag: 'walk', multiplier: 0.08 },
  { tag: 'airplane', multiplier: 0.05 },
  { tag: 'standup', multiplier: 0.12 },
  { tag: 'kneel', multiplier: 0.12 },
  { tag: 'unknown', multiplier: 0.22 },
];
const UNSAFE_BASE_LOOP_TAGS = new Set([
  'airplane',
  'crouch',
  'down',
  'kneel',
  'lay',
  'lying',
  'pose',
  'rotate',
  'sit',
  'spin',
  'standup',
  'walk',
]);

const LEGACY_ANIMATIONS: BundledAnimationDefinition[] = [
  {
    id: 'idle',
    name: 'Idle',
    url: '/assets/animations/Idle.fbx',
    format: 'fbx',
    purpose: 'ambient',
    tags: ['idle', 'neutral'],
  },
  {
    id: 'idle2',
    name: 'Idle 2',
    url: '/assets/animations/Idle2.fbx',
    format: 'fbx',
    enabled: true,
    loopEligible: true,
    purpose: 'ambient',
    tags: ['idle', 'neutral'],
  },
  {
    id: 'idle3',
    name: 'Idle 3',
    url: '/assets/animations/Idle3.fbx',
    format: 'fbx',
    enabled: true,
    loopEligible: true,
    purpose: 'ambient',
    tags: ['idle', 'neutral'],
  },
  {
    id: 'thinking',
    name: 'Thinking',
    url: '/assets/animations/Thinking.fbx',
    format: 'fbx',
    enabled: true,
    loopEligible: false,
    purpose: 'emotion',
    tags: ['thinking'],
  },
];

const SACHI_VRMA_ANIMATIONS: BundledAnimationDefinition[] = [
  {
    id: 'sachi-idle01',
    name: 'Sachi Idle 1',
    url: `${SACHI_VRMA_DIR}/CC0animationidle01.vrma`,
    format: 'vrma',
    enabled: true,
    loopEligible: true,
    purpose: 'ambient',
    tags: ['idle', 'neutral'],
  },
  {
    id: 'sachi-idle03',
    name: 'Sachi Idle 3',
    url: `${SACHI_VRMA_DIR}/CC0animationidle03.vrma`,
    format: 'vrma',
    enabled: true,
    loopEligible: true,
    purpose: 'ambient',
    tags: ['idle', 'neutral'],
  },
  {
    id: 'sachi-idle04',
    name: 'Sachi Idle 4',
    url: `${SACHI_VRMA_DIR}/CC0animationidle04.vrma`,
    format: 'vrma',
    enabled: true,
    loopEligible: true,
    purpose: 'ambient',
    tags: ['idle', 'neutral'],
  },
  {
    id: 'sachi-idle05',
    name: 'Sachi Idle 5',
    url: `${SACHI_VRMA_DIR}/CC0animationidle05.vrma`,
    format: 'vrma',
    enabled: true,
    loopEligible: true,
    purpose: 'ambient',
    tags: ['idle', 'neutral'],
  },
  {
    id: 'sachi-stand01',
    name: 'Sachi Stand',
    url: `${SACHI_VRMA_DIR}/CC0animationstand01.vrma`,
    format: 'vrma',
    enabled: true,
    loopEligible: true,
    purpose: 'ambient',
    tags: ['stand', 'neutral'],
  },
  {
    id: 'sachi-hima01',
    name: 'Sachi Waiting',
    url: `${SACHI_VRMA_DIR}/CC0animationhima01.vrma`,
    format: 'vrma',
    enabled: true,
    loopEligible: true,
    purpose: 'ambient',
    tags: ['waiting', 'listen', 'thinking'],
  },
  {
    id: 'sachi-zatu01',
    name: 'Sachi Casual Talk',
    url: `${SACHI_VRMA_DIR}/CC0animationzatu01.vrma`,
    format: 'vrma',
    enabled: true,
    loopEligible: true,
    purpose: 'ambient',
    tags: ['talk', 'casual'],
  },
  {
    id: 'sachi-ruru01',
    name: 'Sachi Talk 1',
    url: `${SACHI_VRMA_DIR}/CC0animationruru01.vrma`,
    format: 'vrma',
    enabled: true,
    loopEligible: true,
    purpose: 'ambient',
    tags: ['talk'],
  },
  {
    id: 'sachi-ruru02',
    name: 'Sachi Talk 2',
    url: `${SACHI_VRMA_DIR}/CC0animationruru02.vrma`,
    format: 'vrma',
    enabled: true,
    loopEligible: true,
    purpose: 'ambient',
    tags: ['talk'],
  },
  {
    id: 'sachi-happy01',
    name: 'Sachi Happy',
    url: `${SACHI_VRMA_DIR}/CC0animationhappy01.vrma`,
    format: 'vrma',
    enabled: true,
    loopEligible: false,
    purpose: 'emotion',
    tags: ['happy', 'joy', 'amused'],
  },
  {
    id: 'sachi-smallwve',
    name: 'Sachi Small Wave',
    url: `${SACHI_VRMA_DIR}/CC0animationsmallwve.vrma`,
    format: 'vrma',
    enabled: true,
    loopEligible: false,
    purpose: 'gesture',
    tags: ['wave', 'greeting'],
  },
  {
    id: 'sachi-wave01',
    name: 'Sachi Wave 1',
    url: `${SACHI_VRMA_DIR}/CC0animationwave01.vrma`,
    format: 'vrma',
    enabled: true,
    loopEligible: false,
    purpose: 'gesture',
    tags: ['wave', 'greeting'],
  },
  {
    id: 'sachi-wave02',
    name: 'Sachi Wave 2',
    url: `${SACHI_VRMA_DIR}/CC0animationwave02.vrma`,
    format: 'vrma',
    purpose: 'gesture',
    tags: ['wave', 'greeting'],
  },
  {
    id: 'sachi-wave03',
    name: 'Sachi Wave 3',
    url: `${SACHI_VRMA_DIR}/CC0animationwave03.vrma`,
    format: 'vrma',
    purpose: 'gesture',
    tags: ['wave', 'greeting'],
  },
  {
    id: 'sachi-wave04',
    name: 'Sachi Wave 4',
    url: `${SACHI_VRMA_DIR}/CC0animationwave04.vrma`,
    format: 'vrma',
    purpose: 'gesture',
    tags: ['wave', 'greeting'],
  },
  {
    id: 'sachi-rightwave1',
    name: 'Sachi Right Wave',
    url: `${SACHI_VRMA_DIR}/CC0animationrightwave1.vrma`,
    format: 'vrma',
    purpose: 'gesture',
    tags: ['wave', 'greeting'],
  },
  {
    id: 'sachi-unwave',
    name: 'Sachi Unwave 1',
    url: `${SACHI_VRMA_DIR}/CC0animationunwave.vrma`,
    format: 'vrma',
    purpose: 'gesture',
    tags: ['wave'],
  },
  {
    id: 'sachi-unwave9',
    name: 'Sachi Unwave 9',
    url: `${SACHI_VRMA_DIR}/CC0animationunwave9.vrma`,
    format: 'vrma',
    purpose: 'gesture',
    tags: ['wave'],
  },
  {
    id: 'sachi-point1',
    name: 'Sachi Point',
    url: `${SACHI_VRMA_DIR}/CC0animationpoint1.vrma`,
    format: 'vrma',
    purpose: 'gesture',
    tags: ['point', 'explain'],
  },
  {
    id: 'sachi-sit01',
    name: 'Sachi Sit',
    url: `${SACHI_VRMA_DIR}/CC0animationsit01.vrma`,
    format: 'vrma',
    purpose: 'pose',
    tags: ['sit'],
  },
  {
    id: 'sachi-sitwave01',
    name: 'Sachi Sit Wave',
    url: `${SACHI_VRMA_DIR}/CC0animationsitwave01.vrma`,
    format: 'vrma',
    purpose: 'pose',
    tags: ['sit', 'wave'],
  },
  {
    id: 'sachi-kurukuru01',
    name: 'Sachi Spin',
    url: `${SACHI_VRMA_DIR}/CC0animationkurukuru01.vrma`,
    format: 'vrma',
    purpose: 'movement',
    tags: ['spin'],
  },
  {
    id: 'sachi-rotate01',
    name: 'Sachi Rotate 1',
    url: `${SACHI_VRMA_DIR}/CC0animationrotate01.vrma`,
    format: 'vrma',
    purpose: 'movement',
    tags: ['rotate'],
  },
  {
    id: 'sachi-rotate02',
    name: 'Sachi Rotate 2',
    url: `${SACHI_VRMA_DIR}/CC0animationrotate02.vrma`,
    format: 'vrma',
    purpose: 'movement',
    tags: ['rotate'],
  },
  {
    id: 'sachi-rotate6',
    name: 'Sachi Rotate 6',
    url: `${SACHI_VRMA_DIR}/CC0animationrotate6.vrma`,
    format: 'vrma',
    purpose: 'movement',
    tags: ['rotate'],
  },
  {
    id: 'sachi-rotate7',
    name: 'Sachi Rotate 7',
    url: `${SACHI_VRMA_DIR}/CC0animationrotate7.vrma`,
    format: 'vrma',
    purpose: 'movement',
    tags: ['rotate'],
  },
  {
    id: 'sachi-rotate-left-1',
    name: 'Sachi Rotate Left',
    url: `${SACHI_VRMA_DIR}/CC0animationrotate_left1.vrma`,
    format: 'vrma',
    purpose: 'movement',
    tags: ['rotate'],
  },
  {
    id: 'sachi-rotate-right',
    name: 'Sachi Rotate Right 1',
    url: `${SACHI_VRMA_DIR}/CC0animationrotate_right.vrma`,
    format: 'vrma',
    purpose: 'movement',
    tags: ['rotate'],
  },
  {
    id: 'sachi-rotate-right-2',
    name: 'Sachi Rotate Right 2',
    url: `${SACHI_VRMA_DIR}/CC0animationrotate_right2.vrma`,
    format: 'vrma',
    purpose: 'movement',
    tags: ['rotate'],
  },
  {
    id: 'sachi-unwalk1',
    name: 'Sachi Walk 1',
    url: `${SACHI_VRMA_DIR}/CC0animationunwalk1.vrma`,
    format: 'vrma',
    purpose: 'movement',
    tags: ['walk'],
  },
  {
    id: 'sachi-unwalk2',
    name: 'Sachi Walk 2',
    url: `${SACHI_VRMA_DIR}/CC0animationunwalk2.vrma`,
    format: 'vrma',
    purpose: 'movement',
    tags: ['walk'],
  },
  {
    id: 'sachi-3airplane01',
    name: 'Sachi Airplane 1',
    url: `${SACHI_VRMA_DIR}/CC0animation3airplane01.vrma`,
    format: 'vrma',
    purpose: 'movement',
    tags: ['airplane'],
  },
  {
    id: 'sachi-3airplane02',
    name: 'Sachi Airplane 2',
    url: `${SACHI_VRMA_DIR}/CC0animation3airplane02.vrma`,
    format: 'vrma',
    purpose: 'movement',
    tags: ['airplane'],
  },
  {
    id: 'sachi-3airplane05',
    name: 'Sachi Airplane 5',
    url: `${SACHI_VRMA_DIR}/CC0animation3airplane05.vrma`,
    format: 'vrma',
    purpose: 'movement',
    tags: ['airplane'],
  },
  {
    id: 'sachi-skirt01',
    name: 'Sachi Skirt',
    url: `${SACHI_VRMA_DIR}/CC0animationskirt01.vrma`,
    format: 'vrma',
    purpose: 'gesture',
    tags: ['shy', 'nervous'],
  },
  {
    id: 'sachi-other1',
    name: 'Sachi Other 1',
    url: `${SACHI_VRMA_DIR}/CC0animationother1.vrma`,
    format: 'vrma',
    experimental: true,
    purpose: 'gesture',
    tags: ['other'],
  },
  {
    id: 'sachi-other2',
    name: 'Sachi Other 2',
    url: `${SACHI_VRMA_DIR}/CC0animationother2.vrma`,
    format: 'vrma',
    experimental: true,
    purpose: 'gesture',
    tags: ['other'],
  },
  {
    id: 'sachi-unknown1',
    name: 'Sachi Unknown 1',
    url: `${SACHI_VRMA_DIR}/CC0animationunknown1.vrma`,
    format: 'vrma',
    experimental: true,
    purpose: 'gesture',
    tags: ['unknown'],
  },
  {
    id: 'sachi-unknown2',
    name: 'Sachi Unknown 2',
    url: `${SACHI_VRMA_DIR}/CC0animationunknown2.vrma`,
    format: 'vrma',
    experimental: true,
    purpose: 'gesture',
    tags: ['unknown'],
  },
  {
    id: 'sachi-unknown3',
    name: 'Sachi Unknown 3',
    url: `${SACHI_VRMA_DIR}/CC0animationunknown3.vrma`,
    format: 'vrma',
    experimental: true,
    purpose: 'gesture',
    tags: ['unknown'],
  },
  {
    id: 'sachi-unknown4',
    name: 'Sachi Unknown 4',
    url: `${SACHI_VRMA_DIR}/CC0animationunknown4.vrma`,
    format: 'vrma',
    experimental: true,
    purpose: 'gesture',
    tags: ['unknown'],
  },
  {
    id: 'sachi-unknown5',
    name: 'Sachi Unknown 5',
    url: `${SACHI_VRMA_DIR}/CC0animationunknown5.vrma`,
    format: 'vrma',
    experimental: true,
    purpose: 'gesture',
    tags: ['unknown'],
  },
];

const SILLY_BVH_ANIMATIONS: Array<[file: string, name: string]> = [
  ['neutral_idle.bvh', 'Silly Neutral Idle 1'],
  ['neutral_idle2.bvh', 'Silly Neutral Idle 2'],
  ['neutral.bvh', 'Silly Neutral 1'],
  ['neutral2.bvh', 'Silly Neutral 2'],
  ['neutral3.bvh', 'Silly Neutral 3'],
  ['neutral4.bvh', 'Silly Neutral 4'],
  ['action_greeting.bvh', 'Silly Greeting 1'],
  ['action_greeting1.bvh', 'Silly Greeting 2'],
  ['action_attention_seeking.bvh', 'Silly Attention'],
  ['action_gaming.bvh', 'Silly Gaming'],
  ['action_pat.bvh', 'Silly Pat'],
  ['admiration2.bvh', 'Silly Admiration'],
  ['amusement.bvh', 'Silly Amusement'],
  ['annoyance.bvh', 'Silly Annoyance'],
  ['approval.bvh', 'Silly Approval'],
  ['caring.bvh', 'Silly Caring'],
  ['confusion2.bvh', 'Silly Confusion'],
  ['curiosity.bvh', 'Silly Curiosity'],
  ['excitement3.bvh', 'Silly Excitement'],
  ['gratitude.bvh', 'Silly Gratitude'],
  ['joy3.bvh', 'Silly Joy'],
  ['nervousness.bvh', 'Silly Nervousness'],
  ['optimism.bvh', 'Silly Optimism'],
  ['pride2.bvh', 'Silly Pride'],
  ['realization.bvh', 'Silly Realization'],
  ['relief.bvh', 'Silly Relief'],
  ['surprise.bvh', 'Silly Surprise'],
  ['sit_idle.bvh', 'Silly Sit Idle 1'],
  ['sit_idle2.bvh', 'Silly Sit Idle 2'],
  ['sit_idle3.bvh', 'Silly Sit Idle 3'],
  ['sit_idle4.bvh', 'Silly Sit Idle 4'],
  ['kneel_idle.bvh', 'Silly Kneel Idle 1'],
  ['kneel_idle2.bvh', 'Silly Kneel Idle 2'],
  ['action_walk.bvh', 'Silly Walk'],
  ['action_standup.bvh', 'Silly Stand Up'],
];

const SILLY_TAVERN_ANIMATIONS: Array<[file: string, name: string]> =
  SILLY_TAVERN_ANIMATION_FILES.map((file) => [file, toDisplayName(file)]);

function bundledAnimation(definition: BundledAnimationDefinition): AnimationEntry {
  const purpose = definition.purpose ?? 'gesture';
  const tags = definition.tags ?? [];
  return {
    id: definition.id,
    name: definition.name,
    url: definition.url,
    format: definition.format,
    enabled: definition.enabled ?? false,
    experimental: definition.experimental ?? false,
    loopEligible: definition.loopEligible ?? purpose === 'ambient',
    purpose,
    tags,
    weight: clampAnimationWeight(
      definition.weight ??
        getDefaultAnimationWeight(purpose, definition.experimental ?? false, tags),
    ),
  };
}

function classifySillyAnimation(
  file: string,
  name: string,
  dir: string,
  idPrefix = 'silly',
): BundledAnimationDefinition {
  const id = `${idPrefix}-${file
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()}`;
  const lower = `${file} ${name}`.toLowerCase();
  const tags = lower
    .replace(/\.[^.]+/g, ' ')
    .split(/[^a-z0-9]+/g)
    .filter((tag) => tag.length >= 3 && tag !== 'bvh' && tag !== 'silly');
  const tagSet = new Set(tags);
  const isAmbient = tagSet.has('neutral') || tagSet.has('idle');
  const isMovement = tagSet.has('walk') || tagSet.has('standup') || tagSet.has('kneel');
  const isPose = tagSet.has('sit') || tagSet.has('kneel') || tagSet.has('pose');
  const isGreeting = tagSet.has('greeting');
  const isUnknown = tags.includes('unknown');

  return {
    id,
    name,
    url: `${dir}/${file}`,
    format: 'bvh',
    enabled: !isMovement && !isPose && !isUnknown,
    experimental: true,
    loopEligible: isAmbient && !isMovement && !isPose,
    purpose: isMovement ? 'movement' : isPose ? 'pose' : isGreeting ? 'gesture' : 'emotion',
    tags: isGreeting ? [...tags, 'greeting', 'wave'] : tags,
  };
}

export const DEFAULT_ANIMATIONS: AnimationEntry[] = [
  ...LEGACY_ANIMATIONS.map(bundledAnimation),
  ...SACHI_VRMA_ANIMATIONS.map(bundledAnimation),
  ...SILLY_BVH_ANIMATIONS.map(([file, name]) =>
    bundledAnimation(classifySillyAnimation(file, name, SILLY_BVH_DIR)),
  ),
  ...SILLY_TAVERN_ANIMATIONS.map(([file, name]) =>
    bundledAnimation(classifySillyAnimation(file, name, SILLY_TAVERN_BVH_DIR, 'silly-tavern')),
  ),
];

export function isBaseLoopAnimation(entry: AnimationEntry) {
  if (!entry.enabled || entry.loopEligible === false || entry.purpose !== 'ambient') {
    return false;
  }
  const tags = new Set((entry.tags ?? []).map((tag) => tag.toLowerCase()));
  if ([entry.id, entry.name].some((value) => hasUnsafeBaseLoopToken(value))) {
    return false;
  }
  return !Array.from(tags).some((tag) => UNSAFE_BASE_LOOP_TAGS.has(tag));
}

function hasUnsafeBaseLoopToken(value: string) {
  const normalized = value.toLowerCase();
  return Array.from(UNSAFE_BASE_LOOP_TAGS).some((tag) =>
    new RegExp(`(^|[^a-z0-9])${tag}([^a-z0-9]|$)`, 'i').test(normalized),
  );
}

function toDisplayName(fileName: string) {
  const withoutExt = fileName.replace(/\.[^.]+$/, '');
  return withoutExt
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/^/, 'Silly ');
}

type WeightedAnimationEntry = {
  index: number;
  weight: number;
};

export class AnimationSequencer {
  private activeEnabled: AnimationEntry[] = [];
  private activeOptions: { shuffle: boolean; loop: boolean; duration: number } | null = null;
  private activePlaylist: AnimationEntry[] = [];
  private activeShuffleWeights: WeightedAnimationEntry[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private currentIndex = -1;
  private shuffleOrder: number[] = [];
  private shufflePosition = 0;

  onAdvance: ((entry: AnimationEntry, index: number) => void) | null = null;
  onStop: (() => void) | null = null;

  start(
    playlist: AnimationEntry[],
    options: { shuffle: boolean; loop: boolean; duration: number },
  ) {
    this.stop(false);
    const enabled = playlist.filter(isBaseLoopAnimation);
    if (enabled.length === 0) {
      return;
    }

    if (options.shuffle) {
      this.activeShuffleWeights = this.createShuffleWeights(enabled);
      this.shuffleOrder = this.weightedShuffle(this.activeShuffleWeights);
      this.shufflePosition = 0;
    } else {
      this.activeShuffleWeights = [];
    }

    this.activeEnabled = enabled;
    this.activeOptions = options;
    this.activePlaylist = playlist;
    this.advance(playlist, enabled, options);
  }

  pause() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  resume(delayMs = 0) {
    if (this.timer || !this.activeOptions || this.activeEnabled.length === 0) {
      return;
    }

    this.timer = setTimeout(
      () => {
        this.timer = null;
        if (!this.activeOptions) {
          return;
        }
        this.advance(this.activePlaylist, this.activeEnabled, this.activeOptions);
      },
      Math.max(0, delayMs),
    );
  }

  stop(notify = true) {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    this.currentIndex = -1;
    this.activeEnabled = [];
    this.activeOptions = null;
    this.activePlaylist = [];
    this.activeShuffleWeights = [];
    if (notify) {
      this.onStop?.();
    }
  }

  private advance(
    playlist: AnimationEntry[],
    enabled: AnimationEntry[],
    options: { shuffle: boolean; loop: boolean; duration: number },
  ) {
    let nextEnabled: AnimationEntry;
    let nextEnabledIndex: number;

    if (options.shuffle) {
      if (this.shufflePosition >= enabled.length) {
        if (!options.loop) {
          this.stop();
          return;
        }

        this.shuffleOrder = this.weightedShuffle(this.activeShuffleWeights);
        this.shufflePosition = 0;
      }

      const shuffledIndex = this.shuffleOrder[this.shufflePosition++];
      if (shuffledIndex === undefined) {
        this.stop();
        return;
      }

      nextEnabledIndex = shuffledIndex;
      const shuffledEntry = enabled[nextEnabledIndex];
      if (!shuffledEntry) {
        this.stop();
        return;
      }

      nextEnabled = shuffledEntry;
    } else {
      const currentEntry = this.currentIndex >= 0 ? playlist[this.currentIndex] : undefined;
      const currentEnabledIndex = currentEntry ? enabled.indexOf(currentEntry) : -1;
      const nextIndex = currentEnabledIndex + 1;

      if (nextIndex >= enabled.length) {
        if (!options.loop) {
          this.stop();
          return;
        }

        nextEnabledIndex = 0;
      } else {
        nextEnabledIndex = nextIndex;
      }

      const sequentialEntry = enabled[nextEnabledIndex];
      if (!sequentialEntry) {
        this.stop();
        return;
      }

      nextEnabled = sequentialEntry;
    }

    const absoluteIndex = playlist.indexOf(nextEnabled);
    this.currentIndex = absoluteIndex;

    this.onAdvance?.(nextEnabled, absoluteIndex);

    this.timer = setTimeout(() => {
      this.advance(playlist, enabled, options);
    }, options.duration * 1000);
  }

  private createShuffleWeights(entries: AnimationEntry[]) {
    return entries.map((entry, index) => ({
      index,
      weight: clampAnimationWeight(getAnimationSelectionWeight(entry)),
    }));
  }

  private weightedShuffle(entries: WeightedAnimationEntry[]) {
    const weighted = entries.slice();
    const shuffle: number[] = [];
    while (weighted.length > 0) {
      const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
      if (total <= 0) {
        const fallback = weighted.shift();
        if (fallback) {
          shuffle.push(fallback.index);
        }
        continue;
      }

      let cursor = Math.random() * total;
      let selectedIndex = 0;
      for (let i = 0; i < weighted.length; i += 1) {
        const item = weighted[i];
        if (!item) {
          continue;
        }
        cursor -= item.weight;
        if (cursor <= 0) {
          selectedIndex = i;
          break;
        }
      }

      const picked = weighted.splice(selectedIndex, 1)?.[0];
      if (picked) {
        shuffle.push(picked.index);
      }
    }
    return shuffle;
  }
}

function clampAnimationWeight(value: number) {
  return Math.min(4, Math.max(0.05, value));
}

function getDefaultAnimationWeight(
  purpose: AnimationPurpose,
  experimental: boolean,
  tags: string[] = [],
) {
  const normalizedTags = tags.map((tag) => tag.toLowerCase());
  const purposeBase = DEFAULT_ANIMATION_WEIGHTS[purpose] ?? 0.65;
  const experimentalPenalty = experimental ? 0.35 : 1;
  const tagPenalty = MOVEMENT_TAG_WEIGHT_PENALTIES.reduce((multiplier, penalty) => {
    return normalizedTags.includes(penalty.tag) ? multiplier * penalty.multiplier : multiplier;
  }, 1);
  return purposeBase * experimentalPenalty * tagPenalty;
}

function getAnimationSelectionWeight(entry: AnimationEntry) {
  return (
    entry.weight ??
    getDefaultAnimationWeight(entry.purpose ?? 'gesture', entry.experimental, entry.tags)
  );
}
