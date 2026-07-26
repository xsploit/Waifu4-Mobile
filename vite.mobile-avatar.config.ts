import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [react()],
  publicDir: false,
  resolve: {
    alias: [
      {
        find: /^\.\.\/lib\/tts\/manager$/,
        replacement: fileURLToPath(new URL('./src/mobile-avatar/tts-manager-shim.ts', import.meta.url)),
      },
      {
        find: /^\.\.\/tts\/manager$/,
        replacement: fileURLToPath(new URL('./src/mobile-avatar/tts-manager-shim.ts', import.meta.url)),
      },
    ],
  },
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2022',
    outDir: 'android-native/app/src/main/assets/avatar',
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL('./mobile-avatar.html', import.meta.url)),
      output: {
        entryFileNames: 'static/avatar.js',
        chunkFileNames: 'static/[name]-[hash].js',
        assetFileNames: 'static/[name]-[hash][extname]',
      },
    },
  },
});
