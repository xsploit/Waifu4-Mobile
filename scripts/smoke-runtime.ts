import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

const port = Number(process.env.SMOKE_PORT ?? 8798);
const baseUrl = `http://127.0.0.1:${port}`;

type Check = {
  name: string;
  method?: 'GET' | 'POST';
  path: string;
  body?: unknown;
  expectedStatus: number;
};

const checks: Check[] = [
  { name: 'health', path: '/health', expectedStatus: 200 },
  { name: 'twitch runtime', path: '/twitch/runtime/status', expectedStatus: 200 },
  { name: 'memory status', path: '/memory/status', expectedStatus: 200 },
  {
    name: 'main chat no-key guard',
    method: 'POST',
    path: '/ai/chat',
    expectedStatus: 401,
    body: {
      provider: 'openrouter-responses',
      model: 'deepseek/deepseek-v4-flash',
      messages: [{ role: 'user', content: 'hi' }],
      stream: false,
    },
  },
  {
    name: 'tts no-key guard',
    method: 'POST',
    path: '/tts/stream',
    expectedStatus: 401,
    body: { provider: 'fish', text: 'hi' },
  },
  {
    name: 'voice list no-key guard',
    path: '/tts/voices?provider=fish-speech',
    expectedStatus: 401,
  },
  {
    name: 'voice create validation guard',
    method: 'POST',
    path: '/tts/voices/create',
    expectedStatus: 400,
    body: { provider: 'fish-speech', name: '', sampleBase64: '' },
  },
];

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Server is still starting.
    }
    await delay(250);
  }
  throw new Error(`Server did not become healthy on ${baseUrl} within ${timeoutMs}ms.`);
}

async function runCheck(check: Check) {
  const response = await fetch(`${baseUrl}${check.path}`, {
    method: check.method ?? 'GET',
    headers: check.body ? { 'Content-Type': 'application/json' } : undefined,
    body: check.body ? JSON.stringify(check.body) : undefined,
  });

  if (response.status !== check.expectedStatus) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `${check.name} expected ${check.expectedStatus}, got ${response.status}${text ? `: ${text}` : ''}`,
    );
  }

  console.log(`${check.name}=${response.status}`);
}

function startServer(): ChildProcessWithoutNullStreams {
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      TWITCH_BACKEND_RUNTIME_ENABLED: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => {
    const text = String(chunk).trim();
    if (text) {
      console.log(`[server] ${text}`);
    }
  });
  child.stderr.on('data', (chunk) => {
    const text = String(chunk).trim();
    if (text) {
      console.error(`[server] ${text}`);
    }
  });

  return child;
}

async function main() {
  const child = startServer();
  try {
    await waitForHealth(10_000);
    for (const check of checks) {
      await runCheck(check);
    }
  } finally {
    child.kill();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
