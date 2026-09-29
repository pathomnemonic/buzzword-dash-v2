import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => {
  // Support GitHub Pages subpath deployment via env var or default to '/'
  // Set VITE_BASE_PATH=/buzzword-dash/ for project-site deploys
  const base = process.env.VITE_BASE_PATH || '/';

  return {
    base,
    build: {
      chunkSizeWarningLimit: 3000, // card data chunk is intentionally large
      outDir: 'dist',
      sourcemap: mode !== 'production',
      rollupOptions: {
        output: {
          // Stable chunk naming for cache busting
          chunkFileNames: 'assets/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
          manualChunks(id) {
            if (id.includes('node_modules/three')) return 'three';
            if (id.includes('/js/cards/') || id.includes('cardsarchive')) return 'cards';
          }
        }
      }
    },
    test: {
      globals: true,
      environment: 'jsdom',
      include: ['tests/unit/**/*.test.{js,mjs}'],
      exclude: ['tests/e2e/**'],
      setupFiles: ['tests/unit/setup.js'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html', 'lcov'],
        reportsDirectory: 'coverage',
        include: ['js/**/*.js'],
        exclude: [
          'js/cards/**',
          'js/cardsarchive.js'
        ]
      },
      testTimeout: 15000,
      hookTimeout: 10000
    }
  };
});
