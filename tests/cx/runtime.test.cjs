const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

test('CX backend supports the legacy runtime, relay, cancellation and bounded decoding', () => {
  const result = spawnSync(process.env.NVT_NODE8 || process.execPath, ['tests/cx/fixtures/runtime.cjs'], { encoding: 'utf8', timeout: 15000 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
