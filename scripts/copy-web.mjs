import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
const destination = new URL('../dist/web/', import.meta.url);
await mkdir(destination, { recursive: true });
await cp(new URL('../src/web/', import.meta.url), destination, { recursive: true });
// Our browser modules use one-line imports and named declaration exports only.
// Inline their explicitly ordered sources so file:// reports need no module fetches.
const modules = ['treemap', 'dom', 'tree', 'metrics', 'detail', 'map', 'inventory', 'chrome', 'report'];
const sources = await Promise.all(modules.map(name => readFile(new URL(`../src/web/${name}.js`, import.meta.url), 'utf8')));
const bundle = sources.map(source => source.replace(/^import .*;\n/gm, '').replace(/^export /gm, '')).join('\n');
await writeFile(new URL('report.js', destination), `(() => {\n'use strict';\n${bundle}\n})();\n`);
