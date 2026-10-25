const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/ui',
  fullyParallel: true,
  timeout: 20000,
  use: { baseURL: 'http://127.0.0.1:4390', viewport: { width: 1920, height: 1080 }, channel: 'chrome', headless: true, trace: 'off', screenshot: 'off' },
  webServer: { command: 'node dist/dev/server.cjs', url: 'http://127.0.0.1:4390', reuseExistingServer: !process.env.CI },
  reporter: 'list',
});
