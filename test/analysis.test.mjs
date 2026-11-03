import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { analyze, analyzeSource } from '../dist/index.js';

test('nested callbacks and default parameters belong to their own functions', () => {
  const file = analyzeSource(`export function outer(values: number[], flag = true) {
    if (flag && values.length) return values.map(value => value > 0 ? value : -value);
    return [];
  }`, 'sample.ts');
  const [outer, callback] = file.units;
  assert.equal(outer.name, 'outer');
  assert.equal(outer.complexity, 4); // baseline + default parameter + if + &&
  assert.equal(outer.statements, 3); // if + its return + final return
  assert.equal(callback.complexity, 2);
  assert.equal(callback.statements, 1);
  assert.equal(file.units.length, 2);
});

test('switch cases, loops, catch, logical assignment and nullish branches', () => {
  const file = analyzeSource(`function work(value: number, fallback?: number) {
    for (let i = 0; i < value; i++) { if (i) continue; }
    try { switch (value) { case 1: return 1; case 2: return 2; default: break; } }
    catch { value ||= 1; }
    return fallback ?? value;
  }`, 'branches.ts');
  assert.equal(file.units[0].complexity, 8);
});

test('TSX, methods, accessors, constructors, empty functions, and module code', () => {
  const file = analyzeSource(`class Thing {
    constructor(readonly flag = true) { if (flag) console.log('x'); }
    get ok() { return this.flag; }
    set ok(flag: boolean) { if (flag) console.log(flag); }
    empty() {}
  }
  export const view = (flag: boolean) => <div>{flag ? 'yes' : 'no'}</div>;`, 'view.tsx');
  assert.equal(file.units.find(unit => unit.name === 'Thing.constructor').complexity, 3);
  assert.equal(file.units.find(unit => unit.name === 'Thing.get ok').complexity, 1);
  assert.equal(file.units.find(unit => unit.name === 'Thing.set ok').complexity, 2);
  assert.equal(file.units.find(unit => unit.name === 'Thing.empty').statements, 0);
  assert.equal(file.units.find(unit => unit.name === 'view').complexity, 2);
  assert.equal(file.units.find(unit => unit.kind === 'module').statements, 1);
});

test('types do not create executable branches and declaration files remain inspectable as unknown', () => {
  const file = analyzeSource('interface Shape { fn(): void }\ntype Choice<T> = T extends string ? 1 : 0;', 'types.ts');
  assert.equal(file.units.length, 1);
  assert.equal(file.units[0].kind, 'declarations');
  assert.equal(file.units[0].complexity, null);
  assert.equal(file.units[0].statements, 0);
});

test('ambient declarations are excluded even in ordinary TypeScript files', () => {
  const file = analyzeSource(`declare const environment: boolean;
    declare class External { field: string; method(flag?: boolean): void }
    declare namespace Vendor { const version: string; }
    export const local = (flag: boolean) => flag ? 1 : 0;`, 'ambient.ts');
  assert.equal(file.units.find(unit => unit.kind === 'module').statements, 1);
  assert.equal(file.units.find(unit => unit.name === 'local').complexity, 2);
  assert.equal(file.units.length, 2);
});

test('parse errors stop analysis instead of fabricating metrics', () => {
  assert.throws(() => analyzeSource('export function broken( {', 'broken.ts'), /broken.ts/);
});

test('tsconfig references, includes, exclusions, and declaration exclusion', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'panopticode-project-'));
  try {
    mkdirSync(path.join(root, 'app'));
    mkdirSync(path.join(root, 'dist'));
    writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({ files: [], references: [{ path: './app' }] }));
    writeFileSync(path.join(root, 'app/tsconfig.json'), JSON.stringify({ include: ['*.ts'], exclude: ['ignored.ts'] }));
    writeFileSync(path.join(root, 'app/main.ts'), 'export const inc = (n: number) => n + 1;');
    writeFileSync(path.join(root, 'app/ignored.ts'), 'const nope = 1;');
    writeFileSync(path.join(root, 'app/types.d.ts'), 'declare const thing: string;');
    writeFileSync(path.join(root, 'dist/generated.ts'), 'const generated = 1;');
    const report = analyze({ project: root });
    assert.deepEqual(report.files.map(file => file.path), ['app/main.ts']);
    assert.deepEqual(report.thresholds, [6, 10, 25]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('directory fallback includes mts/cts/tsx and excludes generated directories', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'panopticode-scan-'));
  try {
    for (const name of ['one.mts', 'two.cts', 'three.tsx']) writeFileSync(path.join(root, name), 'export const id = (x: number) => x;');
    mkdirSync(path.join(root, 'node_modules'));
    writeFileSync(path.join(root, 'node_modules/hidden.ts'), 'const nope = 1;');
    assert.equal(analyze({ project: root }).files.length, 3);
    assert.throws(() => analyze({ project: root, thresholds: [10, 6, 25] }), /thresholds/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
