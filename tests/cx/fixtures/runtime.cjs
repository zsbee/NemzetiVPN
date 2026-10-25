// Deliberately Node 8 syntax: execute this fixture with NVT_NODE8 or the host Node.
const assert = require('assert');
const http = require('http');
const https = require('https');
const EventEmitter = require('events');
const zlib = require('zlib');

// Exercise the fallback path on modern Node as well as the actual Node 8 runtime.
global.URL = undefined;
global.URLSearchParams = undefined;
global.AbortController = undefined;
String.prototype.matchAll = undefined;
String.prototype.trimStart = undefined;
Array.prototype.flatMap = undefined;
Promise.prototype.finally = undefined;
const backend = require('../../../dist/cx/test/backend.cjs');
const base = 'https://nvpn.nvt.gov.hu/prx/000/https/m4sport.hu/master.m3u8';
// Node 8 http.get also takes one options object.
function localGet(url, headers) {
  return new Promise((resolve, reject) => {
    http.get(Object.assign(require('url').parse(url), { headers: headers || {} }), response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString() }));
    }).on('error', reject);
  });
}
async function main() {
  const guideHtml = '<div data-channelid="30"><div class="channel_body"><li data-from="2026-10-25 02:30:00+0200" data-till="2026-10-25 02:30:00+0100"><h1>Sport</h1></li></div></div>';
  const guide = new backend.ProgrammeGuide(async () => guideHtml);
  assert.strictEqual((await guide.day(backend.guideDate())).programmes[0].end - backend.parseGuide(guideHtml)[0].start, 3600000);
  const master = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=1280x720\n720.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=1920x1080\n1080.m3u8';
  const qualities = backend.qualityChoices(master);
  assert.strictEqual(qualities.length, 2);
  assert(!backend.selectQuality(master, qualities[0].id).includes('1080.m3u8'));
  assert.strictEqual(backend.parseChannels('{"streams":[]}').length, 7);
  assert(backend.playerRequest('loadPlayer("id", {"streamId":"mtv4live"})').includes('video=mtv4live'));
  assert.strictEqual(backend.rewritePlaylist(' \n#EXTM3U\nseg.ts', () => 'local'), ' \n#EXTM3U\nlocal');
  const form = '<form id="loginForm" method="post" action="/prx/000/http/localhost/login"><input name="uname"><input name="pwd"></form>';
  const responses = [
    [backend.LOGIN_PAGE, form], [backend.CONFIG, 'var _AN_aaa_method = [{"name":"LDAP","authtype":0,"multiauth":false}];'],
    [backend.WELCOME, 'Welcome'], [backend.WELCOME, 'Welcome'],
  ];
  const provider = new backend.NvtProvider({ clear() {}, request: async () => {
    const next = responses.shift();
    assert(next);
    return { url: next[0], status: 200, headers: {}, body: Buffer.from(next[1]) };
  } });
  assert.strictEqual((await provider.login({ email: 'cx@example.test', password: 'synthetic' })).authenticated, true);
  await provider.logout();

  const relay = new backend.MediaRelay(async url => ({ url, status: 200, headers: {}, body: Buffer.from(url.endsWith('.m3u8') ? '#EXTM3U\nseg.ts' : 'synthetic-media') }));
  try {
    const url = await relay.start(base);
    assert.strictEqual((await localGet(url.replace(/\/[a-f0-9]{48}\//, '/invalid/'))).status, 403);
    assert.strictEqual((await localGet(url, { Origin: 'https://attacker.example' })).status, 403);
    const playlist = await localGet(url);
    assert.strictEqual(playlist.status, 200);
    const segment = playlist.body.trim().split('\n')[1];
    const range = await localGet(segment, { Range: 'bytes=0-8' });
    assert.strictEqual(range.status, 206);
    assert.strictEqual(range.body, 'synthetic');
  } finally { relay.stop(); }

  const originalRequest = https.request;
  try {
    let captured, destroyed = false;
    https.request = options => {
      captured = options;
      const request = new EventEmitter();
      request.destroy = () => { destroyed = true; request.emit('close'); };
      return request;
    };
    const controller = new AbortController();
    backend.legacyHttps.request('https://example.test/path', { method: 'GET', signal: controller.signal }, () => {});
    assert.strictEqual(captured.hostname, 'example.test');
    assert.strictEqual(captured.path, '/path');
    assert.strictEqual(captured.signal, undefined);
    controller.abort();
    assert(destroyed);
    destroyed = false;
    const cancelled = new AbortController(); cancelled.abort();
    backend.legacyHttps.request('https://example.test/', { signal: cancelled.signal }, () => {});
    await new Promise(resolve => process.nextTick(resolve));
    assert(destroyed);
  } finally { https.request = originalRequest; }
  for (const method of ['gunzip', 'inflate']) {
    const compressed = method === 'gunzip' ? zlib.gzipSync('synthetic') : zlib.deflateSync('synthetic');
    const output = await new Promise((resolve, reject) => backend.legacyZlib[method](compressed, { maxOutputLength: 100 }, (error, body) => error ? reject(error) : resolve(body)));
    assert.strictEqual(output.toString(), 'synthetic');
    const oversized = await new Promise(resolve => backend.legacyZlib[method](compressed, { maxOutputLength: 2 }, error => resolve(Boolean(error))));
    assert(oversized);
  }
  const Module = require('module');
  const load = Module._load;
  const handlers = {};
  try {
    Module._load = function (name) {
      if (name === 'webos-service') return class {
        register(method, callback) { handlers[method] = callback; }
      };
      return load.apply(this, arguments);
    };
    require('../../../dist/cx/service/main.js');
  } finally { Module._load = load; }
  assert(handlers.lease && handlers.login && handlers.resolve);
  const denied = await new Promise(resolve => handlers.status({ sender: 'other.app', respond: resolve }));
  assert.strictEqual(denied.returnValue, false);
  const status = await new Promise(resolve => handlers.status({ sender: 'hu.nemzetivpn.tv', payload: {}, respond: resolve }));
  assert.strictEqual(status.data.authenticated, false);
  console.log('CX runtime checks passed on ' + process.version);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
