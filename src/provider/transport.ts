import https from 'node:https';
import zlib from 'node:zlib';
import { CookieJar } from 'tough-cookie';
import { AppError } from '../shared/types';

export const GATEWAY = 'https://nvpn.nvt.gov.hu';
const UPSTREAM_HOSTS = new Set(['m4sport.hu', 'hirado.hu', 'player.mediaklikk.hu', 'mediaklikk.hu', 'cdn.connectmedia.hu']);
export const allowedUpstream = (host: string) => UPSTREAM_HOSTS.has(host) || /^c\d+-node\d+-cdn\.connectmedia\.hu$/.test(host);
export const USER_AGENT = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.270 Safari/537.36 WebAppManager';
export interface Response { url: string; status: number; headers: Record<string, string | string[] | undefined>; body: Buffer }
export interface RequestOptions { method?: 'GET' | 'POST'; body?: string; referer?: string; signal?: AbortSignal; maxBytes?: number }
export interface Transport { request(url: string, options?: RequestOptions): Promise<Response>; clear(): void }

// Only the gateway receives network requests. Rewritten upstream hosts are separately checked.
export function gatewayUrl(input: string, base = GATEWAY + '/'): string {
  const url = new URL(input, base);
  if (url.origin !== GATEWAY || url.username || url.password || url.hash) throw new AppError('PROVIDER_CHANGED');
  if (url.pathname.startsWith('/prx/')) {
    const match = /^\/prx\/000\/(https?)\/([^/]+)(?:\/|$)/.exec(url.pathname);
    if (!match || !(match[2] === 'localhost' || allowedUpstream(match[2]))) throw new AppError('PROVIDER_CHANGED', match?.[2]?.replace(/[^a-z0-9.-]/gi, '').slice(0, 253));
  } else if (url.pathname !== '/') throw new AppError('PROVIDER_CHANGED');
  return url.href;
}

export function proxied(input: string): string {
  const url = new URL(input);
  if (url.origin === GATEWAY) return gatewayUrl(input);
  if (url.protocol !== 'https:' || !allowedUpstream(url.hostname) || url.port || url.username || url.password)
    throw new AppError('PROVIDER_CHANGED', url.hostname);
  return gatewayUrl(`${GATEWAY}/prx/000/https/${url.hostname}${url.pathname}${url.search}`);
}

export class GatewayTransport implements Transport {
  private jar = new CookieJar();
  clear(): void { this.jar = new CookieJar(); }

  async request(input: string, options: RequestOptions = {}): Promise<Response> {
    const jar = this.jar;
    let url = gatewayUrl(input);
    let method = options.method ?? 'GET';
    let body = options.body;
    for (let redirects = 0; redirects <= 8; redirects++) {
      const cookie = await jar.getCookieString(url);
      const result = await this.once(url, method, body, cookie, options);
      const setCookie = result.headers['set-cookie'];
      for (const value of typeof setCookie === 'string' ? [setCookie] : setCookie ?? []) await jar.setCookie(value, url);
      if (![301, 302, 303, 307, 308].includes(result.status)) return result;
      const location = result.headers.location;
      if (typeof location !== 'string') throw new AppError('PROVIDER_CHANGED');
      // Validate before following, including 307/308, so credentials never reach another origin.
      url = gatewayUrl(location, url);
      if (result.status === 303 || ((result.status === 301 || result.status === 302) && method === 'POST')) {
        method = 'GET'; body = undefined;
      }
    }
    throw new AppError('PROVIDER_CHANGED');
  }

  private once(url: string, method: string, body: string | undefined, cookie: string, options: RequestOptions): Promise<Response> {
    return new Promise((resolve, reject) => {
      const headers: Record<string, string | number> = {
        'User-Agent': USER_AGENT, 'Accept': '*/*', 'Accept-Encoding': 'gzip, deflate', Cookie: cookie,
      };
      if (options.referer) headers.Referer = gatewayUrl(options.referer);
      if (body !== undefined) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        headers['Content-Length'] = Buffer.byteLength(body);
        headers.Origin = GATEWAY;
      }
      const req = https.request(url, { method, headers, signal: options.signal }, response => {
        const maxBytes = options.maxBytes ?? 5 * 1024 * 1024;
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) { req.destroy(); reject(new AppError('PROVIDER_CHANGED')); }
          else chunks.push(chunk);
        });
        response.on('error', () => reject(new AppError('NETWORK')));
        response.on('end', () => {
          const compressed = Buffer.concat(chunks);
          const finish = (error: Error | null, decoded = compressed) => {
            if (error || decoded.length > maxBytes) return reject(new AppError('PROVIDER_CHANGED'));
            resolve({ url, status: response.statusCode ?? 0, headers: response.headers, body: decoded });
          };
          if (response.headers['content-encoding'] === 'gzip') zlib.gunzip(compressed, { maxOutputLength: maxBytes }, finish);
          else if (response.headers['content-encoding'] === 'deflate') zlib.inflate(compressed, { maxOutputLength: maxBytes }, finish);
          else finish(null);
        });
      });
      req.setTimeout(20000, () => req.destroy());
      req.on('error', () => reject(new AppError(options.signal?.aborted ? 'CANCELLED' : 'NETWORK')));
      req.end(body);
    });
  }
}
