import express from 'express';
import { buildHealth, SERVICE_NAME } from './health';
import { handleChat } from './ai/chat';
import { handleModels } from './ai/models';
import { handleTtsStream } from './tts/stream';
import { handleLocalBackupSettings } from './localBackup';
import { createMemoryRouter } from './memory/routes';
import { createTwitchRouter } from './twitch/routes';

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

// POST /tts/stream — NDJSON audio stream (audio / done / error).
app.post('/tts/stream', (req, res) => {
  void handleTtsStream(req, res);
});

app.use('/memory', createMemoryRouter());
app.use('/twitch', createTwitchRouter());

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[INFO] (${SERVICE_NAME}) listening on http://127.0.0.1:${PORT}`);
});
