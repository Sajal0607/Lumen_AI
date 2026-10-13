import { defineConfig } from 'vite';

// Vite only serves and bundles the static frontend. No environment variables
// are exposed to the browser: the Anthropic key lives solely on the server.
export default defineConfig({
  envPrefix: 'LUMEN_PUBLIC_',
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.PORT || 3001}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
