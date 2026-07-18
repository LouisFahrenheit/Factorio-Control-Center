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
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('@mantine')) return 'mantine';
          if (id.includes('@tabler/icons-react')) return 'icons';
          if (id.includes('@tanstack/react-query')) return 'query';
          if (id.includes('react-router') || id.includes('react-dom') || id.includes('/react/')) {
            return 'vendor';
          }
          if (id.includes('motion')) return 'motion';
        },
      },
    },
  },
});
