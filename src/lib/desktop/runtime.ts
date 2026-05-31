export type DesktopWindowMode = 'editor' | 'desktop' | 'overlay';

type DesktopRuntimeBridge = {
  backendPort?: string;
  getBackendPort?: () => string;
  isDesktop?: boolean;
  mode?: DesktopWindowMode;
  getRuntime?: () => Promise<{
    backendPort: string;
    clickThrough: boolean;
    mode: DesktopWindowMode;
  }>;
  onRuntimeChanged?: (
    callback: (runtime: {
      backendPort: string;
      clickThrough: boolean;
      mode: DesktopWindowMode;
    }) => void,
  ) => () => void;
  relaunchWindowMode?: (mode: DesktopWindowMode) => Promise<void>;
  onSceneBackgroundModeRequested?: (
    callback: (mode: 'persona' | 'custom' | 'chroma' | 'transparent') => void,
  ) => () => void;
  onOpenAboutRequested?: (callback: () => void) => () => void;
  onDesktopControlsVisibilityRequested?: (callback: (visible: boolean) => void) => () => void;
  setClickThrough?: (enabled: boolean) => Promise<{
    backendPort: string;
    clickThrough: boolean;
    mode: DesktopWindowMode;
  }>;
};

declare global {
  interface Window {
    webWaifuDesktop?: DesktopRuntimeBridge;
  }
}

function readDesktopSearchParams() {
  if (typeof window === 'undefined' || !window.location) {
    return null;
  }
  return new URLSearchParams(window.location.search);
}

export function isDesktopRuntime() {
  if (typeof window === 'undefined') {
    return false;
  }
  const params = readDesktopSearchParams();
  return params?.get('desktop') === '1' || window.webWaifuDesktop?.isDesktop === true;
}

export function getDesktopBackendBaseUrl() {
  if (!isDesktopRuntime()) {
    return '';
  }
  const params = readDesktopSearchParams();
  const bridgePort =
    window.webWaifuDesktop?.getBackendPort?.() || window.webWaifuDesktop?.backendPort;
  const port = bridgePort || params?.get('botPort') || '8797';
  return `http://127.0.0.1:${port}`;
}

export function getDesktopBackendUrl(pathname: string) {
  const baseUrl = getDesktopBackendBaseUrl();
  if (!baseUrl) {
    return '';
  }
  const url = new URL(pathname, baseUrl);
  return url.toString();
}

export function getDesktopOverlaySocketUrl() {
  const baseUrl = getDesktopBackendBaseUrl();
  if (!baseUrl) {
    return '';
  }
  const url = new URL('/ws', baseUrl);
  url.protocol = 'ws:';
  return url.toString();
}
