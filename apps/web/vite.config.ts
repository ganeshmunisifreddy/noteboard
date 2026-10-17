import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    react(),
    !process.env.VITEST &&
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'worker',
        filename: 'sw.js',
        // Registered in main.tsx; the manifest is public/manifest.json.
        injectRegister: false,
        manifest: false,
        injectManifest: {
          // A classic worker script, as the old one was.
          rollupFormat: 'iife',
          globPatterns: ['**/*.{js,css,html,woff2,png,svg,ico,json}'],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        },
      }),
  ],
  // The main chunk (React, Radix, dnd-kit, Dexie, the board) is ~650 kB before
  // gzip; the editor and boards load as their own chunks.
  build: { chunkSizeWarningLimit: 800 },
  server: { port: 4000, strictPort: true },
  preview: { port: 4100, strictPort: true },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.test.{ts,tsx}'],
    exclude: ['node_modules/**', 'dist/**', 'dev-dist/**'],
  },
});
