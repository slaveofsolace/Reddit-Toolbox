import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { sourceOrder } from './source-order.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const metadata = await readFile(path.join(root, 'src/userscript-metadata.txt'), 'utf8');
const sources = await Promise.all(sourceOrder.map(async (relativePath) => {
  const content = await readFile(path.join(root, relativePath), 'utf8');
  return `\n/* ${relativePath} */\n${content.trim()}\n`;
}));

const output = `${metadata.trim()}\n${sources.join('')}\n`;
const outputPath = path.join(root, 'userscripts/reddit-toolbox.user.js');
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, output, 'utf8');
await writeFile(path.join(root, 'SHA256SUMS.txt'), `${createHash('sha256').update(output).digest('hex')}  userscripts/reddit-toolbox.user.js\n`, 'utf8');
console.log(`Built ${path.relative(root, outputPath)} (${Buffer.byteLength(output)} bytes)`);
