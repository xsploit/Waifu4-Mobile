/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const BACKEND = 'http://127.0.0.1:8797';

// The web app never calls providers directly (Resolved Decision D1).
// It talks to the local backend; Vite proxies the backend routes in dev.
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'esnext',
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext',
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/health': BACKEND,
      '/local': BACKEND,
      '/ai': BACKEND,
      '/tts': BACKEND,
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts'],
  },
});
