const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

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

test('packaged CX app loads scripts, styles and images from a file address', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.cspViolations = [];
    document.addEventListener('securitypolicyviolation', event => {
      window.cspViolations.push(`${event.effectiveDirective}: ${event.blockedURI}`);
    });
    window.PalmServiceBridge = class {
      call(uri) {
        if (uri.endsWith('/lease')) return;
        this.onservicecallback(JSON.stringify({ returnValue: true, data: { authenticated: false } }));
      }
      cancel() {}
    };
  });
  await page.goto(pathToFileURL(path.resolve('dist/cx/tv/index.html')).href);
  await expect(page.getByRole('button', { name: 'Bejelentkezés', exact: true })).toBeFocused();
  expect(await page.locator('link[rel="stylesheet"]').evaluate(link => Boolean(link.sheet))).toBe(true);
  expect(await page.locator('#login-screen .brand-mark').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  expect(await page.evaluate(() => window.cspViolations)).toEqual([]);
  expect(errors).toEqual([]);
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
  await expect(page.locator('#player-screen')).toBeVisible();
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
