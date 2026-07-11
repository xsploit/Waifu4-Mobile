import {
  app,
  BrowserWindow,
  Menu,
  ipcMain,
  net as electronNet,
  protocol,
  shell,
  screen,
} from 'electron';
import http from 'node:http';
import fs from 'node:fs';
import nodeNet from 'node:net';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
let backendPort = normalizePort(process.env.ELECTRON_BOT_PORT || process.env.BOT_PORT || '8797');
const devServerUrl = (process.env.ELECTRON_DEV_SERVER_URL || '').trim();
const externalBackend = process.env.ELECTRON_BACKEND_EXTERNAL === 'true';
const allowedWindowModes = new Set(['editor', 'desktop', 'overlay']);
const BACKEND_MAX_EARLY_RESTARTS = 6;
const BACKEND_APP_ID = 'webwaifu4-rebuild';
const BACKEND_OWNER_HEADER = 'x-webwaifu-backend-owner-token';

let mainWindow = null;
let windowMode = readInitialWindowMode();
let clickThrough = false;
let appProtocolRegistered = false;
let backendProcess = null;
let backendStopping = null;
let quitAfterBackendStop = false;
let desktopControlsVisible = true;
let backendRestartTimer = null;
let backendStartedAt = 0;
let backendEarlyExitCount = 0;
let memoryDbRecoveryCount = 0;
let backendOwnerToken = '';
let reusedOwnedBackend = false;

app.commandLine.appendSwitch('high-dpi-support', '1');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
if (
  process.argv.includes('--transparent-software') ||
  process.env.ELECTRON_TRANSPARENT_SOFTWARE === 'true'
) {
  app.disableHardwareAcceleration();
}
protocol.registerSchemesAsPrivileged([
  {
    privileges: {
      bypassCSP: false,
      corsEnabled: true,
      secure: true,
      standard: true,
      stream: true,
      supportFetchAPI: true,
    },
    scheme: 'webwaifu',
  },
]);

function readInitialWindowMode() {
  const argMode = process.argv
    .find((arg) => arg.startsWith('--window-mode='))
    ?.split('=')
    .slice(1)
    .join('=');
  const mode = (argMode || process.env.ELECTRON_WINDOW_MODE || 'editor').toLowerCase();
  return allowedWindowModes.has(mode) ? mode : 'editor';
}

function getWindowOptions(mode) {
  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay.workArea;
  const transparent = mode !== 'editor';
  const overlay = mode === 'overlay';

  return {
    width: overlay ? Math.round(workArea.width * 0.42) : Math.min(1480, workArea.width),
    height: overlay ? Math.round(workArea.height * 0.72) : Math.min(960, workArea.height),
    minWidth: overlay ? 320 : 1040,
    minHeight: overlay ? 360 : 720,
    x: overlay ? workArea.x + workArea.width - Math.round(workArea.width * 0.42) - 24 : undefined,
    y: overlay ? workArea.y + 24 : undefined,
    title: 'WebWaifu 4',
    backgroundColor: transparent ? '#00000000' : '#02040a',
    backgroundMaterial: 'none',
    frame: !transparent,
    transparent,
    hasShadow: !transparent,
    resizable: !transparent,
    fullscreenable: !transparent,
    skipTaskbar: overlay,
    alwaysOnTop: transparent,
    useContentSize: false,
    show: false,
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(appRoot, 'electron', 'preload.mjs'),
      sandbox: false,
    },
  };
}

function normalizePort(value) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return String(Number.isFinite(parsed) && parsed > 0 && parsed < 65536 ? parsed : 8797);
}

