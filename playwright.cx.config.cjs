const base = require('./playwright.config.cjs');
module.exports = {
  ...base,
  testDir: './tests',
  use: { ...base.use, baseURL: 'http://127.0.0.1:4391' },
  testMatch: ['**/ui/*.spec.cjs', '**/cx-ui/*.spec.cjs'],
  webServer: { ...base.webServer, command: 'node dist/cx/dev/server.cjs', url: 'http://127.0.0.1:4391', env: { ...process.env, NVT_DEV_PORT: '4391' }, reuseExistingServer: false },
};
