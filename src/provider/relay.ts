import http from 'node:http';
import crypto from 'node:crypto';
import { AppError, type Backend, type Credentials, type Playback } from '../shared/types';
import { NvtProvider } from './nvt';
import { GATEWAY, allowedUpstream, gatewayUrl, proxied, type Response } from './transport';

export function mediaUri(raw: string, base: string): string {
  const match = /^\/prx\/000\/(https?)\/([^/]+)(\/.*)$/.exec(new URL(base).pathname);
  if (!match || !allowedUpstream(match[2])) throw new AppError('PROVIDER_CHANGED');
  const originalBase = `${match[1]}://${match[2]}${match[3]}${new URL(base).search}`;
  const url = raw.startsWith('/prx/') ? gatewayUrl(raw, GATEWAY) : proxied(new URL(raw, originalBase).href);
  const parsed = /^\/prx\/000\/(?:https?)\/([^/]+)\//.exec(new URL(url).pathname);
  if (!parsed || !allowedUpstream(parsed[1])) throw new AppError('PROVIDER_CHANGED');
  return url;
}

export function rewritePlaylist(text: string, register: (uri: string) => string): string {
  if (!text.trimStart().startsWith('#EXTM3U')) throw new AppError('UNSUPPORTED_MEDIA');
  // DRM licenses need a separate integration; AES-128 HLS keys remain normal authenticated resources.
  if (/KEYFORMAT\s*=\s*"(?!identity")/i.test(text) || /#EXT-X-KEY:.*METHOD=SAMPLE-AES/i.test(text)) throw new AppError('UNSUPPORTED_MEDIA');
  return text.split(/\r?\n/).map(line => {
    if (!line.trim()) return line;
    if (line.startsWith('#')) return line.replace(/\bURI="([^"]+)"/g, (_, uri: string) => `URI="${register(uri)}"`);
    return register(line.trim());
  }).join('\n');
}

export class MediaRelay {
  private server?: http.Server;
  private resources = new Map<string, string>();
  private active = new Set<AbortController>();
  private connections = new Set<import('node:net').Socket>();
  private generation = 0;
  private token = '';
  private port = 0;
  private playerOrigin?: string;
  constructor(private fetchMedia: (url: string, signal: AbortSignal) => Promise<Response>, playerOrigin?: string) {
    this.playerOrigin = playerOrigin;
  }

  async start(source: string): Promise<string> {
    this.stop();
    const epoch = this.generation;
    this.token = crypto.randomBytes(24).toString('hex');
    this.server = http.createServer((request, response) => { void this.handle(request, response, epoch); });
    this.server.on('connection', socket => { this.connections.add(socket); socket.on('close', () => this.connections.delete(socket)); });
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', () => reject(new AppError('NETWORK')));
      this.server!.listen(0, '127.0.0.1', resolve);
    });
    if (epoch !== this.generation) throw new AppError('CANCELLED');
    const address = this.server.address();
    if (!address || typeof address === 'string') throw new AppError('NETWORK');
    this.port = address.port;
    return this.register(mediaUri(source, source));
  }

  private register(url: string): string {
    const id = crypto.createHash('sha256').update(url).digest('hex').slice(0, 24);
    this.resources.delete(id); this.resources.set(id, url);
    if (this.resources.size > 2048) this.resources.delete(this.resources.keys().next().value!);
    return `http://127.0.0.1:${this.port}/${this.token}/${id}`;
  }

  private async handle(request: http.IncomingMessage, response: http.ServerResponse, epoch: number): Promise<void> {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const origin = request.headers.origin;
    if (origin && origin !== 'null' && origin !== this.playerOrigin) { response.writeHead(403).end(); return; }
    if (origin && (origin === 'null' || origin === this.playerOrigin)) response.setHeader('Access-Control-Allow-Origin', origin);
    const parts = request.url?.split('/') ?? [];
    if (request.method !== 'GET' || request.headers.host !== `127.0.0.1:${this.port}` || parts.length !== 3 || parts[1] !== this.token) {
      response.writeHead(403).end(); return;
    }
    const url = this.resources.get(parts[2]);
    if (!url) { response.writeHead(404).end(); return; }
    if (this.active.size >= 4) { response.writeHead(503).end(); return; }
    const abort = new AbortController(); this.active.add(abort);
    response.on('close', () => abort.abort());
    try {
      const result = await this.fetchMedia(url, abort.signal);
      if (epoch !== this.generation || abort.signal.aborted) throw new AppError('CANCELLED');
      const mime = String(result.headers['content-type'] ?? 'application/octet-stream');
      const playlist = new URL(result.url).pathname.includes('.m3u8');
      if (playlist) {
        const text = rewritePlaylist(result.body.toString(), uri => this.register(mediaUri(uri, result.url)));
        response.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        response.end(text);
      } else {
        if (/text\/html|javascript/i.test(mime)) throw new AppError('UNSUPPORTED_MEDIA');
        response.setHeader('Content-Type', mime);
        response.setHeader('Accept-Ranges', 'bytes');
        if (request.headers.range) {
          const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range);
          if (!range) { response.writeHead(416).end(); return; }
          const start = Number(range[1]);
          const end = range[2] ? Math.min(Number(range[2]), result.body.length - 1) : result.body.length - 1;
          if (start > end || start >= result.body.length) { response.writeHead(416).end(); return; }
          response.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${result.body.length}` });
          response.end(result.body.subarray(start, end + 1)); return;
        }
        response.end(result.body);
      }
    } catch {
      if (!response.headersSent) response.writeHead(502);
      response.end();
    } finally { this.active.delete(abort); }
  }

  stop(): void {
    ++this.generation;
    for (const abort of this.active) abort.abort();
    this.active.clear();
    this.server?.close(); this.server = undefined;
    for (const socket of this.connections) socket.destroy();
    this.connections.clear(); this.resources.clear(); this.token = ''; this.port = 0;
  }
}

export class MediaBackend implements Backend {
  private relay: MediaRelay;
  constructor(private provider = new NvtProvider(), playerOrigin?: string) {
    this.relay = new MediaRelay((url, signal) => provider.media(url, signal), playerOrigin);
  }
  status() { return this.provider.status(); }
  login(c: Credentials) { this.relay.stop(); return this.provider.login(c); }
  channels() { return this.provider.channels(); }
  async resolve(id: string): Promise<Playback> {
    const source = await this.provider.resolve(id);
    return { url: await this.relay.start(source.url), mime: source.mime };
  }
  logout() { this.relay.stop(); return this.provider.logout(); }
  async stop(): Promise<void> { this.relay.stop(); }
}