function requestBackendJson(port, requestPath, timeout = 1500, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = http.get(
      {
        headers,
        host: '127.0.0.1',
        path: requestPath,
        port,
        timeout,
      },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => {
          if (response.statusCode && response.statusCode >= 400) {
            reject(new Error(`Backend ${requestPath} returned HTTP ${response.statusCode}.`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    request.on('error', reject);
    request.on('timeout', () => {
      request.destroy(new Error(`Timed out warming backend route ${requestPath}`));
    });
  });
}

function postBackendJson(port, requestPath, timeout = 1500, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        headers,
        host: '127.0.0.1',
        method: 'POST',
        path: requestPath,
        port,
        timeout,
      },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => {
          if (response.statusCode && response.statusCode >= 400) {
            reject(new Error(`Backend ${requestPath} returned HTTP ${response.statusCode}.`));
            return;
          }
          try {
            resolve(body ? JSON.parse(body) : null);
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    request.on('error', reject);
    request.on('timeout', () => {
      request.destroy(new Error(`Timed out posting backend route ${requestPath}`));
    });
    request.end();
  });
}

async function warmUpBackendRuntime(port) {
  await requestBackendJson(port, '/memory/status');
  await requestBackendJson(port, '/memory/grillo/runtime');
  await requestBackendJson(port, '/memory/relationships');
}

function canListenOnHostPort(host, port) {
  return new Promise((resolve) => {
    const probe = nodeNet.createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => {
      probe.close(() => resolve(true));
    });
    probe.listen({
      exclusive: true,
      host,
      port: Number(port),
    });
  });
}

async function canListenOnPort(port) {
  if (!(await canListenOnHostPort('127.0.0.1', port))) {
    return false;
  }
  if (!(await canListenOnHostPort('::', port))) {
    return false;
  }
  return true;
}

async function findAvailablePort(startPort) {
  for (let port = startPort; port < startPort + 50 && port < 65536; port += 1) {
    if (await canListenOnPort(String(port))) {
      return String(port);
    }
  }
  throw new Error(`No available backend port near ${startPort}.`);
}

function getBackendOwnerTokenPath() {
  return path.join(app.getPath('userData'), 'backend-owner-token');
}

function readOrCreateBackendOwnerToken() {
  if (backendOwnerToken) {
    return backendOwnerToken;
  }
  const configured = (process.env.WEBWAIFU_BACKEND_OWNER_TOKEN || '').trim();
  if (/^[a-f0-9]{32,128}$/i.test(configured)) {
    backendOwnerToken = configured;
    return backendOwnerToken;
  }
  const tokenPath = getBackendOwnerTokenPath();
  try {
    const existing = fs.readFileSync(tokenPath, 'utf8').trim();
    if (/^[a-f0-9]{32,128}$/i.test(existing)) {
      backendOwnerToken = existing;
      return backendOwnerToken;
    }
  } catch {
    // Missing or unreadable token files are replaced below.
  }
  backendOwnerToken = randomBytes(32).toString('hex');
  try {
    fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
    fs.writeFileSync(tokenPath, backendOwnerToken, { mode: 0o600 });
  } catch (error) {
    logDesktop(`failed to persist backend owner token: ${formatError(error)}`);
  }
  return backendOwnerToken;
}

function getBackendOwnerHeaders() {
  return {
    [BACKEND_OWNER_HEADER]: readOrCreateBackendOwnerToken(),
  };
}

async function getCompatibleOwnedBackendHealth(port) {
  try {
    const health = await requestBackendJson(port, '/health', 1500, getBackendOwnerHeaders());
    const desktopBackend = health?.desktopBackend;
    if (
      desktopBackend?.appId === BACKEND_APP_ID &&
      desktopBackend?.ownerTokenMatched === true &&
      desktopBackend?.shutdownSupported === true
    ) {
      return health;
    }
  } catch {
    // Busy non-HTTP ports and older backends are not reusable.
  }
  return null;
}

async function waitForBackendHealth(port) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const health = await requestBackendJson(port, '/health', 1500, getBackendOwnerHeaders());
      const desktopBackend = health?.desktopBackend;
      if (
        desktopBackend?.appId === BACKEND_APP_ID &&
        desktopBackend?.ownerTokenMatched === true
      ) {
        return;
      }
    } catch {
      // Backend may still be booting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Owned local backend did not become healthy on port ${port}.`);
}

