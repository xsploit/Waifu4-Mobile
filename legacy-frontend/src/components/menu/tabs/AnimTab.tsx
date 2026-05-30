import type { Dispatch, SetStateAction } from 'react';
import type {
  AnimationEntry,
  AnimationPurpose,
  ManualPlayRequest,
  SequencerSettings,
} from '../../../lib/menu/types';

type AnimTabProps = {
  onImportAnimationFile: (file: File) => void;
  onPlayAnimation: (request: ManualPlayRequest) => void;
  setSequencerSettings: Dispatch<SetStateAction<SequencerSettings>>;
  sequencerSettings: SequencerSettings;
};

const ANIMATION_PURPOSES: AnimationPurpose[] = [
  'ambient',
  'gesture',
  'emotion',
  'movement',
  'pose',
];

type AnimationGroupId = 'base' | 'emotion' | 'event' | 'movement' | 'other';

const ANIMATION_GROUPS: Array<{
  id: AnimationGroupId;
  label: string;
  description: string;
}> = [
  {
    id: 'base',
    label: 'Base Loop',
    description: 'Idle, listening, and talking motion used by the normal autoplay loop.',
  },
  {
    id: 'emotion',
    label: 'Emotion Reactions',
    description: 'Triggered by AI emotion metadata, then crossfaded back to the base loop.',
  },
  {
    id: 'event',
    label: 'Events',
    description: 'Manual or future event triggers like greetings, waves, and one-off gestures.',
  },
  {
    id: 'movement',
    label: 'Movement / Poses',
    description: 'Walk, sit, kneel, rotate, and pose clips. Keep these off unless needed.',
  },
  {
    id: 'other',
    label: 'Other / Imported',
    description: 'Imported or uncategorized clips that need manual review.',
  },
];

function getAnimationGroupId(entry: AnimationEntry): AnimationGroupId {
  if (entry.purpose === 'ambient' && entry.loopEligible !== false) {
    return 'base';
  }
  if (entry.purpose === 'emotion') {
    return 'emotion';
  }
  if (entry.purpose === 'gesture') {
    return 'event';
  }
  if (entry.purpose === 'movement' || entry.purpose === 'pose') {
    return 'movement';
  }
  return 'other';
}

function updateSequencer(
  setSequencerSettings: Dispatch<SetStateAction<SequencerSettings>>,
  patch: Partial<SequencerSettings>,
) {
  setSequencerSettings((current) => ({
    ...current,
    ...patch,
  }));
}

function updatePlaylistEntry(
  setSequencerSettings: Dispatch<SetStateAction<SequencerSettings>>,
  index: number,
  patch: Partial<AnimationEntry>,
) {
  setSequencerSettings((current) => ({
    ...current,
    playlist: current.playlist.map((entry, entryIndex) =>
      entryIndex === index ? { ...entry, ...patch } : entry,
    ),
  }));
}

function setAnimationGroupEnabled(
  setSequencerSettings: Dispatch<SetStateAction<SequencerSettings>>,
  groupId: AnimationGroupId,
  enabled: boolean,
  solo = false,
) {
  setSequencerSettings((current) => {
    const playlist = current.playlist.map((entry) => {
      const inGroup = getAnimationGroupId(entry) === groupId;
      if (solo) {
        return { ...entry, enabled: inGroup };
      }
      return inGroup ? { ...entry, enabled } : entry;
    });
    const currentEntry = current.currentIndex >= 0 ? playlist[current.currentIndex] : null;
    return {
      ...current,
      currentIndex: currentEntry?.enabled ? current.currentIndex : -1,
      playlist,
    };
  });
}

