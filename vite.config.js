import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    proxy: {
      '/api/patterns': 'http://127.0.0.1:8787',
      '/api/strategy-education': 'http://127.0.0.1:8787',
      '/api/trades': 'http://127.0.0.1:8787',
      '/api/mental-health': 'http://127.0.0.1:8787',
      '/api/ai': 'http://127.0.0.1:8787',
      '/api/community': 'http://127.0.0.1:8788',
      '/api/users': 'http://127.0.0.1:8788',
      '/api/marketplace': 'http://127.0.0.1:8788',
      '/api/messages': 'http://127.0.0.1:8788',
      '/api/admin': 'http://127.0.0.1:8788',
      '/uploads': 'http://127.0.0.1:8788'
    }
  }
});
