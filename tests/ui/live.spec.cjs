const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const channels = [
  { id: 'm4', name: 'M4 Sport', description: 'Sport' },
  { id: 'm1', name: 'M1', description: 'Hírek' },
  { id: 'm4sport1', name: 'M4 Sport 1', description: 'Esemény' },
];
const qualities = [{ id: 'aaaaaaaaaaaaaaaa', label: '720p' }, { id: 'bbbbbbbbbbbbbbbb', label: '1080p' }];
async function setup(page, options = {}) {
  const resolves = [], guides = [];
  await page.addInitScript(() => {
    // UI tests use a deterministic playing stub; real media errors are covered separately.
    for (const prototype of [HTMLMediaElement.prototype, HTMLSourceElement.prototype]) {
      const add = prototype.addEventListener;
      prototype.addEventListener = function(type, ...args) { if (type !== 'error') return add.call(this, type, ...args); };
    }
    HTMLMediaElement.prototype.canPlayType = () => 'maybe';
    HTMLMediaElement.prototype.load = function () {};
    HTMLMediaElement.prototype.play = function () { this.dispatchEvent(new Event('playing')); return Promise.resolve(); };
  });
  await page.route('**/api/**', async route => {
    const method = route.request().url().split('/').pop();
    const payload = route.request().postDataJSON();
    let data = {};
    if (method === 'status' || method === 'login') data = { authenticated: true };
    if (method === 'channels') data = channels;
    if (method === 'logout') data = { remoteConfirmed: true };
    if (method === 'resolve') {
      resolves.push(payload);
      if (options.delay && payload.id === 'm1') await new Promise(resolve => setTimeout(resolve, 180));
      if (options.failManual && payload.quality !== 'auto') return route.fulfill({ json: { returnValue: false, code: 'PLAYBACK' } });
      data = { url: '/synthetic.m3u8', mime: 'application/vnd.apple.mpegurl', qualities, quality: payload.quality || 'auto' };
    }
    if (method === 'guide') {
      guides.push(payload.date);
      if (options.noGuide) return route.fulfill({ json: { returnValue: false, code: 'NETWORK' } });
      const now = Date.now();
      data = { date: payload.date, updatedAt: now, programmes: ['m4', 'm1'].map(channel => ({ channel, title: `Current ${channel}`, start: now - 60000, end: now + 3600000, subtitle: 'Episode', description: 'Programme details' })).concat(
        Array.from({ length: 16 }, (_, i) => ({ channel: 'm4', title: `Next programme ${i}`, start: now + (i + 1) * 3600000, end: now + (i + 2) * 3600000 }))
      ) };
    }
    await route.fulfill({ json: { returnValue: true, data } });
  });
  await page.goto('/');
  if (options.capture) {
    await expect.poll(() => page.locator('#login-screen .brand-mark').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    await page.screenshot({ path: '.local/design/redesign-login.png', animations: 'disabled' });
  }
  await page.getByLabel('E-mail-cím', { exact: true }).fill('viewer@example.test');
  await page.getByLabel('Jelszó', { exact: true }).fill('synthetic-password');
  await page.getByRole('button', { name: 'Bejelentkezés', exact: true }).click();
  if (options.capture) {
    await expect(page.locator('#channels-screen')).toBeVisible();
    await page.screenshot({ path: '.local/design/redesign-channels.png', animations: 'disabled' });
  }
  await page.locator('#watch').click();
  await expect.poll(() => resolves.length).toBe(1);
  return { resolves, guides };
}

test('hidden playback arrows switch in catalogue order, wrap, ignore holds and keep overlays hidden', async ({ page }) => {
  const { resolves } = await setup(page, { delay: true });
  await expect(page.locator('video')).not.toHaveAttribute('controls');
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => resolves.length).toBe(2);
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => resolves.length).toBe(3);
  await expect(page.locator('#player-title')).toHaveText('M4 Sport 1');
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', repeat: true, bubbles: true })));
  expect(resolves.length).toBe(3);
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => resolves.length).toBe(4);
  expect(resolves.map(p => p.id)).toEqual(['m4', 'm1', 'm4sport1', 'm4']);
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => resolves.length).toBe(5);
  expect(resolves.at(-1).id).toBe('m4sport1');
  await page.waitForTimeout(220);
  await expect(page.locator('#player-title')).toHaveText('M4 Sport 1');
  await expect(page.locator('#player-overlay')).toHaveAttribute('inert', '');
  await expect(page.locator('#guide-panel')).toBeHidden();
});

