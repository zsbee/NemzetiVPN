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
for (const back of ['on-screen', 'remote', 'remote with hidden controls']) {
test(`playing a channel stops and restores its tile using Back: ${back}`, async ({ page }) => {
  const manifest = JSON.parse(await fs.readFile('dist/tv/appinfo.json', 'utf8'));
  expect(manifest.disableBackHistoryAPI).toBe(true);
  await mockProvider(page);
  let stops = 0;
  await page.route('**/api/stop', route => {
    stops++;
    return route.fulfill({ json: { returnValue: true, data: {} } });
  });
  await page.route('**/api/resolve', route => route.fulfill({ json: { returnValue: true, data: { url: new URL('/synthetic-hls/index.m3u8', route.request().url()).href, mime: 'application/vnd.apple.mpegurl' } } }));
  await page.route('**/synthetic-hls/**', async route => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1);
    if (!/^(index\.m3u8|segment[0-2]\.ts)$/.test(name)) return route.fulfill({ status: 404 });
    const body = await fs.readFile(`tests/fixtures/hls/${name}`);
    await route.fulfill({ contentType: name.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t', body });
  });
  await page.goto('/'); await login(page);
  await page.locator('#watch-m1').click();
  await expect.poll(() => page.locator('video').evaluate(v => v.currentTime)).toBeGreaterThan(0);
  if (back === 'on-screen') {
    await page.keyboard.press('ArrowDown');
    await page.getByRole('button', { name: 'Vissza a csatornákhoz', exact: true }).click();
  } else {
    if (back === 'remote with hidden controls') await expect(page.locator('#player-overlay')).toHaveAttribute('inert', '', { timeout: 6500 });
    await page.evaluate(() => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 461, bubbles: true, cancelable: true })));
  }
  await expect(page.locator('#watch-m1')).toBeFocused();
  await expect(page.locator('#channels-screen')).toBeVisible();
  await expect(page.locator('#player-screen')).toBeHidden();
  await expect(page.locator('video')).not.toHaveAttribute('src');
  expect(await page.locator('video').evaluate(v => v.paused && !v.querySelector('source'))).toBe(true);
  await expect.poll(() => stops).toBe(1);
});
}
test('native source explicitly selects HLS and cancellation clears it', async ({ page }) => {
  const source = await fs.readFile('dist/test/player.js', 'utf8');
  await page.route('**/player-test.js', route => route.fulfill({ contentType: 'application/javascript', body: source }));
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { TvPlayer } = await import('/player-test.js');
    const v = document.createElement('video');
    v.canPlayType = () => 'maybe'; v.load = () => {}; v.play = () => new Promise(() => {});
    const player = new TvPlayer(v, () => {}, 10000);
    const pending = player.start('http://127.0.0.1:4390/native-test.m3u8', 'application/vnd.apple.mpegurl').catch(error => error.code);
    const source = v.querySelector('source');
    const transport = JSON.parse(decodeURI(source.type.split('mediaOption=')[1])).mediaTransportType;
    player.stop();
    return { transport, result: await pending, sourceRemoved: !v.querySelector('source') };
  });
  expect(result).toEqual({ transport: 'HLS', result: 'CANCELLED', sourceRemoved: true });
});
test('a native player that never starts falls back and exits loading within a bounded time', async ({ page }) => {
  const source = await fs.readFile('dist/test/player.js', 'utf8');
  await page.route('**/player-test.js', route => route.fulfill({ contentType: 'application/javascript', body: source }));
  await page.route('**/never-starts.m3u8', route => route.abort());
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { TvPlayer } = await import('/player-test.js');
    const v = document.createElement('video');
    v.canPlayType = () => 'maybe'; v.load = () => {}; v.play = () => new Promise(() => {});
    const player = new TvPlayer(v, () => {}, 30);
    let code;
    const start = performance.now();
    try { await player.start('http://127.0.0.1:4390/never-starts.m3u8', 'application/vnd.apple.mpegurl'); } catch (e) { code = e.code; }
    const fallback = player.mode === 'mse'; player.stop();
    return { code, fallback, bounded: performance.now() - start < 2000 };
  });
  expect(result).toEqual({ code: 'PLAYBACK', fallback: true, bounded: true });
});
test('playback starts unobstructed and controls return with cursor movement, Down or OK', async ({ page }) => {
  await mockProvider(page);
  await page.clock.install();
  await page.goto('/'); await login(page);
  await page.getByRole('button', { name: 'Nézem' }).click();
  const overlay = page.locator('#player-overlay');
  await expect(overlay).toHaveClass(/chrome-hidden/);
  await expect(overlay).toHaveAttribute('inert', '');
  await page.mouse.move(200, 100);
  await expect(overlay).not.toHaveClass(/chrome-hidden/);
  await page.clock.fastForward(5100);
  await expect(overlay).toHaveClass(/chrome-hidden/);
  await page.keyboard.press('Enter');
  await expect(page.locator('#back-player')).toBeFocused();
  await expect(page.locator('#player-screen')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(overlay).toHaveClass(/chrome-hidden/);
  await expect(page.locator('#player-screen')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#back-player')).toBeFocused();
  await page.clock.fastForward(5100);
  await expect(overlay).toHaveClass(/chrome-hidden/);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Nézem' })).toBeFocused();
});

test('official logos load, tiles respond to hover, and remote wheel scrolls in both directions', async ({ page }) => {
  await mockProvider(page);
  await page.goto('/'); await login(page);
  const logo = page.locator('#watch .channel-logo');
  await expect.poll(() => logo.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  await page.locator('#watch-m1').hover();
  await expect.poll(() => page.locator('#watch-m1').evaluate(el => getComputedStyle(el).transform)).not.toBe('none');
  await page.mouse.wheel(0, 5);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.mouse.wheel(0, -1000);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});

test('programme titles refresh every minute without replacing tiles or losing focus and scroll', async ({ page }) => {
  await mockProvider(page);
  let requests = 0;
  await page.route('**/api/channels', route => {
    requests++;
    return route.fulfill({ json: { returnValue: true, data: Array.from({ length: 7 }, (_, index) => ({
      id: index === 0 ? 'm4' : `test${index}`, name: `Channel ${index}`, description: requests === 1 ? 'First programme' : 'Next programme',
    })) } });
  });
  await page.clock.install();
  await page.goto('/'); await login(page);
  await expect(page.locator('#watch .programme')).toHaveText('First programme');
  await page.locator('#watch-test4').focus();
  await page.evaluate(() => { window.originalTile = document.getElementById('watch-test4'); window.originalScroll = scrollY; });
  await page.clock.fastForward(60_000);
  await expect(page.locator('#watch .programme')).toHaveText('Next programme');
  await expect(page.locator('#watch-test4')).toBeFocused();
  expect(await page.evaluate(() => window.originalTile === document.getElementById('watch-test4') && scrollY === window.originalScroll)).toBe(true);
  await page.locator('#watch-test4').click();
  const before = requests;
  await page.clock.fastForward(120_000);
  expect(requests).toBe(before);
  await page.keyboard.press('Escape');
  await expect.poll(() => requests).toBe(before + 1);
  await page.getByRole('button', { name: 'Kijelentkezés', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Bejelentkezés', exact: true })).toBeFocused();
  const signedOut = requests;
  await page.clock.fastForward(120_000);
  expect(requests).toBe(signedOut);
});
