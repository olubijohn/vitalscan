import path from 'path';
import fs from 'fs';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

const rawPort = process.env.PORT || '5173';
const port = Number(rawPort);
const basePath = process.env.BASE_PATH || '/';

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    {
      name: 'vercel-multi-output-mirror',
      closeBundle() {
        try {
          const distDir = path.resolve(import.meta.dirname, 'dist');
          const rootDist = path.resolve(import.meta.dirname, '..', '..', 'dist');
          const rootPublic = path.resolve(import.meta.dirname, '..', '..', 'public');
          const localPublicDist = path.resolve(import.meta.dirname, 'dist', 'public');
          if (fs.existsSync(distDir)) {
            if (!fs.existsSync(rootDist)) fs.mkdirSync(rootDist, { recursive: true });
            fs.cpSync(distDir, rootDist, { recursive: true });
            if (!fs.existsSync(rootPublic)) fs.mkdirSync(rootPublic, { recursive: true });
            fs.cpSync(distDir, rootPublic, { recursive: true });
            if (!fs.existsSync(localPublicDist)) fs.mkdirSync(localPublicDist, { recursive: true });
            fs.cpSync(distDir, localPublicDist, { recursive: true });
          }
        } catch {}
      },
    },
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
  },
  server: {
    port,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
    fs: {
      strict: false,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
  },
});
