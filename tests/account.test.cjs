const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Account, AppError } = require('../dist/test/account.cjs');
const credentials = { email: 'viewer@example.test', password: 'synthetic-password' };

function fixture(saved = null) {
  const vault = { value: saved, async load() { return this.value; }, async save(c) { this.value = { ...c }; }, async clear() { this.value = null; } };
  const backend = { logins: 0, authenticated: false,
    async status() { return { authenticated: this.authenticated }; },
    async login() { this.logins++; this.authenticated = true; return { authenticated: true }; },
    async resolve() { if (!this.authenticated) throw new AppError('AUTH_REQUIRED'); return { url: 'https://example.test/synthetic.m3u8', mime: 'application/vnd.apple.mpegurl' }; },
    async logout() { this.authenticated = false; return { remoteConfirmed: true }; },
  };
  return { vault, backend, account: new Account(backend, vault) };
}

test('saves login only after provider success, then restores it in a new account instance', async () => {
  const { vault, backend, account } = fixture();
  await account.login(credentials, true);
  assert.deepEqual(vault.value, credentials);
  backend.authenticated = false;
  const second = new Account(backend, vault);
  assert.equal(await second.restore(), true);
  assert.equal(backend.logins, 2);
});
test('a rejected login never persists the submitted password or keeps the old account', async () => {
  const { vault, backend, account } = fixture(credentials);
  backend.login = async () => { throw new AppError('INVALID_CREDENTIALS'); };
  await assert.rejects(account.login({ email: 'other@example.test', password: 'wrong' }, true), { code: 'INVALID_CREDENTIALS' });
  assert.equal(vault.value, null);
});
test('session-only login removes previously remembered credentials', async () => {
  const { account, vault } = fixture(credentials);
  await account.login(credentials, false);
  assert.equal(vault.value, null);
  assert.equal(account.remembered, false);
});
test('concurrent expired operations share one automatic login', async () => {
  const { account, backend } = fixture(credentials);
  const result = await Promise.all([account.resolve('m4'), account.resolve('m4')]);
  assert.equal(result.length, 2);
  assert.equal(backend.logins, 1);
});
test('valid sessions do not submit the saved password again', async () => {
  const { account, backend } = fixture(credentials);
  backend.authenticated = true;
  await account.resolve('m4');
  assert.equal(backend.logins, 0);
});
test('changed password clears stored secret and stops automatic retries', async () => {
  const { account, backend, vault } = fixture(credentials);
  backend.login = async () => { backend.logins++; throw new AppError('INVALID_CREDENTIALS'); };
  await assert.rejects(account.restore(), { code: 'INVALID_CREDENTIALS' });
  assert.equal(vault.value, null);
  assert.equal(account.email, credentials.email);
  await assert.rejects(account.resolve('m4'), { code: 'AUTH_REQUIRED' });
  assert.equal(backend.logins, 1);
});
test('network failures preserve saved credentials for an explicit later attempt', async () => {
  const { account, backend, vault } = fixture(credentials);
  backend.login = async () => { throw new AppError('NETWORK'); };
  await assert.rejects(account.restore(), { code: 'NETWORK' });
  assert.deepEqual(vault.value, credentials);
});
test('a second auth failure after recovery is surfaced without a retry loop', async () => {
  const { account, backend } = fixture(credentials);
  backend.resolve = async () => { throw new AppError('AUTH_REQUIRED'); };
  await assert.rejects(account.resolve('m4'), { code: 'AUTH_REQUIRED' });
  assert.equal(backend.logins, 1);
});
test('logout during authentication recovery cannot resurrect a session or vault', async () => {
  const { account, backend, vault } = fixture(credentials);
  let release;
  backend.login = () => new Promise(resolve => { release = resolve; });
  const pending = account.restore();
  while (!release) await new Promise(resolve => setImmediate(resolve));
  await account.logout();
  release({ authenticated: true });
  await assert.rejects(pending, { code: 'CANCELLED' });
  assert.equal(account.authenticated, false);
  assert.equal(vault.value, null);
});
test('forgetting credentials keeps current session and deletes the saved login', async () => {
  const { account, backend, vault } = fixture(credentials);
  await account.restore();
  await account.forget();
  assert.equal(vault.value, null);
  assert.equal(backend.authenticated, true);
  assert.equal(account.remembered, false);
});
test('a storage failure is reported instead of claiming the password was saved', async () => {
  const { account, vault } = fixture();
  vault.save = async () => { throw new AppError('STORAGE'); };
  await account.login(credentials, true);
  assert.equal(account.authenticated, true);
  assert.equal(account.remembered, false);
  assert.equal(account.storageWarning, true);
});

test('a superseded channel selection cannot resolve after its delayed session check', async () => {
  let finish, resolved = false;
  const backend = { status: () => new Promise(resolve => { finish = resolve; }), resolve: async () => { resolved = true; } };
  const account = new Account(backend, {});
  let current = true;
  const pending = account.resolve('m4', 'auto', () => current);
  current = false; finish({ authenticated: true });
  await assert.rejects(pending, { code: 'CANCELLED' });
  assert.equal(resolved, false);
});
