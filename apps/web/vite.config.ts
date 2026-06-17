import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.API_PORT ?? 3411}`,
        // Preserve the Host header so the API's isSameOrigin check sees
        // host === new URL(origin).host (both localhost:5173 in dev).
        changeOrigin: false,
      },
      '/uploads': {
        target: `http://localhost:${process.env.API_PORT ?? 3411}`,
        changeOrigin: false,
      },
    },
  },
});
