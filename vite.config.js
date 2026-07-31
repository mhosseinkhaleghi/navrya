import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    proxy: {
      '/api/patterns': 'http://127.0.0.1:8787',
      '/api/strategy-education': 'http://127.0.0.1:8787',
      '/api/trades': 'http://127.0.0.1:8787'
    }
  }
});
