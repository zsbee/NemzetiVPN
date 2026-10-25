const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');

async function mockProvider(page, rejected = false) {
  let logins = 0;
  await page.route('**/api/**', async route => {
    const method = new URL(route.request().url()).pathname.split('/').at(-1);
    let body = { returnValue: true, data: {} };
    if (method === 'login') { logins++; body = rejected ? { returnValue: false, code: 'INVALID_CREDENTIALS' } : { returnValue: true, data: { authenticated: true } }; }
    if (method === 'status') body.data = { authenticated: true };
    if (method === 'logout') body.data = { remoteConfirmed: true };
    if (method === 'resolve') body = { returnValue: false, code: 'UNSUPPORTED_MEDIA' };
    await route.fulfill({ json: body });
  });
  return () => logins;
}
async function login(page) {
  await page.getByLabel('E-mail-cím', { exact: true }).fill('viewer@example.test');
  await page.getByLabel('Jelszó', { exact: true }).fill('synthetic-password');
  await page.getByRole('button', { name: 'Bejelentkezés', exact: true }).click();
}

test('login is keyboard accessible, masked, and leaves room for the TV keyboard', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Bejelentkezés', exact: true })).toBeFocused();
  await expect(page.getByLabel('Jelszó', { exact: true })).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Jelszó megjelenítése', exact: true }).click();
  await expect(page.getByLabel('Jelszó', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Jelszó elrejtése', exact: true }).click();
  const bounds = await page.locator('.fields').boundingBox();
  expect(bounds.y + bounds.height).toBeLessThan(720);
  await page.getByLabel('E-mail-cím', { exact: true }).fill('viewer@example.test');
  await page.getByLabel('E-mail-cím', { exact: true }).press('Enter');
  await expect(page.getByLabel('Jelszó', { exact: true })).toBeFocused();
});
test('saved credentials survive reload and logout erases them', async ({ page }) => {
  const logins = await mockProvider(page);
  await page.goto('/'); await login(page);
  await expect(page.getByText('Belépés mentve ezen a tévén', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Nézem' })).toBeVisible();
  expect(logins()).toBe(2);
  await page.getByRole('button', { name: 'Kijelentkezés', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Bejelentkezés', exact: true })).toBeFocused();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Bejelentkezés', exact: true })).toBeFocused();
  expect(logins()).toBe(2);
});
test('TV navigation can leave an input after the system keyboard closes', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Bejelentkezés', exact: true })).toBeFocused();
  await page.evaluate(() => { window.PalmServiceBridge = function () {}; });
  await page.getByLabel('E-mail-cím', { exact: true }).focus();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('keyboardStateChange', { detail: { visibility: true } })));
  await page.keyboard.press('ArrowDown');
  await expect(page.getByLabel('E-mail-cím', { exact: true })).toBeFocused();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('keyboardStateChange', { detail: { visibility: false } })));
  await page.keyboard.press('ArrowDown');
  await expect(page.getByLabel('Jelszó', { exact: true })).toBeFocused();
});
test('session-only login does not restore a password on reload', async ({ page }) => {
  const logins = await mockProvider(page);
  await page.goto('/');
  await page.getByLabel('Maradjak bejelentkezve', { exact: true }).uncheck();
  await login(page);
  await expect(page.getByText('A belépés nincs mentve', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Bejelentkezés', exact: true })).toBeFocused();
  expect(logins()).toBe(1);
});
test('wrong password is cleared while email remains editable', async ({ page }) => {
  await mockProvider(page, true);
  await page.goto('/'); await login(page);
  await expect(page.getByRole('status').filter({ visible: true })).toContainText('nem megfelelő');
  await expect(page.getByLabel('E-mail-cím', { exact: true })).toHaveValue('viewer@example.test');
  await expect(page.getByLabel('Jelszó', { exact: true })).toHaveValue('');
});
test('unsupported playback explains the actual limitation and Back returns focus', async ({ page }) => {
  await mockProvider(page);
  await page.goto('/'); await login(page);
  await page.getByRole('button', { name: 'Nézem' }).click();
  await expect(page.locator('#player-status')).toContainText('nem játszható le');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Nézem' })).toBeFocused();
});
test('encrypted vault persists a non-exportable key, rejects tampering and deletes it', async ({ page }) => {
  // Serve the actual production vault module at the same origin for this test only.
  const source = await fs.readFile('dist/test/vault.js', 'utf8');
  await page.route('**/vault-test.js', route => route.fulfill({ contentType: 'application/javascript', body: source }));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Bejelentkezés', exact: true })).toBeFocused();
  const result = await page.evaluate(async () => {
    const { DeviceVault } = await import('/vault-test.js');
    const vault = new DeviceVault();
    const c = { email: 'viewer@example.test', password: 'synthetic-password' };
    await vault.save(c);
    const loaded = await new DeviceVault().load();
    const db = await new Promise(resolve => { const r = indexedDB.open('nemzetivpn-vault'); r.onsuccess = () => resolve(r.result); });
    const record = await new Promise(resolve => { const r = db.transaction('private').objectStore('private').get('account'); r.onsuccess = () => resolve(r.result); });
    let exportRejected = false;
    try { await crypto.subtle.exportKey('raw', record.key); } catch { exportRejected = true; }
    const plaintextPresent = new TextDecoder().decode(record.ciphertext).includes(c.password);
    new Uint8Array(record.ciphertext)[0] ^= 1;
    await new Promise(resolve => { const t = db.transaction('private', 'readwrite'); t.objectStore('private').put(record, 'account'); t.oncomplete = resolve; });
    db.close();
    let tamperRejected = false;
    try { await vault.load(); } catch { tamperRejected = true; }
    await vault.clear();
    return { restored: loaded.password === c.password, exportRejected, plaintextPresent, tamperRejected, erased: await vault.load() === null };
  });
  expect(result).toEqual({ restored: true, exportRejected: true, plaintextPresent: false, tamperRejected: true, erased: true });
});
test('preview bridge rejects cross-origin requests', async ({ request }) => {
  const result = await request.post('/api/login', { headers: { Origin: 'https://attacker.example' }, data: { email: 'viewer@example.test', password: 'synthetic-password' } });
  expect(result.status()).toBe(403);
});
test('the player starts synthetic HLS media and stops it when returning to channels', async ({ page }) => {
  await mockProvider(page);
  await page.route('**/api/resolve', route => route.fulfill({ json: { returnValue: true, data: { url: 'http://127.0.0.1:4390/synthetic-hls/index.m3u8', mime: 'application/vnd.apple.mpegurl' } } }));
  await page.route('**/synthetic-hls/**', async route => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1);
    if (!/^(index\.m3u8|segment[0-2]\.ts)$/.test(name)) return route.fulfill({ status: 404 });
    const body = await fs.readFile(`tests/fixtures/hls/${name}`);
    await route.fulfill({ contentType: name.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t', body });
  });
  await page.goto('/'); await login(page);
  await page.getByRole('button', { name: 'Nézem' }).click();
  await expect.poll(() => page.locator('video').evaluate(v => v.currentTime)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Vissza a csatornákhoz', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Nézem' })).toBeFocused();
  await expect(page.locator('video')).not.toHaveAttribute('src');
});