async function startBackendIfNeeded(recoveredFromStartupCrash = false) {
  if (externalBackend) {
    logDesktop('backend external mode enabled; not starting bundled backend');
    return;
  }

  if (backendProcess) {
    return;
  }

  if (!(await canListenOnPort(backendPort))) {
    const requestedPort = backendPort;
    const ownedHealth = await getCompatibleOwnedBackendHealth(requestedPort);
    if (ownedHealth) {
      reusedOwnedBackend = true;
      logDesktop(`reusing compatible owned backend on ${requestedPort}`);
      await warmUpBackendRuntime(requestedPort);
      return;
    }
    backendPort = await findAvailablePort(Number.parseInt(requestedPort, 10) + 1);
    console.warn(
      `[desktop] port ${requestedPort} is busy; starting this app backend on ${backendPort}`,
    );
  }
  reusedOwnedBackend = false;

  process.env.BOT_PORT = backendPort;
  process.env.PORT = backendPort;
  process.env.HOST = '127.0.0.1';
  process.env.WEBWAIFU_BACKEND_APP_ID = BACKEND_APP_ID;
  process.env.WEBWAIFU_BACKEND_OWNER_TOKEN = readOrCreateBackendOwnerToken();
  process.env.TWITCH_MOCK ??= 'true';
  process.env.VITE_BOT_PORT = backendPort;
  process.env.WEBWAIFU_MEMORY_DB_DIR ??= path.join(app.getPath('userData'), 'ladybug-memory.db');

  const serverEntry = resolveBackendServerEntry();
  if (!fs.existsSync(serverEntry)) {
    throw new Error(`Missing compiled backend: ${serverEntry}. Run npm run build first.`);
  }

  const nodeBinary = resolveNodeRuntimeBinary();
  logDesktop(`starting backend node=${nodeBinary} entry=${serverEntry} port=${backendPort}`);
  backendStartedAt = Date.now();
  backendProcess = spawn(nodeBinary, [serverEntry], {
    cwd: app.isPackaged ? process.resourcesPath : appRoot,
    env: {
      ...process.env,
      BOT_PORT: backendPort,
      PORT: backendPort,
      HOST: '127.0.0.1',
      TWITCH_MOCK: process.env.TWITCH_MOCK ?? 'true',
      VITE_BOT_PORT: backendPort,
      WEBWAIFU_BACKEND_APP_ID: BACKEND_APP_ID,
      WEBWAIFU_BACKEND_OWNER_TOKEN: readOrCreateBackendOwnerToken(),
      WEBWAIFU_MEMORY_DB_DIR:
        process.env.WEBWAIFU_MEMORY_DB_DIR ??
        path.join(app.getPath('userData'), 'ladybug-memory.db'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  backendProcess.once('error', (error) => {
    logDesktop(`backend process failed to start: ${formatError(error)}`);
  });
  backendProcess.stdout?.on('data', (chunk) => {
    logDesktop(`[backend:stdout] ${chunk.toString().trimEnd()}`);
    process.stdout.write(`[backend] ${chunk}`);
  });
  backendProcess.stderr?.on('data', (chunk) => {
    logDesktop(`[backend:stderr] ${chunk.toString().trimEnd()}`);
    process.stderr.write(`[backend] ${chunk}`);
  });
  backendProcess.once('exit', (code, signal) => {
    if (backendProcess) {
      logDesktop(`backend exited code=${code ?? 'null'} signal=${signal ?? 'null'}`);
    }
    backendProcess = null;
    scheduleBackendRestartIfNeeded();
  });
  try {
    await waitForBackendHealth(backendPort);
    await warmUpBackendRuntime(backendPort);
  } catch (error) {
    logDesktop(`backend startup warmup failed: ${formatError(error)}`);
    await stopBackendIfNeeded().catch(() => {});
    if (!recoveredFromStartupCrash && memoryDbRecoveryCount < 1) {
      memoryDbRecoveryCount += 1;
      try {
        rotateMemoryDbForRecovery();
      } catch (rotateError) {
        logDesktop(`failed to rotate Ladybug memory DB: ${formatError(rotateError)}`);
      }
      return startBackendIfNeeded(true);
    }
    throw error;
  }
  logDesktop(`backend healthy on port ${backendPort}`);
}

async function stopBackendIfNeeded() {
  if (externalBackend) {
    return;
  }
  if (!backendProcess) {
    if (reusedOwnedBackend) {
      await postBackendJson(backendPort, '/desktop/shutdown', 1500, getBackendOwnerHeaders()).catch(
        (error) => {
          logDesktop(`failed to request reused backend shutdown: ${formatError(error)}`);
        },
      );
      reusedOwnedBackend = false;
    }
    return;
  }
  const child = backendProcess;
  backendStopping ??= new Promise((resolve) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 3000);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
    child.kill('SIGTERM');
  }).finally(() => {
    if (backendProcess === child) {
      backendProcess = null;
    }
    backendStopping = null;
  });
  await backendStopping;
}

function resolveNodeRuntimeBinary() {
  const configured = (process.env.WEBWAIFU_NODE_BINARY || '').trim();
  if (configured) {
    return configured;
  }
  if (app.isPackaged) {
    const packagedNode = path.join(
      process.resourcesPath,
      'desktop-runtime',
      process.platform === 'win32' ? 'node.exe' : 'node',
    );
    if (fs.existsSync(packagedNode)) {
      return packagedNode;
    }
  }
  return process.platform === 'win32' ? 'node.exe' : 'node';
}

function resolveBackendServerEntry() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar.unpacked', 'server', 'dist', 'index.js');
  }
  return path.join(appRoot, 'server', 'dist', 'index.js');
}

