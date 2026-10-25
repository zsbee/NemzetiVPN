import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { MediaBackend } from '../provider/relay';
import { dispatch } from '../service/dispatch';

const port = Number(process.env.NVT_DEV_PORT ?? 4390);
const origin = `http://127.0.0.1:${port}`;
const tvRoot = path.resolve(__dirname, '../tv');
const provider = new MediaBackend(undefined, origin);
const files: Record<string, [string, string]> = {
  '/': ['index.html', 'text/html; charset=utf-8'], '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'application/javascript; charset=utf-8'], '/app.css': ['app.css', 'text/css; charset=utf-8'],
  '/assets/brand/crown-broadcast.png': ['assets/brand/crown-broadcast.png', 'image/png'],
  '/icon.png': ['icon.png', 'image/png'], '/favicon.ico': ['icon.png', 'image/png'],
};
for (const id of ['m1', 'm2', 'm4', 'm4plus', 'm5', 'duna', 'dunaworld']) {
  files[`/assets/logos/${id}.png`] = [`assets/logos/${id}.png`, 'image/png'];
}
let lastLogin = 0;

const server = http.createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Frame-Options', 'DENY');
  if (request.headers.host !== `127.0.0.1:${port}`) { response.writeHead(403).end(); return; }
  const pathname = new URL(request.url ?? '/', origin).pathname;
  if (request.method === 'GET' && files[pathname]) {
    try {
      const [file, type] = files[pathname];
      response.setHeader('Content-Type', type);
      response.end(await readFile(path.join(tvRoot, file)));
    } catch { response.writeHead(404).end(); }
    return;
  }
  if (request.method !== 'POST' || !pathname.startsWith('/api/') || request.headers.origin !== origin ||
    request.headers['content-type'] !== 'application/json') { response.writeHead(403).end(); return; }
  let bytes = 0;
  const chunks: Buffer[] = [];
  try {
    for await (const chunk of request) {
      bytes += chunk.length;
      if (bytes > 8192) { response.writeHead(413).end(); return; }
      chunks.push(chunk);
    }
    const method = pathname.slice(5);
    if (method === 'login') {
      if (Date.now() - lastLogin < 1500) { response.writeHead(429).end(); return; }
      lastLogin = Date.now();
    }
    const data = JSON.parse(Buffer.concat(chunks).toString());
    const result = await dispatch(provider, method, data);
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(result));
  } catch { response.writeHead(400).end(); }
});
server.listen(port, '127.0.0.1', () => console.log(`NemzetiVPN preview: ${origin}`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { void provider.logout(); server.close(() => process.exit(0)); });
