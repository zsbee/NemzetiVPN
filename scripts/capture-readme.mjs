// Run against a local preview: node scripts/capture-readme.mjs [preview URL]
// All provider requests are intercepted. No real account or broadcast is used.
import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const baseURL = process.argv[2] || 'http://127.0.0.1:4390';
if (!['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)) throw new Error('Use a local preview URL.');
const output = new URL('../docs/screenshots/', import.meta.url);
await mkdir(output, { recursive: true });
const channels = [
  ['m4', 'M4 Sport', 'Élő sportközvetítés'],
  ['m1', 'M1', 'Hírek és közélet'],
  ['m2', 'M2 / Petőfi TV', 'Gyermekműsorok és kultúra'],
  ['m4plus', 'M4 Sport +', 'További sportközvetítések'],
  ['m5', 'M5', 'Kultúra és ismeretterjesztés'],
  ['duna', 'Duna', 'Magyar műsorok és történetek'],
  ['dunaworld', 'Duna World', 'Magyarország a világban'],
].map(([id, name, description]) => ({ id, name, description }));
const titles = {
  m4: ['Sporthétvége', 'Pályaszél', 'A nap összefoglalója', 'Sporthíradó', 'Lelátó'],
  m1: ['Híradó', 'Időjárás-jelentés'], m2: ['Mesék délutánra', 'Esti mesék'],
  m4plus: ['Sportpercek', 'A hét sportpillanatai'], m5: ['Kulturális körkép', 'Magyar tájak'],
  duna: ['Családi történetek', 'Hazai ízek'], dunaworld: ['Magyarország képei', 'Közös értékeink'],
};
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.clock.install({ time: new Date('2026-10-25T15:30:00Z') });
  // Keep the live picture empty; these captures showcase the guide UI only.
  await page.addInitScript(() => {
    for (const prototype of [HTMLMediaElement.prototype, HTMLSourceElement.prototype]) {
      const add = prototype.addEventListener;
      prototype.addEventListener = function (type, ...args) { if (type !== 'error') return add.call(this, type, ...args); };
    }
    HTMLMediaElement.prototype.canPlayType = () => 'maybe';
    HTMLMediaElement.prototype.load = function () {};
    HTMLMediaElement.prototype.play = function () { this.dispatchEvent(new Event('playing')); return Promise.resolve(); };
  });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(baseURL).origin) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const method = url.pathname.split('/').at(-1);
    let data = {};
    if (method === 'login' || method === 'status') data = { authenticated: true };
    if (method === 'channels') data = channels;
    if (method === 'resolve') data = { url: '/screenshot-preview.m3u8', mime: 'application/vnd.apple.mpegurl', quality: 'auto' };
    if (method === 'guide') {
      const { date } = route.request().postDataJSON();
      const start = Date.parse(`${date}T15:00:00Z`);
      data = { date, updatedAt: start, programmes: channels.flatMap(({ id }) => titles[id].map((title, index) => ({
        channel: id, title, start: start + index * 3600000, end: start + (index + 1) * 3600000,
        subtitle: index === 0 ? 'Élő magazinműsor' : 'Magazinműsor',
        description: 'A hétvége sporteseményei, emlékezetes pillanatok és beszélgetések a stúdióban. Összefoglalók, háttértörténetek és friss eredmények egy helyen. Ez a leírás a képernyőképekhez készült mintaadat.',
      }))) };
    }
    await route.fulfill({ json: { returnValue: true, data } });
  });
  await page.goto(baseURL);
  await page.getByLabel('E-mail-cím', { exact: true }).fill('viewer@example.test');
  await page.getByLabel('Jelszó', { exact: true }).fill('screenshot-demo');
  await page.getByRole('button', { name: 'Bejelentkezés', exact: true }).click();
  await expect(page.locator('#watch .programme')).toHaveText('Most · Sporthétvége');
  await expect.poll(() => page.locator('.channel-logo').evaluateAll(images => images.every(img => img.complete && img.naturalWidth > 0))).toBe(true);
  const capture = async name => {
    await page.clock.runFor(800);
    await page.screenshot({ path: new URL(name, output).pathname, animations: 'disabled' });
    console.log(`Captured ${name}`);
  };
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#watch-m2')).toBeFocused();
  await capture('channels-green.png');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#watch')).toBeFocused();
  await capture('channels-red.png');
  await page.keyboard.press('Enter');
  await expect(page.locator('#player-status')).toBeEmpty();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.guide-row').first()).toBeFocused();
  await capture('programme-guide.png');
  await page.keyboard.press('Enter');
  await expect(page.locator('#detail-title')).toHaveText('Sporthétvége');
  await capture('programme-details.png');
} finally {
  await browser.close();
}