function getMemoryDbPath() {
  return (
    process.env.WEBWAIFU_MEMORY_DB_DIR ||
    path.join(app.getPath('userData'), 'ladybug-memory.db')
  );
}

function rotateMemoryDbForRecovery() {
  const dbPath = getMemoryDbPath();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  let rotated = false;
  for (const candidate of [dbPath, `${dbPath}.wal`]) {
    if (!fs.existsSync(candidate)) {
      continue;
    }
    const target = `${candidate}.crash-backup-${stamp}`;
    fs.renameSync(candidate, target);
    logDesktop(`rotated Ladybug memory DB after backend crash: ${candidate} -> ${target}`);
    rotated = true;
  }
  return rotated;
}

function scheduleBackendRestartIfNeeded() {
  if (externalBackend || quitAfterBackendStop || backendStopping || !mainWindow) {
    return;
  }
  const runtimeMs = Date.now() - backendStartedAt;
  if (runtimeMs < 10000) {
    backendEarlyExitCount += 1;
  } else {
    backendEarlyExitCount = 0;
  }
  if (backendEarlyExitCount >= 2 && memoryDbRecoveryCount < 1) {
    memoryDbRecoveryCount += 1;
    backendEarlyExitCount = 0;
    try {
      rotateMemoryDbForRecovery();
    } catch (error) {
      logDesktop(`failed to rotate Ladybug memory DB: ${formatError(error)}`);
    }
  }
  if (backendEarlyExitCount >= BACKEND_MAX_EARLY_RESTARTS) {
    logDesktop(`backend restart limit reached after ${backendEarlyExitCount} early exits`);
    mainWindow?.webContents.send(
      'desktop-window-mode-changed',
      getDesktopRuntime({ backendFailed: true }),
    );
    return;
  }
  if (backendRestartTimer) {
    clearTimeout(backendRestartTimer);
  }
  backendRestartTimer = setTimeout(() => {
    backendRestartTimer = null;
    startBackendIfNeeded()
      .then(() => {
        mainWindow?.webContents.send('desktop-window-mode-changed', getDesktopRuntime());
      })
      .catch((error) => {
        logDesktop(`backend restart failed: ${formatError(error)}`);
        scheduleBackendRestartIfNeeded();
      });
  }, 1000);
}

