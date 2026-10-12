import { defineConfig, devices } from '@playwright/test';

/*
 * Las pruebas corren contra `preview` con la base real ('/', dominio propio).
 * SHOW_DRAFTS=true incluye los servicios de ejemplo.
 */
const PORT = 4321;

export default defineConfig({
  testDir: 'tests/e2e',
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `astro build && astro preview --port ${PORT} --ignore-lock`,
    env: { SHOW_DRAFTS: 'true' },
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
