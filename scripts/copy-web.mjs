import { cp, mkdir } from 'node:fs/promises';
await mkdir(new URL('../dist/web/', import.meta.url), { recursive: true });
await cp(new URL('../src/web/', import.meta.url), new URL('../dist/web/', import.meta.url), { recursive: true });
