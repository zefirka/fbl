import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  // Relative base so the same build works at a domain root or under /<repo>/.
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 5000,
    // Two pages, so the calculator does not have to carry an editor it never opens.
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        calc: resolve(__dirname, 'calc.html'),
      },
    },
  },
  server: { port: 5273, open: true },
})
