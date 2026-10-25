const { test } = require('node:test');
const assert = require('node:assert/strict');
const { NvtProvider, parseLoginForm, parseMethod, parseChannels, extractMedia, playerRequest, LOGIN_PAGE, CONFIG, WELCOME } = require('../dist/test/provider.cjs');
const { gatewayUrl, proxied, GATEWAY } = require('../dist/test/transport.cjs');
const { dispatch } = require('../dist/test/dispatch.cjs');

const form = `<form id='loginForm' method='post' action='/prx/000/http/localhost/login'><input name='uname'><input name='pwd' type='password'><input type='hidden' name='csrf' value='synthetic&amp;only'></form>`;
const config = 'var _AN_aaa_method = [{"name":"ExampleLDAP","authtype":0,"multiauth":false}];';
const credentials = { email: 'viewer@example.test', password: 'synthetic&+= Á test' };
const response = (url, body, status = 200) => ({ url, body: Buffer.from(body), status, headers: {} });

function fakeTransport(items) {
  return { calls: [], clears: 0, clear() { this.clears++; }, async request(url, options) {
    this.calls.push({ url, options });
    const item = items.shift();
    assert.ok(item, 'unexpected provider request');
    return typeof item === 'function' ? item(url, options) : item;
  } };
}
function loginResponses() { return [response(LOGIN_PAGE, form), response(CONFIG, config), response(WELCOME, 'Welcome'), response(WELCOME, 'Welcome')]; }

