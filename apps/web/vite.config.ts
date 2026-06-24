import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  // PGlite ships a WASM module + a separate FS data bundle that Vite's dep
  // pre-bundler corrupts (serves the wrong-sized .data file → "Invalid FS bundle
  // size" at runtime). Excluding it makes Vite serve the package's own assets
  // untouched. Required for the in-browser demo database.
  optimizeDeps: { exclude: ['@electric-sql/pglite'] },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // The demo imports the real Hono `app` so it can answer requests in-page.
      // That graph reaches several node-only packages via `await import()` in
      // route handlers — none of which the demo ever invokes (AI is disabled,
      // exports are hidden, no mail/login). Alias them to inert stubs so the
      // demo chunk bundles cleanly in the browser build, mirroring the prior
      // "lazy-load node-only modules off the app graph" work on the API side.
      // These aliases are WEB-BUILD-ONLY: vitest and apps/api have their own
      // configs and resolve the real packages.
      '@node-rs/argon2': path.resolve(__dirname, './src/demo/argon2-stub.ts'),
      '@ai-sdk/amazon-bedrock': path.resolve(__dirname, './src/demo/node-only-stub.ts'),
      '@aws-sdk/credential-providers': path.resolve(__dirname, './src/demo/node-only-stub.ts'),
      archiver: path.resolve(__dirname, './src/demo/node-only-stub.ts'),
      nodemailer: path.resolve(__dirname, './src/demo/node-only-stub.ts'),
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
