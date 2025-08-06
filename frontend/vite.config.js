// frontend/vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // This proxy is the key. It tells Vite's development server
    // to forward any requests to /api to your backend.
    // This same logic is respected in the production build.
    proxy: {
      '/api': {
        // We will set this URL in an environment variable on Render
        target: process.env.VITE_API_BASE_URL || 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
