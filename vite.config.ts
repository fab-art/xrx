import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // We already ship a hand-written service worker (public/sw.js) with
      // custom caching rules, and it's registered manually in
      // ServiceWorkerRegister.tsx — so this plugin's only job is to inject
      // the hashed build-asset manifest into that file at build time, not
      // to generate a new service worker or registration script.
      strategies: 'injectManifest',
      srcDir: 'public',
      filename: 'sw.js',
      injectRegister: false,
      manifest: false, // public/manifest.json is already hand-written
      injectManifest: {
        // public/sw.js already precaches these explicitly; avoid duplicates.
        globPatterns: ['assets/**/*.{js,css}'],
      },
      devOptions: {
        enabled: false, // avoid SW/HMR churn in dev, same as before
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Split heavy, rarely-used views into their own chunks so the
        // initial load only pulls in what the landing/upload flow needs.
        manualChunks: {
          charts: ['recharts'],
          'd3-force': ['d3-force'],
          dnd: ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
          xlsx: ['xlsx-js-style'],
          motion: ['framer-motion'],
        },
      },
    },
    chunkSizeWarningLimit: 900,
  },
  server: {
    port: 3000,
  },
});
