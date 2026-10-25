const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    delete window.globalThis;
    delete Element.prototype.replaceChildren;
    delete Promise.allSettled;
    delete HTMLElement.prototype.inert;
    delete AbortSignal.timeout;
  });
  await page.route('**/api/**', route => {
    const method = route.request().url().split('/').pop();
    const data = method === 'login' || method === 'status' ? { authenticated: true }
      : method === 'logout' ? { remoteConfirmed: true } : {};
    return route.fulfill({ json: { returnValue: true, data } });
  });
});

test('legacy browser saves login, restores it, plays, returns and signs out', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.canPlayType = () => 'maybe';
    HTMLMediaElement.prototype.load = function () {};
    HTMLMediaElement.prototype.play = function () {
      this.dispatchEvent(new Event('playing'));
      return Promise.resolve();
    };
  });
  await page.route('**/api/resolve', route => route.fulfill({ json: { returnValue: true, data: { url: 'http://127.0.0.1:4390/synthetic.m3u8', mime: 'application/vnd.apple.mpegurl' } } }));
  await page.goto('/');
  await page.getByLabel('E-mail-cím', { exact: true }).fill('cx@example.test');
  await page.getByLabel('Jelszó', { exact: true }).fill('synthetic-password');
  await page.getByRole('button', { name: 'Bejelentkezés', exact: true }).click();
  await expect(page.getByText('Belépés mentve ezen a tévén', { exact: true })).toBeVisible();
  await page.reload();
  await page.locator('#watch').click();
  await expect(page.locator('video source')).toHaveCount(1);
  await expect(page.locator('#player-overlay')).toHaveAttribute('inert', '', { timeout: 5000 });
  await expect(page.locator('#back-player')).toHaveAttribute('tabindex', '-1');
  await page.keyboard.press('Enter');
  await expect(page.locator('#back-player')).toBeFocused();
  await expect(page.locator('#back-player')).not.toHaveAttribute('tabindex', '-1');
  await page.keyboard.press('Escape');
  await expect(page.locator('#watch')).toBeFocused();
  await expect(page.locator('video source')).toHaveCount(0);
  await page.getByRole('button', { name: 'Kijelentkezés', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Bejelentkezés', exact: true })).toBeFocused();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Bejelentkezés', exact: true })).toBeFocused();
  expect(errors).toEqual([]);
});

test('missing Web Crypto permits session-only login without storing plaintext', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window.crypto, 'subtle', { value: undefined }));
  await page.goto('/');
  await page.getByLabel('E-mail-cím', { exact: true }).fill('cx@example.test');
  await page.getByLabel('Jelszó', { exact: true }).fill('synthetic-password');
  await page.getByRole('button', { name: 'Bejelentkezés', exact: true }).click();
  await expect(page.locator('#channels-screen')).toBeVisible();
  await expect(page.getByText('A belépés nincs mentve', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  await page.getByRole('button', { name: 'Kijelentkezés', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Bejelentkezés', exact: true })).toBeFocused();
});
