const { defineConfig } = require('@playwright/test');
const port = Number(process.env.NVT_TEST_PORT || 4390);
module.exports = defineConfig({
  testDir: './tests/ui',
  fullyParallel: true,
  timeout: 20000,
  use: { baseURL: `http://127.0.0.1:${port}`, viewport: { width: 1920, height: 1080 }, channel: 'chrome', headless: true, trace: 'off', screenshot: 'off' },
  webServer: { command: 'node dist/dev/server.cjs', url: `http://127.0.0.1:${port}`, env: { ...process.env, NVT_DEV_PORT: String(port) }, reuseExistingServer: !process.env.CI },
  reporter: 'list',
});
