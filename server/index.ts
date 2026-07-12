import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import express from 'express';
import { buildHealth, SERVICE_NAME } from './health';
import { handleChat } from './ai/chat';
import { handleEmbeddings } from './ai/embeddings';
import { handleModels } from './ai/models';
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
const overlaySocket = new OverlaySocket(server, (event) => {
  console.log(`[INFO] (${SERVICE_NAME}) overlay client event: ${event.type}`);
});
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

if (existsSync(DIST_INDEX)) {
  app.use(express.static(DIST_DIR, { index: false }));
  app.get('*', (req, res, next) => {
    if (isBackendRoute(req.path) || !req.accepts('html')) {
      next();
      return;
    }
    res.sendFile(DIST_INDEX);
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
