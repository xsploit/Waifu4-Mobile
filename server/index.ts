import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import express from 'express';
import { buildHealth, SERVICE_NAME } from './health';
import { handleChat } from './ai/chat';
import { handleEmbeddings } from './ai/embeddings';
import { handleModels } from './ai/models';
import { renderYourWifeyPomlResponse } from './ai/PomlRenderer';
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

const PORT = Number(process.env.PORT ?? 8797);
const HOST = process.env.HOST?.trim() || '127.0.0.1';
const DIST_DIR = path.resolve(process.cwd(), 'dist');
const DIST_INDEX = path.join(DIST_DIR, 'index.html');

const app = express();
const backendRouter = express.Router();
app.use(express.json({ limit: '8mb' }));

// GET /health — boring liveness check the web app polls (StatusPanel).
backendRouter.get('/health', (_req, res) => {
  res.json(buildHealth());
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
  void handleChat(req, res);
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
  void handleTtsStream(req, res);
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

backendRouter.use('/memory', createMemoryRouter());
backendRouter.use('/twitch', createTwitchRouter(twitchRuntime));

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

function isBackendRoute(pathname: string) {
  return /^\/(?:api|health|local|ai|tts|memory|twitch|ws)(?:\/|$)/.test(pathname);
}