test('Up opens a focused guide over uninterrupted playback; browse, details and Back stay within the panel', async ({ page }) => {
  const { resolves, guides } = await setup(page);
  const source = await page.locator('video source').getAttribute('src');
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#guide-panel')).toBeVisible();
  await expect(page.getByRole('button', { name: /Current m4/ })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#detail-title')).toHaveText('Current m4');
  await expect(page.locator('#detail-description')).toHaveText('Programme details');
  await page.keyboard.press('Escape');
  await expect(page.locator('#guide-content')).toBeVisible();
  await page.getByRole('button', { name: 'Következő nap', exact: true }).click();
  await expect(page.locator('#guide-date')).toHaveText('Holnap');
  expect(new Set(guides).size).toBeGreaterThan(1);
  await page.getByRole('button', { name: 'Következő csatorna a műsorújságban', exact: true }).click();
  await expect(page.locator('#guide-channel')).toHaveText('M1');
  await page.keyboard.press('ArrowRight');
  expect(resolves.length).toBe(1);
  await expect(page.locator('video source')).toHaveAttribute('src', source);
  await page.keyboard.press('Escape');
  await expect(page.locator('#guide-panel')).toBeHidden();
  await expect(page.locator('#player-overlay')).toHaveAttribute('inert', '');
  await expect(page.locator('video')).toBeFocused();
});

test('Down reveals the leftmost back arrow; arrows navigate actions and quality choices apply', async ({ page }) => {
  const { resolves } = await setup(page);
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#back-player')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#open-guide')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#open-quality')).toBeFocused();
  expect(resolves.length).toBe(1);
  await page.keyboard.press('Enter');
  await expect(page.locator('#quality-panel')).toBeVisible();
  await page.getByRole('button', { name: '1080p', exact: true }).click();
  await expect.poll(() => resolves.length).toBe(2);
  expect(resolves[1].quality).toBe('bbbbbbbbbbbbbbbb');
  await expect(page.locator('#quality-label')).toHaveText('Minőség · 1080p');
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => resolves.length).toBe(3);
  expect(resolves[2]).toMatchObject({ id: 'm1', quality: 'bbbbbbbbbbbbbbbb' });
});

test('failed manual quality recovers once with Auto and explains the change', async ({ page }) => {
  const { resolves } = await setup(page, { failManual: true });
  await page.keyboard.press('ArrowDown');
  await page.locator('#open-quality').click();
  await page.getByRole('button', { name: '720p', exact: true }).click();
  await expect.poll(() => resolves.length).toBe(3);
  expect(resolves.map(item => item.quality)).toEqual(['auto', 'aaaaaaaaaaaaaaaa', 'auto']);
  await expect(page.locator('#player-notice')).toContainText('Auto');
});

test('guide outage keeps playback usable and temporary event streams have no borrowed schedule', async ({ page }) => {
  const { resolves } = await setup(page, { noGuide: true });
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#guide-message')).toContainText('nem érhetők el');
  await page.keyboard.press('Escape');
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => resolves.length).toBe(2);
  await expect(page.locator('#player-title')).toHaveText('M4 Sport 1');
  expect(resolves.at(-1).id).toBe('m4sport1');
});

test('glass layouts fit the TV viewport and guide scrolling stays inside its panel', async ({ page }) => {
  await setup(page, { capture: true });
  await page.keyboard.press('ArrowUp');
  const panel = page.locator('#guide-panel');
  const bounds = await panel.boundingBox();
  expect(bounds.x).toBeGreaterThan(0); expect(bounds.y).toBeGreaterThan(0);
  expect(bounds.y + bounds.height).toBeLessThan(1080);
  const last = page.locator('.guide-row').last();
  await last.focus();
  await expect.poll(() => page.locator('#guide-list').evaluate(e => e.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await page.screenshot({ path: '.local/design/live-guide.png', animations: 'disabled' });
  await page.keyboard.press('Escape');
  await page.keyboard.press('ArrowDown');
  await page.screenshot({ path: '.local/design/live-toolbar.png', animations: 'disabled' });
});
