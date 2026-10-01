import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e', testMatch: ['smoke.spec.js','gameplay.spec.js','controls.spec.js','postrun.spec.js'], retries: 1, workers: 2, timeout: 60000,
  expect: { timeout: 10000 },
  use: { baseURL: 'http://localhost:4173', launchOptions: { executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader','--ignore-gpu-blocklist','--no-sandbox'] } },
  projects: [{ name: 'chromium' }],
  webServer: { command: 'npm run build && npx vite preview --port 4173', url: 'http://localhost:4173', reuseExistingServer: false, timeout: 120000 }
});
