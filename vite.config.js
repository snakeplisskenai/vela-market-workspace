import { defineConfig } from 'vite';

// Relative asset URLs make the production dist/index.html usable when opened
// locally, while remaining fully compatible with Vercel hosting.
export default defineConfig({
  base: './',
  server: { port: 5174, strictPort: true },
});
