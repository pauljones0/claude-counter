import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { zipSync } from 'fflate';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
process.chdir(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const target = process.argv[2] || 'all';
if (!['all', 'firefox', 'chrome'].includes(target)) throw new Error('Usage: node scripts/build.mjs [all|firefox|chrome]');
await build({ entryPoints: ['gpt-tokenizer/encoding/o200k_base'], outfile: 'src/vendor/o200k_base.js', bundle: true, format: 'iife', globalName: 'GPTTokenizer_o200k_base', minify: false, legalComments: 'inline', target: ['firefox142', 'chrome120'] });
const files = ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'PRIVACY.md'];
async function walk(dir) {
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) await walk(path); else files.push(path);
  }
}
await walk('src'); await walk('icons');
await mkdir('dist', { recursive: true });
const checksums = [];
for (const browser of target === 'all' ? ['firefox', 'chrome'] : [target]) {
  const manifest = JSON.parse(await readFile(`manifest_${browser}.json`, 'utf8'));
  if (manifest.version !== pkg.version) throw new Error(`Version mismatch in ${browser} manifest`);
  // Only these validated generated staging folders are replaced on a rebuild.
  await rm(`dist/${browser}`, { recursive: true, force: true });
  const entries = {};
  for (const path of files) entries[path] = new Uint8Array(await readFile(path));
  entries['manifest.json'] = new TextEncoder().encode(JSON.stringify(manifest, null, 2) + '\n');
  for (const [path, bytes] of Object.entries(entries)) {
    await mkdir(dirname(`dist/${browser}/${path}`), { recursive: true });
    await writeFile(`dist/${browser}/${path}`, bytes);
  }
  const archive = zipSync(Object.fromEntries(Object.entries(entries).sort().map(([path, bytes]) => [path, [bytes, { mtime: new Date(2020, 0, 1) }]])), { level: 9 });
  // Unsigned Firefox archives are upload artifacts, not installable signed XPIs.
  const name = `claude-counter-${pkg.version}-${browser}.zip`;
  await writeFile(`dist/${name}`, archive);
  checksums.push(`${createHash('sha256').update(archive).digest('hex')}  ${name}`);
  console.log(name);
}
await writeFile('dist/SHA256SUMS', checksums.join('\n') + '\n');
// Generate the userscript from the same modules instead of maintaining a second app.
const manifest = JSON.parse(await readFile('manifest_firefox.json', 'utf8'));
const modules = manifest.content_scripts[0].js;
const header = `// ==UserScript==\n// @name Claude Counter\n// @namespace https://github.com/pauljones0/claude-counter\n// @version ${pkg.version}\n// @description Approximate tokens and live Claude usage\n// @match https://claude.ai/*\n// @grant none\n// @run-at document-idle\n// @license MIT\n// ==/UserScript==\n`;
const styles = JSON.stringify(await readFile('src/styles.css', 'utf8'));
const bridge = await readFile('src/injected/bridge.js', 'utf8');
const source = header + '\n' + bridge + '\n' + `(() => { const style = document.createElement('style'); style.textContent = ${styles}; document.head.append(style); })();\n` + (await Promise.all(modules.map(path => readFile(path, 'utf8')))).join('\n');
await writeFile('userscript/claude-counter.user.js', source);
const sourcePaths = ['README.md', 'LICENSE', 'PRIVACY.md', 'THIRD_PARTY_NOTICES.md', 'package.json', 'package-lock.json', 'build.sh', 'manifest.json', 'manifest_firefox.json', 'manifest_chrome.json'];
async function sourceTree(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) await sourceTree(path);
    else if (!path.startsWith('research/') || path.endsWith('.md')) sourcePaths.push(path);
  }
}
for (const dir of ['src', 'icons', 'scripts', 'tests', 'store', 'userscript', 'research', '.github']) await sourceTree(dir);
const sourceEntries = {};
for (const path of sourcePaths.sort()) sourceEntries[path] = [new Uint8Array(await readFile(path)), { mtime: new Date(2020, 0, 1) }];
const sourceArchive = zipSync(sourceEntries, { level: 9 });
const sourceName = `claude-counter-${pkg.version}-source.zip`;
await writeFile(`dist/${sourceName}`, sourceArchive);
checksums.push(`${createHash('sha256').update(sourceArchive).digest('hex')}  ${sourceName}`);
await writeFile('dist/SHA256SUMS', checksums.join('\n') + '\n');
console.log(sourceName);
