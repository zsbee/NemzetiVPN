import './build.mjs';
import { build } from 'esbuild';
import { cp, readFile, appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

// Separate output and entry points: the standard webOS 25 build is untouched.
await mkdir('dist/cx', { recursive: true });
for (const directory of ['tv', 'service', 'dev']) await cp(`dist/${directory}`, `dist/cx/${directory}`, { recursive: true });
const legacyBrowser = {
  name: 'cx-vault',
  setup(plugin) {
    plugin.onResolve({ filter: /^\.\/vault$/ }, args => {
      if (args.importer === path.resolve('src/tv/main.ts')) return { path: path.resolve('src/cx/vault.ts') };
    });
  },
};
const legacyCore = {
  name: 'cx-node8-core',
  setup(plugin) {
    plugin.onResolve({ filter: /^node:/ }, args => {
      const name = args.path.slice(5);
      if (['http', 'https', 'zlib'].includes(name)) return { path: path.resolve(`src/cx/${name}.ts`) };
      return { path: name, external: true };
    });
  },
};
await Promise.all([
  build({ entryPoints: ['src/cx/browser.ts'], outfile: 'dist/cx/tv/app.js', bundle: true, target: 'chrome68', format: 'iife', minify: true, plugins: [legacyBrowser] }),
  build({ entryPoints: ['src/cx/service.ts'], outfile: 'dist/cx/service/main.js', bundle: true, platform: 'node', target: 'node8.12', format: 'cjs', external: ['webos-service'], plugins: [legacyCore] }),
  build({ entryPoints: ['src/cx/test-entry.ts'], outfile: 'dist/cx/test/backend.cjs', bundle: true, platform: 'node', target: 'node8.12', format: 'cjs', plugins: [legacyCore] }),
]);
await appendFile('dist/cx/tv/app.css', '\n' + await readFile('src/cx/app.css', 'utf8'));
console.log('Built experimental CX package sources in dist/cx; standard dist/tv and dist/service unchanged.');
