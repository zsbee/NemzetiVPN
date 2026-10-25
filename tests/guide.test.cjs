const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseGuide, programmeInstant, ProgrammeGuide } = require('../dist/test/guide.cjs');
const { nowNext, guideDate, shiftDate } = require('../dist/test/programmes.cjs');
const html = `<div data-channelid="30"><div class="channel_body"><ul>
<li data-from="2026-10-25 02:30:00+0200" data-till="2026-10-25 02:30:00+0100"><h1>Sport &amp; news<span class="hms-sr-only">, műsor</span></h1><p id="pg30i0p">Final</p><div class="program_description"><p>Plain <b>description</b>.</p><script>bad()</script></div></li>
<li data-from="broken" data-till="2026-10-25 05:00:00+0100"><h1>Invalid</h1></li>
</ul></div></div><div data-channelid="1"><div class="channel_body"><li data-from="2026-10-25 03:00:00+0100" data-till="2026-10-25 04:00:00+0100"><h1>Híradó</h1></li></div></div>`;
test('guide extracts plain programme data and preserves both sides of the autumn clock change', () => {
  const rows = parseGuide(html);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].channel, 'm4');
  assert.equal(rows[0].title, 'Sport & news');
  assert.equal(rows[0].subtitle, 'Final');
  assert.equal(rows[0].description, 'Plain description.');
  assert.equal(rows[0].end - rows[0].start, 3600000);
  assert.equal(rows[1].channel, 'm1');
  assert.equal(Number.isNaN(programmeInstant('bad')), true);
});
test('current and next use instants across midnight and exact boundaries', () => {
  const rows = [{ channel: 'm4', title: 'Overnight', start: 100, end: 300 }, { channel: 'm4', title: 'Next', start: 300, end: 500 }];
  assert.equal(nowNext(rows, 'm4', 299).current.title, 'Overnight');
  assert.equal(nowNext(rows, 'm4', 300).current.title, 'Next');
  assert.equal(nowNext(rows, 'm1', 300).current, undefined);
  assert.equal(guideDate(Date.parse('2026-10-25T23:30:00Z')), '2026-10-26');
  assert.equal(shiftDate('2026-10-25', 1), '2026-10-26');
});
test('guide deduplicates pending requests, bounds dates and serves stale data during outages', async () => {
  let calls = 0, fail = false;
  const guide = new ProgrammeGuide(async () => { calls++; if (fail) throw Error('offline'); return html; });
  const today = guideDate();
  const [a, b] = await Promise.all([guide.day(today), guide.day(today)]);
  assert.equal(calls, 1); assert.deepEqual(a, b);
  a.updatedAt = Date.now() - 300001;
  fail = true;
  const cached = await guide.day(today);
  assert.equal(cached.stale, true); assert.equal(cached.programmes.length, 2);
  await assert.rejects(guide.day('https://attacker.example'), { code: 'INVALID_REQUEST' });
  await assert.rejects(guide.day(shiftDate(today, 15)), { code: 'INVALID_REQUEST' });
});
