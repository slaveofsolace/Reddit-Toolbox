import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = await readFile(path.join(root, 'userscripts/reddit-toolbox.user.js'), 'utf8');
const required = [
  '// ==UserScript==',
  '@version      1.0.0-rc.1',
  'class RedditSessionClient',
  'class ControlledRunner',
  'class RedditToolboxApp',
  'toolbox.App.start()'
];

for (const marker of required) {
  if (!script.includes(marker)) throw new Error(`Built userscript is missing: ${marker}`);
}
new vm.Script(script, { filename: 'reddit-toolbox.user.js' });
if (/\b(?:eval|new Function)\s*\(/.test(script)) {
  throw new Error('Built userscript contains dynamic code evaluation.');
}
console.log('Userscript integrity checks passed.');
