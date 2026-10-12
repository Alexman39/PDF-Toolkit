import { defineConfig, devices } from '@playwright/test';

// App tests run against the production build so the real CSP is in effect. Component tests
// use a harness page that only the dev server serves, so it never ships in dist/.
const PREVIEW_PORT = 4173;
const DEV_PORT = 5174;

export default defineConfig({
  testDir: 'tests/e2e',
  projects: [
    {
      name: 'app',
      testIgnore: ['**/components.spec.js', '**/touch.spec.js'],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://localhost:${PREVIEW_PORT}/PDF-Toolkit/`,
      },
    },
    {
      // A phone used with a finger only (CLAUDE.md §6).
      name: 'touch',
      testMatch: '**/touch.spec.js',
      use: { ...devices['Pixel 7'], baseURL: `http://localhost:${PREVIEW_PORT}/PDF-Toolkit/` },
    },
    {
      name: 'components',
      testMatch: '**/components.spec.js',
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${DEV_PORT}/PDF-Toolkit/` },
    },
  ],
  webServer: [
    {
      command: `npm run build && npm run preview -- --port ${PREVIEW_PORT} --strictPort`,
      url: `http://localhost:${PREVIEW_PORT}/PDF-Toolkit/`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `npm run dev -- --port ${DEV_PORT} --strictPort`,
      url: `http://localhost:${DEV_PORT}/PDF-Toolkit/tests/e2e/harness/components.html`,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
