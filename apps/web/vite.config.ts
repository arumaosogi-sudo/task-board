import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// The preconnect hint in index.html uses Vite's `%VITE_API_URL%` HTML
// replacement, which only substitutes vars Vite can actually see. The
// Docker build always supplies one (ARG VITE_API_URL, defaulting to
// http://localhost:3001 — see apps/web/Dockerfile), but a plain
// `npm run build` (this repo's typecheck/lint/test/build gate, and CI) does
// not set it. Left unset, the literal "%VITE_API_URL%" string survives into
// the built HTML and Vite's own asset-resolution pass crashes trying to
// decodeURI() it ("URI malformed") — mirror the Dockerfile's fallback here
// so the placeholder is always defined and the build never depends on the
// caller remembering to pass it.
process.env.VITE_API_URL ||= 'http://localhost:3001'
process.env.VITE_COLLAB_URL ||= 'ws://localhost:3001'

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
        target: process.env.VITE_API_URL || 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
