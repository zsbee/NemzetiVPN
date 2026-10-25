const { test } = require('node:test');
const assert = require('node:assert/strict');
const { qualityChoices, selectQuality } = require('../dist/test/quality.cjs');
const { MediaRelay, MediaBackend } = require('../dist/test/relay.cjs');
const base = 'https://nvpn.nvt.gov.hu/prx/000/https/c401-node61-cdn.connectmedia.hu/synthetic/master.m3u8';
const master = '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="hu",URI="audio.m3u8"\n#EXT-X-SESSION-KEY:METHOD=AES-128,URI="key.bin"\n#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=1280x720,AUDIO="hu"\n720.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=4000000,RESOLUTION=1920x1080,AUDIO="hu"\n1080.m3u8\n';
test('quality filtering retains audio groups and keys, with stable IDs across signed URI changes', () => {
  const choices = qualityChoices(master);
  assert.deepEqual(choices.map(c => c.label), ['720p', '1080p']);
  assert.deepEqual(qualityChoices(master.replace('720.m3u8', '720.m3u8?token=new')), choices);
  const filtered = selectQuality(master, choices[1].id);
  assert.ok(filtered.includes('1080.m3u8')); assert.ok(!filtered.includes('720.m3u8'));
  assert.ok(filtered.includes('audio.m3u8')); assert.ok(filtered.includes('key.bin'));
  assert.equal(selectQuality(master, 'missing'), master);
  assert.deepEqual(qualityChoices('#EXTM3U\n#EXTINF:4\nseg.ts'), []);
});
test('filtered masters still rewrite separate audio and encrypted resources through the relay', async () => {
  const relay = new MediaRelay(async url => ({ url, status: 200, headers: {}, body: Buffer.from('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\nsegment.ts') }));
  try {
    const url = await relay.start(base, selectQuality(master, qualityChoices(master)[1].id));
    const text = await (await fetch(url)).text();
    assert.equal((text.match(/#EXT-X-STREAM-INF/g) || []).length, 1);
    assert.ok(!text.includes('connectmedia')); assert.ok(!text.includes('720.m3u8'));
    const audio = /TYPE=AUDIO[^\n]*URI="([^"]+)"/.exec(text)[1];
    assert.equal((await fetch(audio)).status, 200);
  } finally { relay.stop(); }
});
test('late channel resolutions and stop cannot resurrect an older relay', async () => {
  let finish;
  const provider = { resolve: id => id === 'old' ? new Promise(resolve => { finish = resolve; }) : Promise.resolve({ url: base, mime: 'application/vnd.apple.mpegurl' }), media: async url => ({ url, status: 200, headers: {}, body: Buffer.from(master) }) };
  const backend = new MediaBackend(provider);
  const old = backend.resolve('old').catch(e => e.code);
  try {
    const latest = await backend.resolve('new');
    finish({ url: base, mime: 'application/vnd.apple.mpegurl' });
    assert.equal(await old, 'CANCELLED');
    assert.equal((await fetch(latest.url)).status, 200);
    const pending = backend.resolve('old').catch(e => e.code);
    await backend.stop(); finish({ url: base, mime: 'application/vnd.apple.mpegurl' });
    assert.equal(await pending, 'CANCELLED');
  } finally { await backend.stop(); }
});
