import { build } from 'esbuild';
import { mkdir, cp, writeFile, readFile } from 'node:fs/promises';

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
  build({ entryPoints: ['src/tv/player.ts'], outfile: 'dist/test/player.js', bundle: true, target: 'chrome120', format: 'esm' }),
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

console.log('Built TV app, bundled service, local preview, and test modules.');
