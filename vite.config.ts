/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/polyfills.ts', './src/test/setup.ts'],
      css: false,
      testTimeout: 15_000,
      // Voice features are off by default in the app; tests keep covering them.
      env: { VITE_FEATURE_CALLING: 'true', VITE_FEATURE_VOICE_NOTES: 'true' },
    },
  };
});
