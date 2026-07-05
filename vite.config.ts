import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
// Note: the app uses relative imports (no path alias), so no resolver config is
// needed here — keeping vite.config free of node:url avoids requiring @types/node.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist',
  },
});
