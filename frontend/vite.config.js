import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// Dev: /cpq calls are proxied to the CAP server, so no CORS setup is needed.
// Build: output goes to srv/public, where srv/server.js serves it at "/" (and cds build ships it to Cloud Foundry).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/cpq': 'http://localhost:4004' } },
  build: { outDir: '../srv/public', emptyOutDir: true }
});
