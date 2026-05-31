import { createServer } from 'node:http';
import express from 'express';
import { buildHealth, SERVICE_NAME } from './health';
import { handleChat } from './ai/chat';
import { handleEmbeddings } from './ai/embeddings';
import { handleModels } from './ai/models';
import { renderYourWifeyPomlResponse } from './ai/PomlRenderer';
import { handleTtsStream } from './tts/stream';
import { handleCreateTtsVoice, handleListTtsVoices } from './tts/voices';
import { handleLocalBackupSettings } from './localBackup';
import { createMemoryRouter } from './memory/routes';
import { OverlaySocket } from './overlay/OverlaySocket';
import { createTwitchRouter } from './twitch/routes';
import { createTwitchRuntime } from './twitch/runtime';

const PORT = Number(process.env.PORT ?? 8797);

const app = express();
app.use(express.json({ limit: '8mb' }));

// GET /health — boring liveness check the web app polls (StatusPanel).
app.get('/health', (_req, res) => {
  res.json(buildHealth());
});

// GET /local/backup-settings — local convenience import for the user's backup JSON.
app.get('/local/backup-settings', (req, res) => {
  void handleLocalBackupSettings(req, res);
});

// GET /ai/models — model capability metadata for automatic lane selection.
app.get('/ai/models', (req, res) => {
  void handleModels(req, res);
});

// POST /ai/chat — SSE reply stream (delta / done / error).
app.post('/ai/chat', (req, res) => {
  void handleChat(req, res);
});

// POST /ai/embeddings — provider fallback for semantic-memory embeddings.
app.post('/ai/embeddings', (req, res) => {
  void handleEmbeddings(req, res);
});

// POST /ai/poml/render — cached local POML template renderer for the copied frontend.
app.post('/ai/poml/render', (req, res) => {
  void renderYourWifeyPomlResponse(req.body?.variables).then((result) => {
    res.status(result.ok ? 200 : 500).json(result);
  });
});

// POST /tts/stream — NDJSON audio stream (audio / done / error).
app.post('/tts/stream', (req, res) => {
  void handleTtsStream(req, res);
});

// GET /tts/voices — provider voice registry for TTS and Voice Lab.
app.get('/tts/voices', (req, res) => {
  void handleListTtsVoices(req, res);
});

// POST /tts/voices/create — provider voice cloning/creation for Voice Lab.
app.post('/tts/voices/create', (req, res) => {
  void handleCreateTtsVoice(req, res);
});

const server = createServer(app);
const overlaySocket = new OverlaySocket(server, (event) => {
  console.log(`[INFO] (${SERVICE_NAME}) overlay client event: ${event.type}`);
});
const twitchRuntime = createTwitchRuntime({ overlaySocket });

app.use('/memory', createMemoryRouter());
app.use('/twitch', createTwitchRouter(twitchRuntime));

if (twitchRuntime.shouldAutoStart()) {
  twitchRuntime.start();
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[INFO] (${SERVICE_NAME}) listening on http://127.0.0.1:${PORT}`);
  console.log(`[INFO] (${SERVICE_NAME}) overlay socket listening on ws://127.0.0.1:${PORT}/ws`);
});
