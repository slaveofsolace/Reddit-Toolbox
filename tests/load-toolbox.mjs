import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { sourceOrder } from '../scripts/source-order.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadToolbox(options = {}) {
  const context = vm.createContext({
    console,
    URL,
    URLSearchParams,
    Blob,
    Date,
    Math,
    JSON,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Map,
    Set,
    RegExp,
    Error,
    TypeError,
    RangeError,
    Promise,
    Uint32Array,
    setTimeout,
    clearTimeout,
    crypto: webcrypto,
    ...options.globals
  });

  const files = options.files || sourceOrder.filter((file) => !file.startsWith('src/ui/') && file !== 'src/main.js');
  for (const file of files) {
    const source = readFileSync(path.join(root, file), 'utf8');
    vm.runInContext(source, context, { filename: file });
  }
  return context.RedditToolbox;
}
