import express from 'express';
import { buildHealth, SERVICE_NAME } from './health';
import { handleChat } from './ai/chat';

const PORT = Number(process.env.PORT ?? 8797);

const app = express();
app.use(express.json({ limit: '8mb' }));

// GET /health — boring liveness check the web app polls (StatusPanel).
app.get('/health', (_req, res) => {
  res.json(buildHealth());
});

// POST /ai/chat — SSE reply stream (delta / done / error).
app.post('/ai/chat', (req, res) => {
  void handleChat(req, res);
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[INFO] (${SERVICE_NAME}) listening on http://127.0.0.1:${PORT}`);
});