export function AnimTab({
  onImportAnimationFile,
  onPlayAnimation,
  setSequencerSettings,
  sequencerSettings,
}: AnimTabProps) {
  const playlistWithIndexes = sequencerSettings.playlist.map((entry, index) => ({ entry, index }));
  const groupedAnimations = ANIMATION_GROUPS.map((group) => ({
    ...group,
    entries: playlistWithIndexes.filter(({ entry }) => getAnimationGroupId(entry) === group.id),
  })).filter((group) => group.entries.length > 0);
  const currentEntry =
    sequencerSettings.currentIndex >= 0
      ? sequencerSettings.playlist[sequencerSettings.currentIndex]
      : null;
  const currentGroup = currentEntry
    ? ANIMATION_GROUPS.find((group) => group.id === getAnimationGroupId(currentEntry))
    : null;
  const enabledCounts = ANIMATION_GROUPS.reduce(
    (counts, group) => ({
      ...counts,
      [group.id]: sequencerSettings.playlist.filter(
        (entry) => entry.enabled && getAnimationGroupId(entry) === group.id,
      ).length,
    }),
    {} as Record<AnimationGroupId, number>,
  );
  const renderAnimationRow = (entry: AnimationEntry, index: number) => {
    const isPlaying = sequencerSettings.currentIndex === index;
    return (
      <div
        className={`row anim-row ${isPlaying ? 'active' : ''} ${!entry.enabled ? 'disabled' : ''}`}
        key={entry.id}
      >
        <div className="anim-row-main">
          <label className="check">
            <input
              checked={entry.enabled}
              onChange={() =>
                setSequencerSettings((current) => ({
                  ...current,
                  playlist: current.playlist.map((item, itemIndex) =>
                    itemIndex === index
                      ? {
                          ...item,
                          enabled: !item.enabled,
                        }
                      : item,
                  ),
                }))
              }
              type="checkbox"
            />
          </label>
          <span className="name">
            {entry.name}
            {isPlaying ? <span className="badge badge-playing">PLAYING</span> : null}
            {entry.format ? <span className="badge">{entry.format.toUpperCase()}</span> : null}
            {entry.purpose ? (
              <span className="badge badge-muted">{entry.purpose.toUpperCase()}</span>
            ) : null}
            {entry.loopEligible === false ? <span className="badge">TRIGGER</span> : null}
            {entry.experimental ? <span className="badge">EXP</span> : null}
            {entry.tags?.length ? (
              <span className="anim-tags">{entry.tags.slice(0, 6).join(' / ')}</span>
            ) : null}
          </span>
          <button
            className="play-btn"
            onClick={() =>
              onPlayAnimation({
                index,
                nonce: Date.now(),
              })
            }
            title="Play animation"
            type="button"
          >
            <svg fill="currentColor" viewBox="0 0 24 24">
              <polygon points="5,3 19,12 5,21" />
            </svg>
            <span>Play</span>
          </button>
        </div>
        <div className="anim-meta">
          <div className="anim-meta-field anim-meta-field-wide">
            <span>Chance {(entry.weight ?? 1).toFixed(2)}x</span>
            <input
              aria-label="Animation probability"
              className="anim-weight"
              max="4"
              min="0.05"
              onChange={(event) =>
                updatePlaylistEntry(setSequencerSettings, index, {
                  weight: Number(event.target.value),
                })
              }
              step="0.05"
              title={`Chance: ${(entry.weight ?? 1).toFixed(2)}`}
              type="range"
              value={entry.weight ?? 1}
            />
          </div>
          <div className="anim-meta-field">
            <span>Purpose</span>
            <select
              className="anim-purpose-select"
              onChange={(event) =>
                updatePlaylistEntry(setSequencerSettings, index, {
                  purpose: event.target.value as AnimationPurpose,
                })
              }
              value={entry.purpose ?? 'gesture'}
            >
              {ANIMATION_PURPOSES.map((purpose) => (
                <option key={purpose} value={purpose}>
                  {purpose}
                </option>
              ))}
            </select>
          </div>
          <div className="anim-meta-field">
            <span>Mode</span>
            <button
              className={`loop-chip ${entry.loopEligible !== false ? 'on' : ''}`}
              onClick={() =>
                updatePlaylistEntry(setSequencerSettings, index, {
                  loopEligible: entry.loopEligible === false,
                })
              }
              type="button"
            >
              {entry.loopEligible !== false ? 'Loop' : 'Trigger'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="controls">
        <button
          className={`btn-tech ${sequencerSettings.playing ? 'active' : ''}`}
          onClick={() =>
            updateSequencer(setSequencerSettings, { playing: !sequencerSettings.playing })
          }
          type="button"
        >
          {sequencerSettings.playing ? '[ STOP ]' : '[ AUTO-PLAY ]'}
        </button>

        <div className="control-row">
          <button
            className={`btn-sm ${sequencerSettings.loop ? 'on' : ''}`}
            onClick={() => updateSequencer(setSequencerSettings, { loop: !sequencerSettings.loop })}
            type="button"
          >
            Loop
          </button>
          <button
            className={`btn-sm ${sequencerSettings.shuffle ? 'on' : ''}`}
            onClick={() =>
              updateSequencer(setSequencerSettings, { shuffle: !sequencerSettings.shuffle })
            }
            type="button"
          >
            Shuffle
          </button>
        </div>

        <div className="slider-row slider-row-compact">
          <span>Speed</span>
          <input
            max="3"
            min="0.1"
            onChange={(event) =>
              updateSequencer(setSequencerSettings, { speed: Number(event.target.value) })
            }
            step="0.1"
            type="range"
            value={sequencerSettings.speed}
          />
          <span className="val">{sequencerSettings.speed.toFixed(1)}x</span>
        </div>

        <div className="slider-row slider-row-compact">
          <span>Duration</span>
          <input
            max="60"
            min="3"
            onChange={(event) =>
              updateSequencer(setSequencerSettings, { duration: Number(event.target.value) })
            }
            step="1"
            type="range"
            value={sequencerSettings.duration}
          />
          <span className="val">{sequencerSettings.duration}s</span>
        </div>
      </div>

      <div className="anim-summary">
        <span>
          <strong>{enabledCounts.base}</strong>
          Base
        </span>
        <span>
          <strong>{enabledCounts.emotion}</strong>
          Emotion
        </span>
        <span>
          <strong>{enabledCounts.event}</strong>
          Events
        </span>
        <span>
          <strong>{enabledCounts.movement}</strong>
          Move/Pose
        </span>
      </div>

      <div className={`anim-current ${currentEntry ? 'active' : ''}`}>
        <span className="anim-current-label">Now Playing</span>
        <strong>{currentEntry?.name ?? 'None'}</strong>
        {currentEntry && currentGroup ? <span>{currentGroup.label}</span> : null}
      </div>

      <div className="batch-row">
        <button
          className="btn-xs"
          onClick={() => setAnimationGroupEnabled(setSequencerSettings, 'base', true, true)}
          type="button"
        >
          Base Only
        </button>
        <button
          className="btn-xs"
          onClick={() =>
            setSequencerSettings((current) => ({
              ...current,
              playlist: current.playlist.map((entry) => ({
                ...entry,
                enabled:
                  entry.purpose === 'emotion' ||
                  entry.purpose === 'gesture' ||
                  (entry.loopEligible !== false && !entry.experimental),
              })),
            }))
          }
          type="button"
        >
          Base + React
        </button>
        <button
          className="btn-xs"
          onClick={() =>
            setSequencerSettings((current) => ({
              ...current,
              currentIndex: -1,
              playlist: current.playlist.map((entry) => ({
                ...entry,
                enabled: false,
              })),
            }))
          }
          type="button"
        >
          Disable All
        </button>
        <label className="btn-xs btn-xs-file">
          + Import Motion
          <input
            accept=".fbx,.glb,.gltf,.vrma,.bvh"
            className="hidden-input"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                onImportAnimationFile(file);
              }
              event.target.value = '';
            }}
            type="file"
          />
        </label>
      </div>

      <div className="playlist">
        {groupedAnimations.map((group) => {
          const enabled = group.entries.filter(({ entry }) => entry.enabled).length;
          return (
            <section className="anim-group" key={group.id}>
              <div className="anim-group-header">
                <div>
                  <div className="anim-group-title">
                    {group.label}
                    <span>
                      {enabled}/{group.entries.length} enabled
                    </span>
                  </div>
                  <p>{group.description}</p>
                </div>
                <div className="anim-group-actions">
                  <button
                    className="btn-xs"
                    onClick={() => setAnimationGroupEnabled(setSequencerSettings, group.id, true)}
                    type="button"
                  >
                    Enable
                  </button>
                  <button
                    className="btn-xs"
                    onClick={() => setAnimationGroupEnabled(setSequencerSettings, group.id, false)}
                    type="button"
                  >
                    Disable
                  </button>
                  <button
                    className="btn-xs"
                    onClick={() =>
                      setAnimationGroupEnabled(setSequencerSettings, group.id, true, true)
                    }
                    type="button"
                  >
                    Solo
                  </button>
                </div>
              </div>
              <div className="anim-group-list">
                {group.entries.map(({ entry, index }) => renderAnimationRow(entry, index))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
