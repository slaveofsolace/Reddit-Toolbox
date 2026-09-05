import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { sourceOrder } from './source-order.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = await readFile(path.join(root, 'userscripts/reddit-toolbox.user.js'), 'utf8');
const metadata = await readFile(path.join(root, 'src/userscript-metadata.txt'), 'utf8');
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const lockfile = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
if (lockfile.version !== pkg.version || lockfile.packages[''].version !== pkg.version) throw new Error('Package lock version differs from the package.');
const sections = await Promise.all(sourceOrder.map(async (file) => `\n/* ${file} */\n${(await readFile(path.join(root, file), 'utf8')).trim()}\n`));
if (script !== `${metadata.trim()}\n${sections.join('')}\n`) throw new Error('The generated userscript differs from the ordered source.');
const checksum = await readFile(path.join(root, 'SHA256SUMS.txt'), 'utf8');
if (checksum !== `${createHash('sha256').update(script).digest('hex')}  userscripts/reddit-toolbox.user.js\n`) throw new Error('The userscript checksum does not match.');
if (!metadata.includes(`@version      ${pkg.version}\n`)) throw new Error('Package and userscript versions differ.');
const required = [
  '// ==UserScript==',
  'class RedditSessionClient',
  'class RedditOAuthClient',
  '@grant        GM_xmlhttpRequest',
  'class BatchRunner',
  'class RedditRemovalService',
  'class RedditToolboxApp',
  'One confirmation starts the entire selected batch',
  'Run entire batch',
  'toolbox.App.start()'
];

for (const marker of required) {
  if (!script.includes(marker)) throw new Error(`Built userscript is missing: ${marker}`);
}
const parsed = new vm.Script(script, { filename: 'reddit-toolbox.user.js' });
const namespace = {};
parsed.runInNewContext(namespace);
if (namespace.RedditToolbox.version !== pkg.version || namespace.ToolboxFamily.version !== pkg.version) throw new Error('Runtime version differs from the package.');
if (/\b(?:eval|new Function)\s*\(/.test(script)) {
  throw new Error('Built userscript contains dynamic code evaluation.');
}
console.log('Userscript integrity checks passed.');
