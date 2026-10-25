import { Parser } from 'htmlparser2';
import { AppError, CHANNELS, EVENT_CHANNELS, publicError, validateCredentials, type Backend, type Channel, type Credentials, type Playback, type Status } from '../shared/types';
import { GATEWAY, GatewayTransport, gatewayUrl, proxied, type Transport } from './transport';

export const LOGIN_PAGE = `${GATEWAY}/prx/000/http/localhost/login/index.html`;
export const CONFIG = `${GATEWAY}/prx/000/http/localhost/an_login.js`;
export const WELCOME = `${GATEWAY}/prx/000/http/localhost/welcome/index.html`;
export const LIVE_PAGE = `${GATEWAY}/prx/000/https/m4sport.hu/elo/mtv4live`;
export const PLAYER_PAGE = `${GATEWAY}/prx/000/https/player.mediaklikk.hu/playernew/player.php`;
const CATALOG = `${GATEWAY}/prx/000/https/m4sport.hu/wp-content/plugins/hms-global-widgets/interfaces/streamJSONs/StreamSelector.json`;
export function parseChannels(text: string): Channel[] {
  const catalog = JSON.parse(text) as { streams?: { code?: string; type?: string; title?: string }[] };
  if (!Array.isArray(catalog.streams)) throw new AppError('PROVIDER_CHANGED');
  const current = new Map(catalog.streams.filter(item => item.type === 'live' && typeof item.code === 'string').map(item => [item.code, item]));
  return [...CHANNELS, ...EVENT_CHANNELS.filter(channel => current.has(channel.streamId))].map(channel => ({
    id: channel.id, name: channel.name,
    description: current.get(channel.streamId)?.title?.slice(0, 180) || channel.description,
  }));
}

