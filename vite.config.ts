import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  // Relative base so the same build works at a domain root or under /<repo>/.
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 5000 },
  server: { port: 5273, open: true },
})
