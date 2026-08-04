import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@decola/theme': fileURLToPath(new URL('../../packages/theme/src/index.ts', import.meta.url)),
      '@decola/types': fileURLToPath(
        new URL('../../packages/types/src/database.ts', import.meta.url),
      ),
    },
  },
  server: { port: 5273 },
});
