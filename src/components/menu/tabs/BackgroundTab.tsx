import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { VisualSettings } from '../../../lib/menu/types';
import type { DesktopWindowMode } from '../../../lib/desktop/runtime';

type DesktopRuntimeStatus = {
  backendPort: string;
  clickThrough: boolean;
  mode: DesktopWindowMode;
};

type BackgroundTabProps = {
  activePersonaName: string;
  setVisualSettings: Dispatch<SetStateAction<VisualSettings>>;
  visualSettings: VisualSettings;
};

export function BackgroundTab({
  activePersonaName,
  setVisualSettings,
  visualSettings,
}: BackgroundTabProps) {
  const [desktopRuntime, setDesktopRuntime] = useState<DesktopRuntimeStatus | null>(null);

  const customControlFallbackMode =
    visualSettings.sceneBackgroundMode === 'chroma' ||
    visualSettings.sceneBackgroundMode === 'transparent'
      ? 'custom'
      : visualSettings.sceneBackgroundMode;

  const updateVisualSettings = (patch: Partial<VisualSettings>) => {
    setVisualSettings((current) => ({
      ...current,
      ...patch,
    }));
  };

  useEffect(() => {
    const desktopBridge = window.webWaifuDesktop;
    if (!desktopBridge?.isDesktop) {
      setDesktopRuntime(null);
      return undefined;
    }

    desktopBridge
      .getRuntime?.()
      .then((runtime) => setDesktopRuntime(runtime))
      .catch(() => {
        setDesktopRuntime({
          backendPort: desktopBridge.backendPort ?? '8797',
          clickThrough: false,
          mode: desktopBridge.mode ?? 'editor',
        });
      });

    return desktopBridge.onRuntimeChanged?.((runtime) => setDesktopRuntime(runtime));
  }, []);

  const transparentWindowActive =
    desktopRuntime?.mode === 'desktop' || desktopRuntime?.mode === 'overlay';
  const transparentSceneActive = visualSettings.sceneBackgroundMode === 'transparent';

  const setTransparentScene = () => {
    updateVisualSettings({ sceneBackgroundMode: 'transparent' });
  };

  const relaunchTransparentWindow = () => {
    setTransparentScene();
    void window.webWaifuDesktop?.relaunchWindowMode?.('desktop');
  };

  const relaunchTransparentOverlay = () => {
    setTransparentScene();
    void window.webWaifuDesktop?.relaunchWindowMode?.('overlay');
  };

  const setClickThrough = (enabled: boolean) => {
    void window.webWaifuDesktop
      ?.setClickThrough?.(enabled)
      .then((runtime) => setDesktopRuntime(runtime))
      .catch(() => undefined);
  };

  return (
    <>
      <div className="control-group">
        <div className="control-label">Scene Background</div>
        <select
          className="select-tech"
          onChange={(event) =>
            updateVisualSettings({
              sceneBackgroundMode: event.target.value as VisualSettings['sceneBackgroundMode'],
            })
          }
          value={visualSettings.sceneBackgroundMode}
        >
          <option value="persona">Auto-load character background</option>
          <option value="custom">Custom image / URL</option>
          <option value="chroma">Chroma key color</option>
          <option value="transparent">Transparent</option>
        </select>
        <div className="status-grid">
          <div className="status-copy">
            Character <strong>{activePersonaName}</strong>
          </div>
          <div className="status-copy">
            Mode <strong>{visualSettings.sceneBackgroundMode}</strong>
          </div>
        </div>
        <div className="field-hint">
          Persona mode follows the selected character. Custom mode overrides the background. Chroma
          mode fills the overlay with a solid key color for OBS. Transparent removes the scene
          background entirely.
        </div>
      </div>

      <div className="control-group">
        <div className="control-label">Transparency Test</div>
        <div className="status-grid">
          <div className="status-copy">
            Scene alpha <strong>{transparentSceneActive ? 'transparent' : 'painted'}</strong>
          </div>
          <div className="status-copy">
            Electron window{' '}
            <strong>
              {desktopRuntime
                ? transparentWindowActive
                  ? desktopRuntime.mode
                  : 'solid editor'
                : 'browser'}
            </strong>
          </div>
        </div>
        <div className="btn-row">
          <button className="btn-tech secondary" onClick={setTransparentScene} type="button">
            Transparent Scene
          </button>
          <button
            className="btn-tech"
            disabled={!desktopRuntime || desktopRuntime.mode === 'desktop'}
            onClick={relaunchTransparentWindow}
            type="button"
          >
            Desktop Window
          </button>
          <button
            className="btn-tech"
            disabled={!desktopRuntime || desktopRuntime.mode === 'overlay'}
            onClick={relaunchTransparentOverlay}
            type="button"
          >
            OBS Overlay
          </button>
        </div>
        {desktopRuntime ? (
          <div className="btn-row">
            <button
              className={`btn-tech ${desktopRuntime.clickThrough ? '' : 'secondary'}`}
              disabled={!transparentWindowActive}
              onClick={() => setClickThrough(!desktopRuntime.clickThrough)}
              type="button"
            >
              Click-through {desktopRuntime.clickThrough ? 'On' : 'Off'}
            </button>
            <button
              className="btn-tech secondary"
              onClick={() => updateVisualSettings({ sceneBackgroundMode: 'persona' })}
              type="button"
            >
              Painted Test
            </button>
            <button
              className="btn-tech secondary"
              onClick={() =>
                updateVisualSettings({
                  sceneBackgroundMode: 'chroma',
                  sceneChromaColor: '#ff00ff',
                })
              }
              type="button"
            >
              Magenta Test
            </button>
          </div>
        ) : null}
        <div className="field-hint">
          Real desktop alpha needs both: scene background set to Transparent and Electron launched
          as Desktop Window or OBS Overlay. Painted/Magenta tests should visibly fill the window;
          Transparent should show the desktop behind the VRM.
        </div>
      </div>

      <div className="control-group">
        <div className="control-label">Custom Background</div>
        <input
          className="input-tech"
          onChange={(event) =>
            updateVisualSettings({
              sceneBackgroundImage: event.target.value,
              sceneBackgroundMode: 'custom',
            })
          }
          placeholder="/cdn-assets/backgrounds/hikari-bedroom.png or https://..."
          type="text"
          value={visualSettings.sceneBackgroundImage}
        />
        <textarea
          className="textarea-tech textarea-tech-compact"
          onChange={(event) =>
            updateVisualSettings({
              sceneBackgroundOverlay: event.target.value,
              sceneBackgroundMode: customControlFallbackMode,
            })
          }
          placeholder="CSS overlay gradient..."
          rows={2}
          value={visualSettings.sceneBackgroundOverlay}
        />
        <input
          className="input-tech"
          onChange={(event) =>
            updateVisualSettings({
              sceneBackgroundFilter: event.target.value,
              sceneBackgroundMode: customControlFallbackMode,
            })
          }
          placeholder="saturate(1.08) brightness(0.9) contrast(1.04)"
          type="text"
          value={visualSettings.sceneBackgroundFilter}
        />
      </div>

      <div className="control-group">
        <div className="control-label">OBS Chroma Key</div>
        <div className="color-row">
          <span>Key Color</span>
          <input
            className="input-tech color-input"
            onChange={(event) =>
              updateVisualSettings({
                sceneChromaColor: event.target.value,
                sceneBackgroundMode: 'chroma',
              })
            }
            type="color"
            value={visualSettings.sceneChromaColor}
          />
        </div>
        <div className="btn-row">
          <button
            className="btn-tech"
            onClick={() =>
              updateVisualSettings({
                sceneBackgroundMode: 'chroma',
                sceneChromaColor: '#00ff00',
              })
            }
            type="button"
          >
            Green Key
          </button>
          <button
            className="btn-tech secondary"
            onClick={() => updateVisualSettings({ sceneBackgroundMode: 'persona' })}
            type="button"
          >
            Auto Background
          </button>
          <button
            className="btn-tech secondary"
            onClick={() => updateVisualSettings({ sceneBackgroundMode: 'transparent' })}
            type="button"
          >
            Transparent
          </button>
        </div>
        <div className="field-hint">
          Use chroma mode for transparent-style OBS workflows. The VRM and UI stay rendered; only
          the scene background becomes the key color.
        </div>
      </div>
    </>
  );
}
