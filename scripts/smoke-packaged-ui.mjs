import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exePath = path.join(repoRoot, 'release', 'win-unpacked', 'WebWaifu 4.exe');
const debugPort = Number.parseInt(process.env.WEBWAIFU_UI_SMOKE_DEBUG_PORT || '9333', 10);
const timeoutMs = Number.parseInt(process.env.WEBWAIFU_UI_SMOKE_TIMEOUT_MS || '30000', 10);
const args = new Set(process.argv.slice(2));
const modeArg = process.argv.find((arg) => arg.startsWith('--window-mode='));
const requestedMode = (modeArg?.split('=').slice(1).join('=') || 'editor').trim();
const shouldExerciseDesktopControls = args.has('--exercise-desktop-controls');
let observedBackendPort = null;

function getJson(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { timeout: 2000 }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on('error', reject);
    request.on('timeout', () => {
      request.destroy(new Error(`Timed out fetching ${url}`));
    });
  });
}

async function waitForDebugPage() {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const pages = await getJson(`http://127.0.0.1:${debugPort}/json/list`);
      const page = pages.find((entry) => entry.type === 'page' && entry.webSocketDebuggerUrl);
      if (page) {
        return page;
      }
    } catch {
      // Electron may still be booting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No Electron renderer debug page appeared on ${debugPort}.`);
}