function getDesktopLogPath() {
  try {
    return path.join(app.getPath('userData'), 'desktop-main.log');
  } catch {
    return path.join(appRoot, 'desktop-main.log');
  }
}

function logDesktop(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  try {
    fs.mkdirSync(path.dirname(getDesktopLogPath()), { recursive: true });
    fs.appendFileSync(getDesktopLogPath(), line);
  } catch {
    // Logging must not block app startup.
  }
  console.log(`[desktop] ${message}`);
}

function formatError(error) {
  return error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
}

function resolveRendererFile(requestUrl) {
  const distDir = path.join(appRoot, 'dist');
  const url = new URL(requestUrl);
  const safePath = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
  const candidate = path.resolve(distDir, safePath);
  const insideDist = candidate === distDir || candidate.startsWith(`${distDir}${path.sep}`);
  return insideDist && fs.existsSync(candidate) ? candidate : path.join(distDir, 'index.html');
}

function registerRendererProtocol() {
  if (devServerUrl) {
    return Promise.resolve(devServerUrl);
  }

  const distDir = path.join(appRoot, 'dist');
  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    throw new Error(
      `Missing built UI: ${path.join(distDir, 'index.html')}. Run npm run build first.`,
    );
  }

  if (!appProtocolRegistered) {
    protocol.handle('webwaifu', (request) => {
      const filePath = resolveRendererFile(request.url);
      return electronNet.fetch(pathToFileURL(filePath).toString());
    });
    appProtocolRegistered = true;
  }

  return Promise.resolve('webwaifu://app/index.html');
}

function buildRendererUrl(baseUrl) {
  const url = new URL(baseUrl);
  url.searchParams.set('desktop', '1');
  url.searchParams.set('desktopMode', windowMode);
  url.searchParams.set('botPort', backendPort);
  url.searchParams.set('backendOwner', getBackendOwnerMode());
  return url.toString();
}

function getBackendOwnerMode() {
  return externalBackend ? 'external' : 'owned';
}

function getDesktopRuntime(extra = {}) {
  return {
    ...extra,
    backendOwned: !externalBackend,
    backendOwner: getBackendOwnerMode(),
    backendPort,
    backendReused: reusedOwnedBackend,
    backendUrl: `http://127.0.0.1:${backendPort}`,
    clickThrough,
    mode: windowMode,
  };
}

async function createWindow() {
  await startBackendIfNeeded();
  const rendererBaseUrl = await registerRendererProtocol();

  mainWindow = new BrowserWindow(getWindowOptions(windowMode));
  mainWindow.setBackgroundColor(windowMode === 'editor' ? '#02040a' : '#00000000');
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const target = new URL(url);
    const current = new URL(mainWindow?.webContents.getURL() || rendererBaseUrl);
    if (target.origin !== current.origin) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  await mainWindow.loadURL(buildRendererUrl(rendererBaseUrl));
  applyLiveWindowOptions();
  installMenu();
}

function applyLiveWindowOptions() {
  if (!mainWindow) {
    return;
  }
  const transparent = windowMode !== 'editor';
  mainWindow.setAlwaysOnTop(transparent, transparent ? 'floating' : 'normal');
  mainWindow.setSkipTaskbar(windowMode === 'overlay');
  mainWindow.setIgnoreMouseEvents(clickThrough, { forward: true });
  mainWindow.setAutoHideMenuBar(transparent);
  mainWindow.setMenuBarVisibility(!transparent);
  mainWindow.webContents.send('desktop-window-mode-changed', getDesktopRuntime());
}

function relaunchWithMode(mode) {
  if (!allowedWindowModes.has(mode) || mode === windowMode) {
    return;
  }
  app.relaunch({
    args: [
      ...process.argv.slice(1).filter((arg) => !arg.startsWith('--window-mode=')),
      `--window-mode=${mode}`,
    ],
  });
  requestExitAfterBackendStop();
}

