import { build } from 'esbuild';
import { mkdir, cp, writeFile, readFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';

await mkdir('dist/tv', { recursive: true });
await mkdir('dist/service', { recursive: true });
await cp('apps/tv', 'dist/tv', { recursive: true });
await cp('services/nvt', 'dist/service', { recursive: true });
const results = await Promise.all([
  build({ entryPoints: ['src/tv/main.ts'], outfile: 'dist/tv/app.js', bundle: true, target: 'chrome120', format: 'iife', minify: true, metafile: true }),
  build({ entryPoints: ['src/service/main.ts'], outfile: 'dist/service/main.js', bundle: true, platform: 'node', target: 'node16', format: 'cjs', external: ['webos-service'], metafile: true }),
  build({ entryPoints: ['src/dev/server.ts'], outfile: 'dist/dev/server.cjs', bundle: true, platform: 'node', target: 'node22', format: 'cjs' }),
  build({ entryPoints: ['src/tools/probe.ts'], outfile: 'dist/tools/probe.cjs', bundle: true, platform: 'node', target: 'node22', format: 'cjs' }),
  build({ entryPoints: { provider: 'src/provider/nvt.ts', relay: 'src/provider/relay.ts', transport: 'src/provider/transport.ts', account: 'src/tv/account.ts', dispatch: 'src/service/dispatch.ts', types: 'src/shared/types.ts' }, outdir: 'dist/test', bundle: true, platform: 'node', target: 'node22', format: 'cjs', outExtension: { '.js': '.cjs' } }),
  build({ entryPoints: ['src/tv/vault.ts'], outfile: 'dist/test/vault.js', bundle: true, target: 'chrome120', format: 'esm' }),
]);

for (const [index, output] of [[0, 'dist/tv'], [1, 'dist/service']]) {
  const packages = new Set(Object.keys(results[index].metafile.inputs).flatMap(input => {
    const match = /^(node_modules\/(?:@[^/]+\/)?[^/]+)\//.exec(input);
    return match ? [match[1]] : [];
  }));
  const notices = [];
  for (const directory of [...packages].sort()) {
    const info = JSON.parse(await readFile(`${directory}/package.json`, 'utf8'));
    let license = '';
    for (const file of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENSE-MIT.txt', 'COPYING']) {
      try { license = await readFile(`${directory}/${file}`, 'utf8'); break; } catch { /* Try the package's next conventional license filename. */ }
    }
    if (!license) throw new Error(`Missing third-party license: ${info.name}`);
    notices.push(`${info.name} ${info.version}\n${license}`);
  }
  await writeFile(`${output}/THIRD_PARTY_NOTICES.txt`, notices.join('\n\n--------------------\n\n'));
}

// Original geometric N icon, drawn from rectangles, with no third-party artwork.
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type), length = Buffer.alloc(4), crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}
function icon(size) {
  const pixels = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const px = x / size, py = y / size;
    const n = py > .23 && py < .77 && ((px > .23 && px < .34) || (px > .66 && px < .77) || Math.abs(px - py) < .07);
    const offset = y * (size * 4 + 1) + 1 + x * 4;
    pixels.set(n ? [15, 29, 21, 255] : [195, 237, 138, 255], offset);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}
await writeFile('dist/tv/icon.png', icon(80));
await writeFile('dist/tv/largeicon.png', icon(130));
console.log('Built TV app, bundled service, local preview, and test modules.');
