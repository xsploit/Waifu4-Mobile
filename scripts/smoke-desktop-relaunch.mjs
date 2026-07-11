import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exePath = path.join(repoRoot, 'release', 'win-unpacked', 'WebWaifu 4.exe');
const debugPort = Number.parseInt(process.env.WEBWAIFU_RELAUNCH_SMOKE_DEBUG_PORT || '9334', 10);
const backendPort = process.env.WEBWAIFU_RELAUNCH_SMOKE_BACKEND_PORT || '8797';
const timeoutMs = Number.parseInt(process.env.WEBWAIFU_RELAUNCH_SMOKE_TIMEOUT_MS || '45000', 10);

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getJson(url, timeout = 2000) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { timeout }, (response) => {
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
    request.on('timeout', () => request.destroy(new Error(`Timed out fetching ${url}`)));
  });
}

async function waitForDebugPage(mode) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const pages = await getJson(`http://127.0.0.1:${debugPort}/json/list`);
      const page = pages.find((entry) => entry.type === 'page' && entry.webSocketDebuggerUrl);
      if (page) {
        const cdp = connectCdp(page.webSocketDebuggerUrl);
        await cdp.waitOpen();
        const snapshot = await evaluateJson(
          cdp,
          `JSON.stringify({
            backendPort: window.webWaifuDesktop?.getBackendPort?.() || window.webWaifuDesktop?.backendPort || null,
            mode: document.documentElement.dataset.webwaifuWindowMode || null,
            readyState: document.readyState
          })`,
        ).then(JSON.parse);
        cdp.close();
        if (!mode || snapshot.mode === mode) {
          return { page, snapshot };
        }
      }
    } catch {
      // Electron may still be booting or relaunching.
    }
    await wait(250);
  }
  throw new Error(`No Electron renderer debug page appeared for mode ${mode || 'any'}.`);
}

function connectCdp(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  let nextId = 1;
  const pending = new Map();

  socket.on('message', (raw) => {
    const message = JSON.parse(raw.toString());
    if (!message.id || !pending.has(message.id)) {
      return;
    }
    const { reject, resolve } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) {
      reject(new Error(message.error.message || `CDP command ${message.id} failed.`));
    } else {
      resolve(message.result);
    }
  });

  return {
    close: () => socket.close(),
    send: (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { reject, resolve });
        socket.send(JSON.stringify({ id, method, params }));
      }),
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
    throw new Error(details.exception?.description || details.text || 'Renderer evaluation failed.');
  }
  return result.result?.value;
}

function killPackagedProcesses() {
  if (process.platform !== 'win32') {
    return Promise.resolve();
  }
  const escapedRoot = repoRoot.replace(/'/g, "''");
  const child = spawn(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `$repo='${escapedRoot}'; Get-Process | Where-Object { ($_.ProcessName -eq 'WebWaifu 4' -and $_.Path -like "$repo\\release\\win-unpacked\\*") -or ($_.ProcessName -eq 'node' -and $_.Path -like "$repo\\release\\win-unpacked\\resources\\desktop-runtime\\node.exe") } | Stop-Process -Force -ErrorAction SilentlyContinue`,
    ],
    { stdio: 'ignore', windowsHide: true },
  );
  return new Promise((resolve) => child.once('exit', resolve));
}

async function main() {
  spawn(exePath, [`--remote-debugging-port=${debugPort}`], {
    cwd: path.dirname(exePath),
    detached: false,
    env: {
      ...process.env,
      ELECTRON_BOT_PORT: backendPort,
    },
    stdio: 'ignore',
    windowsHide: true,
  });
  try {
    const first = await waitForDebugPage('editor');
    if (String(first.snapshot.backendPort) !== backendPort) {
      throw new Error(`Initial app used backend port ${first.snapshot.backendPort}, expected ${backendPort}.`);
    }
    const cdp = connectCdp(first.page.webSocketDebuggerUrl);
    await cdp.waitOpen();
    await evaluateJson(
      cdp,
      `(() => {
        setTimeout(() => window.webWaifuDesktop.relaunchWindowMode('desktop'), 0);
        return 'scheduled';
      })()`,
    );
    cdp.close();

    const second = await waitForDebugPage('desktop');
    if (String(second.snapshot.backendPort) !== backendPort) {
      throw new Error(
        `Relaunched app used backend port ${second.snapshot.backendPort}; old backend likely stayed alive.`,
      );
    }

    const health = await getJson(`http://127.0.0.1:${backendPort}/health`);
    console.log(
      JSON.stringify(
        {
          backendPort: second.snapshot.backendPort,
          healthOk: health.ok === true,
          mode: second.snapshot.mode,
          ok: second.snapshot.mode === 'desktop' && health.ok === true,
        },
        null,
        2,
      ),
    );
  } finally {
    await killPackagedProcesses();
    await wait(1000);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