function waitForChildExit(child, timeout = 5000) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeout);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function waitForBackendClosed(port, timeout = 8000) {
  if (!port) {
    return;
  }
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      await getJson(`http://127.0.0.1:${port}/health`);
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Packaged backend port ${port} stayed open after Electron quit.`);
}

async function closeElectronGracefully(cdp, child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  if (cdp) {
    try {
      cdp.sendNoWait('Browser.close');
      await waitForChildExit(child);
      return;
    } catch {
      // Fall back to process termination below.
    }
  }
  child.kill();
  await waitForChildExit(child);
}

function connectCdp(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  let nextId = 1;
  const pending = new Map();
  const events = [];

  socket.on('message', (raw) => {
    const message = JSON.parse(raw.toString());
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) {
        reject(new Error(message.error.message || `CDP command ${message.id} failed.`));
      } else {
        resolve(message.result);
      }
      return;
    }
    events.push(message);
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { reject, resolve });
      socket.send(JSON.stringify({ id, method, params }));
    });

  return {
    close: () => socket.close(),
    events,
    send,
    sendNoWait: (method, params = {}) => {
      socket.send(JSON.stringify({ id: nextId++, method, params }));
    },
    waitOpen: () =>
      new Promise((resolve, reject) => {
        socket.once('open', resolve);
        socket.once('error', reject);
      }),
  };
}

async function evaluateJson(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    awaitPromise: true,
    expression,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    const details = result.exceptionDetails;
    const description = details.exception?.description || details.exception?.value || details.text;
    const frames = details.stackTrace?.callFrames
      ?.map((frame) => `${frame.functionName || '<anonymous>'} (${frame.url || 'eval'}:${frame.lineNumber + 1}:${frame.columnNumber + 1})`)
      .join('\n');
    throw new Error([description || 'Renderer evaluation failed.', frames].filter(Boolean).join('\n'));
  }
  return result.result?.value;
}

function summarizeBadEvents(events) {
  return events
    .filter((event) => {
      if (event.method === 'Runtime.exceptionThrown') {
        return true;
      }
      if (event.method === 'Log.entryAdded') {
        return ['error', 'violation'].includes(event.params?.entry?.level);
      }
      if (event.method === 'Runtime.consoleAPICalled') {
        return ['error', 'assert'].includes(event.params?.type);
      }
      return false;
    })
    .map((event) => {
      if (event.method === 'Runtime.exceptionThrown') {
        return `exception: ${event.params?.exceptionDetails?.text || 'unknown'}`;
      }
      if (event.method === 'Log.entryAdded') {
        const entry = event.params?.entry;
        return `log:${entry?.level}: ${entry?.text || ''}`;
      }
      const args = event.params?.args ?? [];
      return `console:${event.params?.type}: ${args.map((arg) => arg.value ?? arg.description ?? '').join(' ')}`;
    });
}

const childArgs = [`--remote-debugging-port=${debugPort}`];
if (requestedMode && requestedMode !== 'editor') {
  childArgs.push(`--window-mode=${requestedMode}`);
}

const child = spawn(exePath, childArgs, {
  cwd: path.dirname(exePath),
  detached: false,
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: false,
});

let stdout = '';
let stderr = '';
child.stdout?.on('data', (chunk) => {
  stdout += chunk.toString();
});
child.stderr?.on('data', (chunk) => {
  stderr += chunk.toString();
});

let cdp;
try {
  const page = await waitForDebugPage();
  cdp = connectCdp(page.webSocketDebuggerUrl);
  await cdp.waitOpen();
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await new Promise((resolve) => setTimeout(resolve, 2500));

  await evaluateJson(
    cdp,
    `(async () => JSON.stringify(await (async () => {
      const menuButton = document.querySelector('.menu-fab');
      menuButton?.click();
      await new Promise((resolve) => setTimeout(resolve, 150));
      const opened = Boolean(document.querySelector('.settings-panel.open'));
      const twitchTab = [...document.querySelectorAll('.tab-btn')]
        .find((button) => button.textContent?.trim() === 'Twitch');
      twitchTab?.click();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const channelInput = [...document.querySelectorAll('.settings-panel input')]
        .find((input) => input.value === 'subsect' || input.placeholder?.toLowerCase().includes('channel'));
      channelInput?.focus();
      if (channelInput) {
        channelInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'a' }));
        channelInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'a' }));
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
      return {
        activeTab: document.querySelector('.tab-btn.active')?.textContent?.trim() || null,
        focusedInsidePanel: Boolean(document.activeElement?.closest('.settings-panel')),
        opened,
        stillOpen: Boolean(document.querySelector('.settings-panel.open')),
      };
    })()))()`,
  )
    .then(JSON.parse)
    .then((result) => {
      if (!result.opened || !result.stillOpen) {
        throw new Error('Settings panel closed while interacting with a tab/input.');
      }
      if (result.activeTab !== 'Twitch') {
        throw new Error(`Settings panel tab interaction failed; active tab is ${result.activeTab}.`);
      }
      if (!result.focusedInsidePanel) {
        throw new Error('Settings panel input did not retain focus inside the panel.');
      }
    });

  if (shouldExerciseDesktopControls) {
    await evaluateJson(
      cdp,
      `(async () => JSON.stringify(await (async () => {
        const runtimeBefore = await window.webWaifuDesktop?.getRuntime?.();
        const clickRuntime = await window.webWaifuDesktop?.setClickThrough?.(true);
        await window.webWaifuDesktop?.setClickThrough?.(false);
        document.querySelector('.desktop-control-strip__button:last-child')?.click();
        await new Promise((resolve) => setTimeout(resolve, 100));
        const hidden = Boolean(document.querySelector('.desktop-controls-reveal'));
        document.querySelector('.desktop-controls-reveal')?.click();
        await new Promise((resolve) => setTimeout(resolve, 100));
        const visibleAgain = Boolean(document.querySelector('.desktop-control-strip'));
        return {
          clickThroughWorked: clickRuntime?.clickThrough === true,
          hidden,
          runtimeMode: runtimeBefore?.mode || null,
          visibleAgain
        };
      })()))()`,
    )
      .then(JSON.parse)
      .then((result) => {
        if (!result.clickThroughWorked) {
          throw new Error('Desktop click-through IPC did not report enabled state.');
        }
        if (!result.hidden || !result.visibleAgain) {
          throw new Error('Desktop control strip hide/reveal did not work.');
        }
      });
  }

  const snapshot = await evaluateJson(
    cdp,
    `JSON.stringify({
      readyState: document.readyState,
      title: document.title,
      isDesktop: Boolean(window.webWaifuDesktop?.isDesktop),
      backendOwner: window.webWaifuDesktop?.getBackendOwner?.() || window.webWaifuDesktop?.backendOwner || null,
      backendPort: window.webWaifuDesktop?.getBackendPort?.() || window.webWaifuDesktop?.backendPort || null,
      mode: document.documentElement.dataset.webwaifuWindowMode || null,
      bodyText: document.body?.innerText?.slice(0, 2000) || '',
      shellTransparentClass: Boolean(document.querySelector('.shell.scene-background-transparent')),
      shellBgColor: getComputedStyle(document.querySelector('.shell')).backgroundColor,
      canvasBg: getComputedStyle(document.querySelector('canvas')).backgroundColor
    })`,
  ).then(JSON.parse);
  observedBackendPort = snapshot.backendPort;
  const runtime = await evaluateJson(
    cdp,
    `window.webWaifuDesktop?.getRuntime?.().then((runtime) => JSON.stringify(runtime))`,
  ).then(JSON.parse);

  const health = await evaluateJson(
    cdp,
    `fetch('http://127.0.0.1:' + (${JSON.stringify(snapshot.backendPort)} || '8797') + '/health').then(r => r.json()).then(j => JSON.stringify(j))`,
  ).then(JSON.parse);
  const grilloRuntime = await evaluateJson(
    cdp,
    `fetch('http://127.0.0.1:' + (${JSON.stringify(snapshot.backendPort)} || '8797') + '/memory/grillo/runtime').then(r => r.json()).then(j => JSON.stringify(j))`,
  ).then(JSON.parse);
  const memoryGraph = await evaluateJson(
    cdp,
    `fetch('http://127.0.0.1:' + (${JSON.stringify(snapshot.backendPort)} || '8797') + '/memory/graph').then(r => r.json()).then(j => JSON.stringify(j))`,
  ).then(JSON.parse);

  const badEvents = summarizeBadEvents(cdp.events).filter(
    (line) =>
      !line.includes('Download the React DevTools') &&
      !line.includes('chrome-extension://'),
  );
  const badText =
    snapshot.bodyText.includes('Objects are not valid as a React child') ||
    snapshot.bodyText.includes('A JavaScript error occurred in the main process');

  console.table([
    {
      backendPort: snapshot.backendPort,
      backendOwner: runtime?.backendOwner || snapshot.backendOwner,
      desktopBridge: snapshot.isDesktop,
      graphSummary: Boolean(memoryGraph.ok && memoryGraph.graph),
      grilloRuntime: Boolean(grilloRuntime.ok),
      health: Boolean(health.ok),
      mode: snapshot.mode,
      rendererErrors: badEvents.length,
      reactChildCrashText: badText,
      transparentClass: snapshot.shellTransparentClass,
      readyState: snapshot.readyState,
    },
  ]);

  if (!snapshot.isDesktop) {
    throw new Error('Renderer desktop bridge is missing.');
  }
  if (runtime?.backendOwner !== 'owned' || runtime?.backendOwned !== true) {
    throw new Error(`Packaged renderer reported unexpected backend owner: ${JSON.stringify(runtime)}`);
  }
  if (!health.ok) {
    throw new Error('Renderer could not reach packaged backend health.');
  }
  if (!grilloRuntime.ok) {
    throw new Error('Renderer could not reach packaged GRILLO runtime status.');
  }
  if (!memoryGraph.ok || !memoryGraph.graph || !Array.isArray(memoryGraph.graph.edges)) {
    throw new Error('Renderer could not reach packaged memory graph summary.');
  }
  if (badText) {
    throw new Error('Renderer showed known crash text.');
  }
  if (badEvents.length > 0) {
    throw new Error(`Renderer emitted errors:\n${badEvents.join('\n')}`);
  }
  if (requestedMode !== 'editor') {
    if (snapshot.mode !== requestedMode) {
      throw new Error(`Expected desktop mode ${requestedMode}, got ${snapshot.mode}.`);
    }
    if (!snapshot.shellTransparentClass) {
      throw new Error('Transparent desktop/overlay mode did not set transparent scene class.');
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  if (stdout.trim()) {
    console.error(`stdout:\n${stdout.trim().slice(-4000)}`);
  }
  if (stderr.trim()) {
    console.error(`stderr:\n${stderr.trim().slice(-4000)}`);
  }
  process.exitCode = 1;
} finally {
  await closeElectronGracefully(cdp, child);
  cdp?.close();
  await waitForBackendClosed(observedBackendPort);
}
