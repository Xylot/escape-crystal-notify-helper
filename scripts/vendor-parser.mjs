import { createRequire } from 'node:module';
import { mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
const require = createRequire(import.meta.url);
const packageRoot = path.dirname(require.resolve('wikiparser-node/package.json'));
await mkdir('public/vendor', { recursive:true });
// The highlighting-only bundle omits AST selectors used by all wiki adapters.
await copyFile(path.join(packageRoot,'bundle/bundle-lsp.min.js'),'public/vendor/wikiparser.js');
await copyFile(path.join(packageRoot,'LICENSE'),'public/vendor/WikiParser-LICENSE.txt');
