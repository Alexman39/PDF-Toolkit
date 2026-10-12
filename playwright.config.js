import { defineConfig, devices } from '@playwright/test';

// E2E runs against the production build so the real CSP is in effect.
const PORT = 4173;

export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL: `http://localhost:${PORT}/PDF-Toolkit/` },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/PDF-Toolkit/`,
    reuseExistingServer: !process.env.CI,
  },
});
