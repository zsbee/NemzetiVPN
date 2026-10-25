const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MediaRelay, mediaUri, rewritePlaylist } = require('../dist/test/relay.cjs');
const base = 'https://nvpn.nvt.gov.hu/prx/000/https/c401-node61-cdn.connectmedia.hu/synthetic/master.m3u8';

test('nested playlists, audio, keys and maps all use registered local resources', () => {
  const registered = [];
  const result = rewritePlaylist('#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,URI="audio.m3u8"\n#EXT-X-KEY:METHOD=AES-128,URI="https://cdn.connectmedia.hu/synthetic/key.bin"\n#EXT-X-MAP:URI="init.mp4"\nvariant.m3u8\n', uri => { registered.push(uri); return 'http://127.0.0.1:1/cap/id' + registered.length; });
  assert.deepEqual(registered, ['audio.m3u8', 'https://cdn.connectmedia.hu/synthetic/key.bin', 'init.mp4', 'variant.m3u8']);
  assert.ok(!result.includes('connectmedia.hu'));
  assert.ok(result.includes('URI="http://127.0.0.1:1/cap/id2"'));
});
test('relative and root-relative paths keep the upstream proxy prefix', () => {
  assert.equal(mediaUri('audio.m3u8', base), base.replace('master', 'audio'));
  assert.equal(mediaUri('/live/segment.ts', base), 'https://nvpn.nvt.gov.hu/prx/000/https/c401-node61-cdn.connectmedia.hu/live/segment.ts');
  assert.throws(() => mediaUri('https://attacker.example/segment.ts', base), { code: 'PROVIDER_CHANGED' });
  assert.throws(() => mediaUri('/prx/000/http/localhost/login', base), { code: 'PROVIDER_CHANGED' });
  assert.throws(() => rewritePlaylist('<html>login</html>', () => ''), { code: 'UNSUPPORTED_MEDIA' });
  assert.throws(() => rewritePlaylist('#EXTM3U\n#EXT-X-KEY:METHOD=SAMPLE-AES,KEYFORMAT="com.example.drm",URI="license"', () => ''), { code: 'UNSUPPORTED_MEDIA' });
});
test('relay binds loopback, enforces capability/origin and serves only registered resources', async () => {
  const fetched = [];
  const relay = new MediaRelay(async url => {
    fetched.push(url);
    return { url, status: 200, headers: { 'content-type': url.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t' }, body: Buffer.from(url.endsWith('.m3u8') ? '#EXTM3U\nsegment.ts\n' : 'synthetic-media') };
  }, 'http://127.0.0.1:4390');
  try {
    const url = await relay.start(base);
    assert.ok(new URL(url).pathname.endsWith('.m3u8'));
    assert.equal(new URL(url).hostname, '127.0.0.1');
    const noCapability = await fetch(url.replace(/\/[a-f0-9]{48}\//, '/incorrect/'));
    assert.equal(noCapability.status, 403);
    const foreign = await fetch(url, { headers: { Origin: 'https://attacker.example' } });
    assert.equal(foreign.status, 403);
    assert.equal(fetched.length, 0);
    const head = await fetch(url, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('content-type'), 'application/vnd.apple.mpegurl');
    assert.ok(Number(head.headers.get('content-length')) > 0);
    assert.equal((await head.text()).length, 0);
    const master = await fetch(url, { headers: { Origin: 'http://127.0.0.1:4390' } });
    assert.equal(master.headers.get('access-control-allow-origin'), 'http://127.0.0.1:4390');
    const segment = (await master.text()).trim().split('\n').at(-1);
    const bytes = await fetch(segment, { headers: { Range: 'bytes=0-8' } });
    assert.equal(bytes.status, 206);
    assert.equal(await bytes.text(), 'synthetic');
    assert.ok(new URL(segment).pathname.endsWith('.ts'));
    assert.equal(fetched.at(-1), base.replace('master.m3u8', 'segment.ts'));
    const unknown = await fetch(url.replace(/[^/]+$/, 'not-registered'));
    assert.equal(unknown.status, 404);
  } finally { relay.stop(); }
});
test('starting another stream invalidates old capability and logout stops the listener', async () => {
  const relay = new MediaRelay(async url => ({ url, status: 200, headers: {}, body: Buffer.from('#EXTM3U\n') }));
  const first = await relay.start(base);
  const second = await relay.start(base);
  await assert.rejects(fetch(first));
  assert.equal((await fetch(second)).status, 200);
  relay.stop();
  await assert.rejects(fetch(second));
});
