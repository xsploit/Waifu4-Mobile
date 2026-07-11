import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import WebSocket from 'ws';

const args = process.argv.slice(2);

function getArg(name, fallback = '') {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1] || fallback;
}

function getRepoRoot() {
  return path.resolve(process.cwd());
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createPortBlocker(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer((socket) => socket.destroy());
    server.once('error', reject);
    server.listen({ exclusive: true, host: '127.0.0.1', port }, () => resolve(server));
  });
}

function requestJson(url, timeoutMs = 1500) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { timeout: timeoutMs }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        try {
          resolve({ body: JSON.parse(body), status: response.statusCode ?? 0 });
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

async function waitForHealth(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const result = await requestJson(`http://127.0.0.1:${port}/health`);
      if (result.status === 200 && result.body?.ok === true) {
        return result.body;
      }
      lastError = new Error(`HTTP ${result.status}`);
    } catch (error) {
      lastError = error;
    }
    await wait(500);
  }
  throw new Error(
    `Desktop backend did not become healthy on ${port}: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

async function waitForJson(url, timeoutMs, predicate) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const result = await requestJson(url);
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

async function waitForBackendClosed(port, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await requestJson(`http://127.0.0.1:${port}/health`);
    } catch {
      return;
    }
    await wait(250);
  }
  throw new Error(`Fallback backend port ${port} stayed open after Electron quit.`);
}

async function closeServer(server) {
  await new Promise((resolve) => server.close(resolve));
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
  const repoRoot = getRepoRoot();
  const requestedPort = Number.parseInt(getArg('--requested-port', '8797'), 10);
  const expectedPort = Number.parseInt(getArg('--expected-port', String(requestedPort + 1)), 10);
  const debugPort = Number.parseInt(getArg('--debug-port', '9335'), 10);
  const timeoutMs = Number.parseInt(getArg('--timeout-ms', '40000'), 10);
  const exePath =
    getArg('--exe') || path.join(repoRoot, 'release', 'win-unpacked', 'WebWaifu 4.exe');

  if (!Number.isFinite(requestedPort) || !Number.isFinite(expectedPort)) {
    throw new Error('Ports must be valid numbers.');
  }
  if (!fs.existsSync(exePath)) {
    throw new Error(`Packaged EXE is missing: ${exePath}`);
  }

  const blocker = await createPortBlocker(requestedPort);
  let appProcess = null;
  let cdp = null;
  try {
    appProcess = spawn(exePath, [`--remote-debugging-port=${debugPort}`], {
      cwd: path.dirname(exePath),
      detached: false,
      stdio: 'ignore',
      windowsHide: true,
    });

    const health = await waitForHealth(expectedPort, timeoutMs);
    const memoryStatus = await waitForJson(
      `http://127.0.0.1:${expectedPort}/memory/status`,
      timeoutMs,
      (result) => result.status === 200 && result.body?.ok !== false,
    );
    const grilloRuntime = await waitForJson(
      `http://127.0.0.1:${expectedPort}/memory/grillo/runtime`,
      timeoutMs,
      (result) => result.status === 200 && result.body?.ok === true,
    );
    const memoryGraph = await waitForJson(
      `http://127.0.0.1:${expectedPort}/memory/graph`,
      timeoutMs,
      (result) =>
        result.status === 200 &&
        result.body?.ok === true &&
        result.body?.graph &&
        Array.isArray(result.body.graph.edges),
    );
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
        desktopBridge: Boolean(window.webWaifuDesktop?.isDesktop),
        runtime: await window.webWaifuDesktop?.getRuntime?.(),
        health: await fetch('http://127.0.0.1:${expectedPort}/health').then((r) => r.json()).then((j) => j.ok === true),
        grilloRuntime: await fetch('http://127.0.0.1:${expectedPort}/memory/grillo/runtime').then((r) => r.json()).then((j) => j.ok === true),
        memoryGraph: await fetch('http://127.0.0.1:${expectedPort}/memory/graph').then((r) => r.json()).then((j) => j.ok === true && Boolean(j.graph))
      }))()`,
    );
    if (String(renderer.backendPort) !== String(expectedPort)) {
      throw new Error(`Renderer backend port ${renderer.backendPort} did not match ${expectedPort}.`);
    }
    if (renderer.backendOwner !== 'owned' || renderer.runtime?.backendOwned !== true) {
      throw new Error(`Renderer backend owner was not packaged-owned: ${JSON.stringify(renderer)}`);
    }
    if (!renderer.desktopBridge || !renderer.health || !renderer.grilloRuntime || !renderer.memoryGraph) {
      throw new Error(`Renderer fallback backend checks failed: ${JSON.stringify(renderer)}`);
    }
    console.log(
      JSON.stringify(
        {
          expectedPort,
          grilloRuntime,
          health,
          memoryGraph,
          memoryStatus,
          ok: true,
          requestedPort,
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
    await closeServer(blocker).catch(() => undefined);
    if (appProcess?.pid) {
      killProcessTree(appProcess.pid);
      await wait(1000);
    }
    await waitForBackendClosed(expectedPort).catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
