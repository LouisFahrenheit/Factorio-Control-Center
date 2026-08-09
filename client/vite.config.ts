import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execFileSync } from 'child_process';
import { resolve, join } from 'path';

function nestBindPort(): number {
  try {
    const root = resolve(__dirname, '..');
    const out = execFileSync(process.execPath, [join(root, 'scripts', 'read-bind-port.mjs')], {
      cwd: root,
      encoding: 'utf-8',
    }).trim();
    const n = parseInt(out, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 65535) return n;
  } catch {
    /* fallback */
  }
  return 8080;
}

const nestPort = nestBindPort();
const nestTarget = `http://127.0.0.1:${nestPort}`;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@fcc/shared': resolve(__dirname, '../src/shared'),
    },
  },
  server: {
    // Bind IPv4 — Windows often serves Vite only on [::1], while Start.bat opens 127.0.0.1
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    fs: {
      allow: [resolve(__dirname, '..')],
    },
    proxy: {
      '/api': {
        target: nestTarget,
        changeOrigin: true,
      },
      '/assets': {
        target: nestTarget,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsDir: 'vite-assets',
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          // ── React core — точная проверка, без широкого '/react/' ───────────
          if (id.includes('node_modules/react-dom/'))    return 'react-vendor';
          if (id.includes('node_modules/react-router/')) return 'react-vendor';
          if (id.includes('node_modules/react-is/'))     return 'react-vendor';
          if (id.includes('node_modules/react/'))        return 'react-vendor';
          if (id.includes('node_modules/scheduler/'))    return 'react-vendor';

          // ── Mantine – разбиваем по подпакетам ─────────────────────────────
          if (id.includes('@mantine/core'))          return 'mantine-core';
          if (id.includes('@mantine/hooks'))         return 'mantine-hooks';
          if (id.includes('@mantine/notifications')) return 'mantine-notif';
          if (id.includes('@mantine/dates'))         return 'mantine-dates';
          if (id.includes('@mantine/charts'))        return 'mantine-charts';
          if (id.includes('@mantine'))               return 'mantine-misc';

          // ── Tabler иконки ──────────────────────────────────────────────────
          if (id.includes('@tabler/icons-react')) return 'icons';

          // ── React Query ────────────────────────────────────────────────────
          if (id.includes('@tanstack/react-query')) return 'query';

          // ── Motion / Framer Motion ─────────────────────────────────────────
          if (id.includes('motion')) return 'motion';

          // ── Утилиты дат ────────────────────────────────────────────────────
          if (id.includes('dayjs') || id.includes('date-fns')) return 'dates';

          // ── Прочие node_modules ────────────────────────────────────────────
          return 'vendor';
        },
      },
    },
  },
});
