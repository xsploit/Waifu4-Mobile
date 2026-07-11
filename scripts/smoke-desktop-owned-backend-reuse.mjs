import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import WebSocket from 'ws';

const args = process.argv.slice(2);

function getArg(name, fallback = '') {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1] || fallback;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestJson(url, timeoutMs = 1500, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { headers, timeout: timeoutMs }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        try {
          resolve({ body: body ? JSON.parse(body) : null, status: response.statusCode ?? 0 });
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on('error', reject);
    request.on('timeout', () => {
      request.destroy(new Error(`Timed out requesting ${url}`));
    });
  });
}

async function waitForJson(url, timeoutMs, predicate, headers = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const result = await requestJson(url, 1500, headers);
      if (predicate(result)) {
        return result.body;
      }
      lastError = new Error(`HTTP ${result.status}`);
    } catch (error) {
      lastError = error;
    }
    await wait(500);
  }
  throw new Error(
    `Timed out waiting for ${url}: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

async function waitForClosed(port, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await requestJson(`http://127.0.0.1:${port}/health`, 750);
    } catch {
      return;
    }
    await wait(250);
  }
  throw new Error(`Owned backend port ${port} stayed open after Electron quit.`);
}

async function waitForDebugPage(debugPort, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const result = await requestJson(`http://127.0.0.1:${debugPort}/json/list`);
      const pages = Array.isArray(result.body) ? result.body : [];
      const page = pages.find((entry) => entry.type === 'page' && entry.webSocketDebuggerUrl);
      if (page) {
        return page;
      }
    } catch {
      // Electron may still be booting.
    }
    await wait(250);
  }
  throw new Error(`No Electron renderer debug page appeared on ${debugPort}.`);
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
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) {
      reject(new Error(message.error.message || `CDP command ${message.id} failed.`));
    } else {
      resolve(message.result);
    }
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { reject, resolve });
      socket.send(JSON.stringify({ id, method, params }));
    });

  return {
    close: () => socket.close(),
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
    throw new Error(
      details.exception?.description || details.exception?.value || details.text || 'Renderer evaluation failed.',
    );
  }
  return JSON.parse(result.result?.value ?? 'null');
}

function killProcessTree(pid) {
  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // Process already exited.
  }
}

async function main() {
  const repoRoot = path.resolve(process.cwd());
  const port = Number.parseInt(getArg('--port', '8797'), 10);
  const debugPort = Number.parseInt(getArg('--debug-port', '9336'), 10);
  const timeoutMs = Number.parseInt(getArg('--timeout-ms', '40000'), 10);
  const ownerToken = getArg(
    '--owner-token',
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  );
  const memoryDbPath = path.join(
    process.env.TEMP || repoRoot,
    `webwaifu4-owned-backend-reuse-${port}.db`,
  );
  const exePath =
    getArg('--exe') || path.join(repoRoot, 'release', 'win-unpacked', 'WebWaifu 4.exe');
  const serverEntry = path.join(repoRoot, 'server', 'dist', 'index.js');

  if (!fs.existsSync(exePath)) {
    throw new Error(`Packaged EXE is missing: ${exePath}`);
  }
  if (!fs.existsSync(serverEntry)) {
    throw new Error(`Compiled backend is missing: ${serverEntry}`);
  }
  fs.rmSync(memoryDbPath, { force: true, recursive: true });
  fs.rmSync(`${memoryDbPath}.wal`, { force: true, recursive: true });

  const env = {
    ...process.env,
    BOT_PORT: String(port),
    PORT: String(port),
    HOST: '127.0.0.1',
    SERVER_PROVIDER_PROXY_ENABLED: 'false',
    TWITCH_MOCK: 'true',
    WEBWAIFU_BACKEND_APP_ID: 'webwaifu4-rebuild',
    WEBWAIFU_BACKEND_OWNER_TOKEN: ownerToken,
    WEBWAIFU_MEMORY_DB_DIR: memoryDbPath,
  };
  let backendProcess = null;
  let appProcess = null;
  let cdp = null;
  try {
    backendProcess = spawn(process.execPath, [serverEntry], {
      cwd: repoRoot,
      env,
      stdio: 'ignore',
      windowsHide: true,
    });
    const ownerHeaders = { 'x-webwaifu-backend-owner-token': ownerToken };
    const ownedHealth = await waitForJson(
      `http://127.0.0.1:${port}/health`,
      timeoutMs,
      (result) =>
        result.status === 200 &&
        result.body?.desktopBackend?.appId === 'webwaifu4-rebuild' &&
        result.body?.desktopBackend?.ownerTokenMatched === true,
      ownerHeaders,
    );

    appProcess = spawn(exePath, [`--remote-debugging-port=${debugPort}`], {
      cwd: path.dirname(exePath),
      env,
      detached: false,
      stdio: 'ignore',
      windowsHide: true,
    });

    const page = await waitForDebugPage(debugPort, timeoutMs);
    cdp = connectCdp(page.webSocketDebuggerUrl);
    await cdp.waitOpen();
    await cdp.send('Runtime.enable');
    await wait(1000);
    const renderer = await evaluateJson(
      cdp,
      `(async () => JSON.stringify({
        backendOwner: window.webWaifuDesktop?.getBackendOwner?.() || window.webWaifuDesktop?.backendOwner || null,
        backendPort: window.webWaifuDesktop?.getBackendPort?.() || window.webWaifuDesktop?.backendPort || null,
        runtime: await window.webWaifuDesktop?.getRuntime?.(),
        health: await fetch('http://127.0.0.1:${port}/health').then((r) => r.json())
      }))()`,
    );
    if (String(renderer.backendPort) !== String(port)) {
      throw new Error(`Renderer backend port ${renderer.backendPort} did not reuse ${port}.`);
    }
    if (renderer.backendOwner !== 'owned' || renderer.runtime?.backendReused !== true) {
      throw new Error(`Renderer did not report owned backend reuse: ${JSON.stringify(renderer)}`);
    }
    if (renderer.health?.desktopBackend?.ownerTokenMatched === true) {
      throw new Error('Renderer fetch unexpectedly exposed owner-token match without the private header.');
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          ownedHealth,
          port,
          renderer,
        },
        null,
        2,
      ),
    );
  } finally {
    if (cdp) {
      try {
        cdp.sendNoWait('Browser.close');
        await wait(1500);
      } catch {
        // Fall back to process termination.
      }
      cdp.close();
    }
    if (appProcess?.pid) {
      killProcessTree(appProcess.pid);
      await wait(1000);
    }
    await waitForClosed(port).catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
      if (backendProcess?.pid) {
        killProcessTree(backendProcess.pid);
      }
    });
    fs.rmSync(memoryDbPath, { force: true, recursive: true });
    fs.rmSync(`${memoryDbPath}.wal`, { force: true, recursive: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
