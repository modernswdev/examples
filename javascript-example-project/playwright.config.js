// Playwright runs the end-to-end tests in test/e2e.
// It starts the real server on port 3100 (in-memory DB via NODE_ENV=test),
// waits until it answers, runs the tests in headless Chromium, then stops it.
const { defineConfig } = require('@playwright/test');

const PORT = 3100;

module.exports = defineConfig({
  testDir: './test/e2e',
  timeout: 15_000,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    browserName: 'chromium',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node server.js',
    url: `http://localhost:${PORT}/`,
    env: { NODE_ENV: 'test', PORT: String(PORT) },
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