function requestExitAfterBackendStop() {
  quitAfterBackendStop = true;
  if (backendRestartTimer) {
    clearTimeout(backendRestartTimer);
    backendRestartTimer = null;
  }
  if (externalBackend || (!backendProcess && !reusedOwnedBackend)) {
    app.exit(0);
    return;
  }
  void stopBackendIfNeeded().finally(() => app.exit(0));
}

function installMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'Open Editor Window', click: () => relaunchWithMode('editor') },
        { label: 'Open Desktop Transparent Window', click: () => relaunchWithMode('desktop') },
        { label: 'Open OBS Overlay Window', click: () => relaunchWithMode('overlay') },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        {
          label: 'Show Menu Bar',
          type: 'checkbox',
          checked: windowMode === 'editor',
          click: (item) => {
            mainWindow?.setAutoHideMenuBar(!item.checked);
            mainWindow?.setMenuBarVisibility(item.checked);
          },
        },
        {
          label: 'Show Desktop Controls',
          type: 'checkbox',
          checked: desktopControlsVisible,
          click: (item) => {
            desktopControlsVisible = item.checked;
            mainWindow?.webContents.send('desktop-controls-visibility', desktopControlsVisible);
          },
        },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { label: 'Relaunch as Editor', click: () => relaunchWithMode('editor') },
        { label: 'Relaunch as Desktop Transparent', click: () => relaunchWithMode('desktop') },
        { label: 'Relaunch as Overlay', click: () => relaunchWithMode('overlay') },
        { type: 'separator' },
        {
          label: 'Click Through Overlay',
          type: 'checkbox',
          checked: clickThrough,
          click: (item) => {
            clickThrough = item.checked;
            applyLiveWindowOptions();
          },
        },
      ],
    },
    {
      label: 'Background',
      submenu: [
        {
          label: 'Transparent Scene',
          click: () => {
            mainWindow?.webContents.send('desktop-scene-background-mode', 'transparent');
          },
        },
        {
          label: 'Chroma Key Scene',
          click: () => {
            mainWindow?.webContents.send('desktop-scene-background-mode', 'chroma');
          },
        },
        {
          label: 'Character Background Scene',
          click: () => {
            mainWindow?.webContents.send('desktop-scene-background-mode', 'persona');
          },
        },
        { type: 'separator' },
        {
          label: 'Transparent Desktop Window',
          click: () => {
            mainWindow?.webContents.send('desktop-scene-background-mode', 'transparent');
            relaunchWithMode('desktop');
          },
        },
        {
          label: 'Transparent OBS Overlay Window',
          click: () => {
            mainWindow?.webContents.send('desktop-scene-background-mode', 'transparent');
            relaunchWithMode('overlay');
          },
        },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About WebWaifu 4',
          click: () => {
            mainWindow?.webContents.send('desktop-open-about');
          },
        },
        {
          label: 'Open Project on GitHub',
          click: () => {
            void shell.openExternal('https://github.com/xsploit/webwaifu4-rebuild');
          },
        },
      ],
    },
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
  mainWindow?.setMenu(menu);
}

ipcMain.handle('desktop:get-runtime', () => getDesktopRuntime());

ipcMain.handle('desktop:set-click-through', (_event, enabled) => {
  clickThrough = Boolean(enabled);
  applyLiveWindowOptions();
  return getDesktopRuntime();
});

ipcMain.handle('desktop:relaunch-window-mode', (_event, mode) => {
  relaunchWithMode(String(mode));
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', (event) => {
  quitAfterBackendStop = true;
  if (backendRestartTimer) {
    clearTimeout(backendRestartTimer);
    backendRestartTimer = null;
  }
  if (externalBackend || (!backendProcess && !reusedOwnedBackend)) {
    return;
  }
  event.preventDefault();
  void stopBackendIfNeeded().finally(() => app.quit());
});

app
  .whenReady()
  .then(createWindow)
  .catch((error) => {
    console.error('[desktop] failed to start', error);
    app.quit();
  });
