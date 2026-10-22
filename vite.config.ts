import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative base so the build works from any sub-path (GitHub Pages, Netlify, etc.).
  base: './',
  plugins: [react()],
  server: { port: 5173, host: '127.0.0.1' },
});
