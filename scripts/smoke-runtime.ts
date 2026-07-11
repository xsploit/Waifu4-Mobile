import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';

const port = Number(process.env.SMOKE_PORT ?? 8798);
const baseUrl = `http://127.0.0.1:${port}`;

type Check = {
  name: string;
  method?: 'GET' | 'POST';
  path: string;
  body?: unknown;
  bodyMustNotStartWith?: string;
  expectedStatus: number;
};

const checks: Check[] = [
  { name: 'health', path: '/health', expectedStatus: 200 },
  { name: 'api health alias', path: '/api/health', expectedStatus: 200 },
  { name: 'twitch runtime', path: '/twitch/runtime/status', expectedStatus: 200 },
  { name: 'memory status', path: '/memory/status', expectedStatus: 200 },
  {
    name: 'GRILLO evidence ledger',
    path: '/memory/grillo/ledger?scopeKey=local%3Apersona%3Asmoke',
    expectedStatus: 200,
  },
  {
    name: 'GRILLO ledger projection',
    path: '/memory/grillo/projection?scopeKey=local%3Apersona%3Asmoke',
    expectedStatus: 200,
  },
  {
    name: 'poml render',
    method: 'POST',
    path: '/ai/poml/render',
    expectedStatus: 200,
    body: { variables: { persona_context: 'You are Hikari.' } },
  },
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

if (existsSync('dist/index.html')) {
  checks.push({ name: 'static app shell', path: '/', expectedStatus: 200 });
  checks.push({
    name: 'static vrma animation asset',
    path: '/assets/animations/sachi-vrma/CC0animationruru02.vrma',
    expectedStatus: 200,
    bodyMustNotStartWith: '<!doctype',
  });
  checks.push({
    name: 'static bvh animation asset',
    path: '/assets/animations/silly-bvh/caring.bvh',
    expectedStatus: 200,
    bodyMustNotStartWith: '<!doctype',
  });
  checks.push({
    name: 'static background asset',
    path: '/cdn-assets/backgrounds/hikari-bedroom.png',
    expectedStatus: 200,
    bodyMustNotStartWith: '<!doctype',
  });
  checks.push({
    name: 'static bundled vrm asset',
    path: '/cdn-assets/models/hikkyc2.vrm',
    expectedStatus: 200,
    bodyMustNotStartWith: '<!doctype',
  });
  checks.push({
    name: 'static piper onnx asset',
    path: '/cdn-assets/piper/en_US-neuro_100_32k_2259-medium.onnx',
    expectedStatus: 200,
    bodyMustNotStartWith: '<!doctype',
  });
  checks.push({
    name: 'static piper config asset',
    path: '/cdn-assets/piper/en_US-neuro_100_32k_2259-medium.onnx.json',
    expectedStatus: 200,
    bodyMustNotStartWith: '<!doctype',
  });
}

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

  if (check.bodyMustNotStartWith) {
    const text = await response.text();
    if (text.trimStart().toLowerCase().startsWith(check.bodyMustNotStartWith.toLowerCase())) {
      throw new Error(`${check.name} returned the app shell instead of the requested asset.`);
    }
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
