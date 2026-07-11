import { contextBridge, ipcRenderer } from 'electron';

const params = new URLSearchParams(globalThis.location.search);
const initialMode = params.get('desktopMode') || 'editor';
const initialBackendPort = params.get('botPort') || '8797';
const initialBackendOwner = params.get('backendOwner') || 'owned';
let currentBackendPort = initialBackendPort;
let currentBackendOwner = initialBackendOwner;

function applyDocumentFlags(mode = initialMode) {
  const root = document.documentElement;
  if (!root) {
    return;
  }
  root.dataset.webwaifuDesktop = 'true';
  root.dataset.webwaifuWindowMode = mode;
}

if (document.documentElement) {
  applyDocumentFlags(initialMode);
}
globalThis.addEventListener('DOMContentLoaded', () => applyDocumentFlags(initialMode), { once: true });

contextBridge.exposeInMainWorld('webWaifuDesktop', {
  backendOwner: initialBackendOwner,
  backendPort: initialBackendPort,
  isDesktop: true,
  mode: initialMode,
  getBackendOwner: () => currentBackendOwner,
  getBackendPort: () => currentBackendPort,
  getRuntime: () => ipcRenderer.invoke('desktop:get-runtime'),
  relaunchWindowMode: (mode) => ipcRenderer.invoke('desktop:relaunch-window-mode', mode),
  setClickThrough: (enabled) => ipcRenderer.invoke('desktop:set-click-through', enabled),
  onRuntimeChanged: (callback) => {
    const listener = (_event, runtime) => {
      if (runtime?.mode) {
        applyDocumentFlags(runtime.mode);
      }
      if (runtime?.backendPort) {
        currentBackendPort = String(runtime.backendPort);
      }
      if (runtime?.backendOwner) {
        currentBackendOwner = String(runtime.backendOwner);
      }
      callback(runtime);
    };
    ipcRenderer.on('desktop-window-mode-changed', listener);
    return () => ipcRenderer.off('desktop-window-mode-changed', listener);
  },
  onSceneBackgroundModeRequested: (callback) => {
    const listener = (_event, mode) => callback(mode);
    ipcRenderer.on('desktop-scene-background-mode', listener);
    return () => ipcRenderer.off('desktop-scene-background-mode', listener);
  },
  onOpenAboutRequested: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('desktop-open-about', listener);
    return () => ipcRenderer.off('desktop-open-about', listener);
  },
  onDesktopControlsVisibilityRequested: (callback) => {
    const listener = (_event, visible) => callback(Boolean(visible));
    ipcRenderer.on('desktop-controls-visibility', listener);
    return () => ipcRenderer.off('desktop-controls-visibility', listener);
  },
});