export function extractMedia(html: string, base: string): string | null {
  const match = /["']?(?:src|file)["']?\s*[:=]\s*(["'])([^"']+\.m3u8(?:\?[^"']*)?)\1/i.exec(html);
  if (!match) return null;
  const source = match[2].replace(/\\\//g, '/').replace(/&amp;/g, '&');
  return proxied(new URL(source, base).href);
}

export function playerRequest(html: string, streamId = 'mtv4live', sourceUrl = `https://m4sport.hu/elo/${streamId}`): string {
  const matches = [...html.matchAll(/loadPlayer\s*\(\s*["'][^"']+["']\s*,\s*(\{[\s\S]*?\})\s*\)/g)];
  for (const match of matches) {
    let setup;
    try { setup = JSON.parse(match[1]); } catch { continue; }
    if (setup.streamId !== streamId) continue;
    const url = new URL(PLAYER_PAGE);
    url.search = new URLSearchParams({ video: setup.streamId, noflash: 'yes', osfamily: 'webOS', browsername: 'Chrome', browserversion: '120',
      sourceUrl, autostart: 'true', embedded: '0', title: String(setup.title ?? streamId), contentid: setup.streamId,
      ...(typeof setup.adVastPreroll === 'string' ? { vastpreroll: setup.adVastPreroll } : {}),
      ...(setup.blogId ? { blogId: String(setup.blogId) } : {}),
    }).toString();
    return url.href;
  }
  throw new AppError('PROVIDER_CHANGED');
}

export interface LoginForm { action: string; fields: Record<string, string> }
export function parseLoginForm(html: string, page = LOGIN_PAGE): LoginForm {
  let active = false;
  let found = false;
  let action = '';
  const fields: Record<string, string> = Object.create(null);
  const names = new Set<string>();
  const parser = new Parser({
    onopentag(name, attrs) {
      if (name === 'form' && attrs.id === 'loginForm') {
        if (found || attrs.method?.toLowerCase() !== 'post') throw new AppError('PROVIDER_CHANGED');
        found = active = true;
        action = gatewayUrl(attrs.action, page);
        if (new URL(action).pathname !== '/prx/000/http/localhost/login') throw new AppError('PROVIDER_CHANGED');
      }
      if (active && name === 'input' && attrs.type === 'hidden' && attrs.name) fields[attrs.name] = attrs.value ?? '';
      if (active && name === 'input' && attrs.name) names.add(attrs.name);
    },
    onclosetag(name) { if (name === 'form') active = false; },
  }, { decodeEntities: true });
  parser.end(html);
  if (!found || !names.has('uname') || !names.has('pwd')) throw new AppError('PROVIDER_CHANGED');
  return { action, fields };
}

export function parseMethod(script: string): string {
  if (/_AN_(?:hardwareid_on|clientsecurity_on)\s*=\s*true/.test(script)) throw new AppError('CHALLENGE_REQUIRED');
  const match = /\bvar\s+_AN_aaa_method\s*=\s*(\[[\s\S]*?\]);/.exec(script);
  if (!match) throw new AppError('PROVIDER_CHANGED');
  let methods: { name: string; authtype: number; multiauth: boolean }[];
  try { methods = JSON.parse(match[1]); } catch { throw new AppError('PROVIDER_CHANGED'); }
  if (!Array.isArray(methods) || methods.length !== 1 || methods[0].authtype !== 0 || methods[0].multiauth ||
    typeof methods[0].name !== 'string') throw new AppError('CHALLENGE_REQUIRED');
  return methods[0].name;
}

export function isLogin(url: string, html = ''): boolean {
  return /\/localhost\/(?:login(?:\/|$)|cookietest)/.test(new URL(url).pathname) || /id=["']loginForm["']/.test(html);
}

export class NvtProvider implements Backend {
  private authenticated = false;
  private generation = 0;
  private abort?: AbortController;
  private lastResolution = { channel: '', stage: '', error: '', host: '' };
  async diagnostics(): Promise<object> { return { resolution: { ...this.lastResolution } }; }
  constructor(private transport: Transport = new GatewayTransport()) {}

  private async get(url: string, signal?: AbortSignal) {
    const response = await this.transport.request(url, { signal });
    if (response.status === 503 || response.status === 429) throw new AppError('CAPACITY');
    if (response.status >= 400) throw new AppError('NETWORK');
    return response;
  }

  async status(): Promise<Status> {
    if (!this.authenticated) return { authenticated: false };
    const epoch = this.generation;
    const response = await this.get(WELCOME);
    const valid = !isLogin(response.url, response.body.toString()) && new URL(response.url).pathname === new URL(WELCOME).pathname;
    if (epoch !== this.generation) throw new AppError('CANCELLED');
    this.authenticated = valid;
    return { authenticated: valid };
  }

  async login(input: Credentials): Promise<Status> {
    const credentials = validateCredentials(input);
    const epoch = ++this.generation;
    this.abort?.abort();
    const abort = this.abort = new AbortController();
    this.authenticated = false;
    this.transport.clear();
    try {
      const page = await this.get(GATEWAY + '/', abort.signal);
      const form = parseLoginForm(page.body.toString(), page.url);
      const config = await this.get(CONFIG, abort.signal);
      const method = parseMethod(config.body.toString());
      const fields = new URLSearchParams({ ...form.fields, uname: credentials.email, pwd: credentials.password, pwd1: '', pwd2: '', method });
      // The inspected form posts normally. Its unbound before_login helper is not a refresh or encryption API.
      const response = await this.transport.request(form.action, { method: 'POST', body: fields.toString(), referer: page.url, signal: abort.signal });
      if (epoch !== this.generation) throw new AppError('CANCELLED');
      if ([429, 503].includes(response.status)) throw new AppError('CAPACITY');
      if (isLogin(response.url, response.body.toString())) throw new AppError('INVALID_CREDENTIALS');
      if (response.status >= 400) throw new AppError('NETWORK');
      const welcome = await this.get(WELCOME, abort.signal);
      if (epoch !== this.generation) throw new AppError('CANCELLED');
      if (isLogin(welcome.url, welcome.body.toString())) throw new AppError('INVALID_CREDENTIALS');
      if (new URL(welcome.url).pathname !== new URL(WELCOME).pathname) throw new AppError('CHALLENGE_REQUIRED');
      this.authenticated = true;
      return { authenticated: true };
    } catch (error) {
      if (epoch === this.generation) this.transport.clear();
      throw error;
    }
  }

  async channels() {
    if (!this.authenticated) throw new AppError('AUTH_REQUIRED');
    try {
      const catalog = await this.get(CATALOG);
      if (isLogin(catalog.url, catalog.body.toString())) throw new AppError('AUTH_REQUIRED');
      return parseChannels(catalog.body.toString());
    } catch (error) {
      if (error instanceof AppError && error.code === 'AUTH_REQUIRED') throw error;
      // Programme metadata is optional. The seven base channels remain selectable during a catalogue outage.
      return CHANNELS.map(({ id, name, description }) => ({ id, name, description }));
    }
  }

  async resolve(id: string): Promise<Playback> {
    const channel = [...CHANNELS, ...EVENT_CHANNELS].find(item => item.id === id);
    if (!channel) throw new AppError('INVALID_REQUEST');
    if (!this.authenticated) throw new AppError('AUTH_REQUIRED');
    const epoch = this.generation;
    this.lastResolution = { channel: id, stage: 'page', error: '', host: '' };
    try {
      const pageUrl = `${GATEWAY}/prx/000/https/m4sport.hu/elo/${channel.streamId}`;
      const response = await this.get(pageUrl);
      const html = response.body.toString();
      if (isLogin(response.url, html)) { this.authenticated = false; throw new AppError('AUTH_REQUIRED'); }
      let source = extractMedia(html, response.url);
      if (!source) {
        this.lastResolution.stage = 'player-setup';
        const finalPage = new URL(response.url);
        const upstream = /^\/prx\/000\/(https?)\/([^/]+)(\/.*)$/.exec(finalPage.pathname);
        if (!upstream) throw new AppError('PROVIDER_CHANGED');
        const sourceUrl = `${upstream[1]}://${upstream[2]}${upstream[3]}${finalPage.search}`;
        const playerUrl = playerRequest(html, channel.streamId, sourceUrl);
        this.lastResolution.stage = 'player-response';
        const player = await this.transport.request(playerUrl, { referer: response.url });
        if (isLogin(player.url, player.body.toString())) { this.authenticated = false; throw new AppError('AUTH_REQUIRED'); }
        if (player.status >= 400) throw new AppError('NETWORK');
        this.lastResolution.stage = 'media-source';
        source = extractMedia(player.body.toString(), player.url);
      }
      if (epoch !== this.generation) throw new AppError('CANCELLED');
      if (!source) throw new AppError('UNSUPPORTED_MEDIA');
      this.lastResolution.stage = 'complete';
      return { url: source, mime: 'application/vnd.apple.mpegurl' };
    } catch (error) {
      this.lastResolution.error = publicError(error);
      if (error instanceof AppError && error.diagnosticHost) this.lastResolution.host = error.diagnosticHost;
      throw error;
    }
  }

  async media(url: string, signal?: AbortSignal) {
    if (!this.authenticated) throw new AppError('AUTH_REQUIRED');
    const epoch = this.generation;
    const response = await this.transport.request(gatewayUrl(url), { referer: PLAYER_PAGE, signal, maxBytes: 16 * 1024 * 1024 });
    if (epoch !== this.generation) throw new AppError('CANCELLED');
    if (isLogin(response.url) || response.status === 401 || response.status === 403) {
      this.authenticated = false; throw new AppError('AUTH_REQUIRED');
    }
    if (response.status >= 400) throw new AppError('NETWORK');
    if (/text\/html/i.test(String(response.headers['content-type']))) throw new AppError('AUTH_REQUIRED');
    return response;
  }

  async logout(): Promise<{ remoteConfirmed: boolean }> {
    ++this.generation;
    this.abort?.abort();
    this.authenticated = false;
    // The welcome page exposes a JavaScript logout link, not yet a verified logout endpoint.
    this.transport.clear();
    return { remoteConfirmed: false };
  }
}
