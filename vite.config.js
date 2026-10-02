import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildCsp } from './tools/csp.mjs';

// One id per build: the commit when CI provides it, otherwise the build time. It names the service
// worker cache, so every deploy starts a fresh cache instead of relying on a hand-bumped number.
const BUILD_ID = (process.env.GITHUB_SHA || '').slice(0, 8) || Date.now().toString(36);

// Puts the Content-Security-Policy (see tools/csp.mjs) in the built page. Not in dev: the dev server needs inline scripts.
function injectCsp(supabaseUrl) {
  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const policy = buildCsp({ supabaseUrl, html });
        return html.replace('<head>', '<head>\n  <meta http-equiv="Content-Security-Policy" content="' + policy + '">');
      }
    }
  };
}

// Stamps the build id into the copied service worker (public/sw.js ships as-is otherwise).
function stampServiceWorker() {
  let outDir = 'dist';
  return {
    name: 'stamp-service-worker',
    apply: 'build',
    configResolved(config) { outDir = config.build.outDir; },
    closeBundle() {
      const file = resolve(outDir, 'sw.js');
      if (!existsSync(file)) return;
      writeFileSync(file, readFileSync(file, 'utf8').replace(/__BUILD_ID__/g, BUILD_ID));
    }
  };
}

export default defineConfig(({ mode }) => {
  // Support GitHub Pages subpath deployment via env var or default to '/'
  // Set VITE_BASE_PATH=/buzzword-dash/ for project-site deploys
  const base = process.env.VITE_BASE_PATH || '/';

  return {
    base,
    plugins: [stampServiceWorker(), injectCsp(process.env.VITE_SUPABASE_URL || loadEnv(mode, process.cwd(), 'VITE_').VITE_SUPABASE_URL || '')],
    define: { __APP_VERSION__: JSON.stringify(BUILD_ID) },
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
            // One chunk per subject (about 175 KB each) instead of one 2.6 MB file: the browser fetches them in
            // parallel, and after an update only the subjects that changed are downloaded again.
            var subject = /\/js\/cards\/([a-z]+)\.js$/.exec(id);
            if (subject) return 'cards-' + subject[1];
            if (id.includes('cardsarchive')) return 'cards-archive';
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
        ],
        // A floor just under today's numbers (43 / 69 / 39 / 43). It stops coverage sliding back;
        // raise it as tests are added.
        thresholds: { statements: 40, branches: 65, functions: 36, lines: 40 }
      },
      testTimeout: 15000,
      hookTimeout: 10000
    }
  };
});