test('parses observed form structure, entities and hidden fields without executing scripts', () => {
  const parsed = parseLoginForm(form);
  assert.equal(parsed.fields.csrf, 'synthetic&only');
  assert.equal(parsed.action, `${GATEWAY}/prx/000/http/localhost/login`);
  assert.equal(parseMethod(config), 'ExampleLDAP');
});
test('rejects an unexpected login action or multi-step authentication', () => {
  assert.throws(() => parseLoginForm(form.replace('/prx/000/http/localhost/login', 'https://attacker.example/login')), { code: 'PROVIDER_CHANGED' });
  assert.throws(() => parseMethod(config.replace('false', 'true')), { code: 'CHALLENGE_REQUIRED' });
  assert.throws(() => parseMethod('var _AN_clientsecurity_on = true;'), { code: 'CHALLENGE_REQUIRED' });
});
test('does not send credentials outside the gateway or to unapproved rewritten targets', () => {
  for (const bad of ['http://nvpn.nvt.gov.hu/', 'https://attacker.example/', `${GATEWAY}/prx/000/https/attacker.example/login`, `${GATEWAY}/prx/000/https/m4sport.hu@attacker.example/`, `${GATEWAY}/anything`, `${GATEWAY}/prx/000/https/127.0.0.1/`]) {
    assert.throws(() => gatewayUrl(bad), { code: 'PROVIDER_CHANGED' });
  }
  assert.equal(proxied('https://player.mediaklikk.hu/playernew/player.php?video=example'), `${GATEWAY}/prx/000/https/player.mediaklikk.hu/playernew/player.php?video=example`);
});
test('posts exact credentials once with the current form fields and verifies welcome', async () => {
  const transport = fakeTransport(loginResponses());
  const provider = new NvtProvider(transport);
  assert.equal((await provider.login(credentials)).authenticated, true);
  const posts = transport.calls.filter(call => call.options?.method === 'POST');
  assert.equal(posts.length, 1);
  const fields = new URLSearchParams(posts[0].options.body);
  assert.equal(fields.get('pwd'), credentials.password);
  assert.equal(fields.get('uname'), credentials.email);
  assert.equal(fields.get('csrf'), 'synthetic&only');
  assert.equal(fields.get('method'), 'ExampleLDAP');
  assert.equal((await provider.channels())[0].id, 'm4');
});
test('a 200 response containing the login form is not a successful login', async () => {
  const transport = fakeTransport([response(LOGIN_PAGE, form), response(CONFIG, config), response(LOGIN_PAGE, form)]);
  const provider = new NvtProvider(transport);
  await assert.rejects(provider.login(credentials), { code: 'INVALID_CREDENTIALS' });
  await assert.rejects(provider.channels(), { code: 'AUTH_REQUIRED' });
  assert.equal(transport.calls.filter(call => call.options?.method === 'POST').length, 1);
});
test('logout prevents an in-flight login from restoring authentication', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const transport = fakeTransport([response(LOGIN_PAGE, form), response(CONFIG, config), () => pending]);
  const provider = new NvtProvider(transport);
  const login = provider.login(credentials);
  while (transport.calls.length < 3) await new Promise(resolve => setImmediate(resolve));
  await provider.logout();
  release(response(WELCOME, 'Welcome'));
  await assert.rejects(login, { code: 'CANCELLED' });
  assert.equal((await provider.status()).authenticated, false);
});
test('service responses never leak exception text', async () => {
  const provider = { status: async () => { throw new Error('pwd=synthetic-private-data'); } };
  const result = await dispatch(provider, 'status', {});
  assert.deepEqual(result, { returnValue: false, code: 'NETWORK' });
  assert.ok(!JSON.stringify(result).includes('synthetic-private'));
});
test('resolves the observed player bootstrap without executing provider scripts', () => {
  const html = `<script>loadPlayer('synthetic-player', {"streamId":"mtv4live","blogId":10,"adVastPreroll":"https://ads.example.test/ad"});</script>`;
  const url = new URL(playerRequest(html));
  assert.equal(url.searchParams.get('video'), 'mtv4live');
  assert.equal(url.searchParams.get('vastpreroll'), 'https://ads.example.test/ad');
  const media = extractMedia('"playlist": [{"file": "/prx/000/https/c401-node61-cdn.connectmedia.hu/synthetic/index.m3u8?v=synthetic", "type":"hls"}]', url.href);
  assert.equal(media, 'https://nvpn.nvt.gov.hu/prx/000/https/c401-node61-cdn.connectmedia.hu/synthetic/index.m3u8?v=synthetic');
  assert.throws(() => extractMedia('"file":"https://attacker.example/a.m3u8"', url.href), { code: 'PROVIDER_CHANGED' });
});
test('authenticated media resolution follows the player document and never caches its URL', async () => {
  const transport = fakeTransport([...loginResponses(),
    response('https://nvpn.nvt.gov.hu/prx/000/https/m4sport.hu/elo/mtv4live', `<script>loadPlayer('example', {"streamId":"mtv4live"});</script>`),
    response('https://nvpn.nvt.gov.hu/prx/000/https/player.mediaklikk.hu/playernew/player.php', `"file":"/prx/000/https/c401-node61-cdn.connectmedia.hu/synthetic/index.m3u8"`),
  ]);
  const provider = new NvtProvider(transport);
  await provider.login(credentials);
  const source = await provider.resolve('m4');
  assert.equal(source.mime, 'application/vnd.apple.mpegurl');
  assert.ok(source.url.endsWith('/synthetic/index.m3u8'));
  await provider.logout();
  await assert.rejects(provider.resolve('m4'), { code: 'AUTH_REQUIRED' });
});
test('all seven TV channels remain available and only active known event feeds are added', () => {
  const channels = parseChannels(JSON.stringify({ streams: [
    { code: 'mtv1live', type: 'live', title: 'Synthetic programme' },
    { code: 'm4sport2', type: 'live', title: 'Synthetic event' },
    { code: 'm4sport3', type: 'next', title: 'Future event' },
    { code: 'unknown', type: 'live', title: 'Unrecognized source' },
  ] }));
  assert.equal(channels.length, 8);
  assert.deepEqual(channels.slice(0,7).map(c => c.id), ['m4', 'm1', 'm2', 'm4plus', 'm5', 'duna', 'dunaworld']);
  assert.equal(channels.find(c => c.id === 'm1').description, 'Synthetic programme');
  assert.equal(channels.at(-1).id, 'm4sport2');
});
