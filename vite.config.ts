import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // Workspace sync can miss filesystem events; polling keeps served modules current.
    watch: { usePolling: true, interval: 300 },
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
