import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { analyze, importCoverage, importEslint, renderHtml } from '../dist/index.js';
import { partition } from '../src/web/treemap.js';

const demo = path.resolve('examples/demo');

test('imports distinguish missing, zero, and measured coverage and lint', () => {
  const report = analyze({ project: demo });
  importCoverage(report, path.join(demo, 'coverage.json'), demo);
  importEslint(report, path.join(demo, 'eslint.json'), demo);
  const cart = report.files.find(file => file.path.endsWith('cart.ts'));
  assert.deepEqual(cart.coverage, { covered: 7, total: 9 });
  assert.deepEqual(cart.findings, []);
  assert.equal(report.files.find(file => file.path.endsWith('types.ts')).findings, null);
  assert.equal(report.files.find(file => file.path.endsWith('status.tsx')).coverage, null);
  assert.equal(report.files.find(file => file.path.endsWith('checkout.ts')).findings[0].rule, 'complexity');
});

test('ts-morph preserves the original demo analysis, coverage, and lint results', () => {
  const report = analyze({ project: demo });
  importCoverage(report, path.join(demo, 'coverage.json'), demo);
  importEslint(report, path.join(demo, 'eslint.json'), demo);
  const expected = JSON.parse(readFileSync(new URL('./fixtures/demo-analysis.json', import.meta.url), 'utf8'));
  const legacy = report.files.map(({ classes, measurements, ...file }) => ({ ...file,
    units: file.units.map(({ measurements, ...unit }) => unit) }));
  assert.deepEqual(legacy, expected);
});

test('coverage uses the maximum hit count for statements on the same line', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'panopticode-import-'));
  try {
    writeFileSync(path.join(root, 'code.ts'), 'export function one() { return 1; }\nexport function two() { return 2; }\n');
    writeFileSync(path.join(root, 'coverage.json'), JSON.stringify({ 'code.ts': {
      statementMap: { a: { start: { line: 1 } }, b: { start: { line: 1 } }, c: { start: { line: 2 } } },
      s: { a: 0, b: 2, c: 0 },
    } }));
    const report = analyze({ project: root });
    importCoverage(report, path.join(root, 'coverage.json'), root);
    assert.deepEqual(report.files[0].coverage, { covered: 1, total: 2 });
    assert.deepEqual(report.files[0].units[1].coverage, { covered: 0, total: 1 });
    assert.throws(() => importEslint(report, path.join(root, 'coverage.json'), root), /array/);
    writeFileSync(path.join(root, 'bad.json'), JSON.stringify({ 'code.ts': { lines: { pct: 100 } } }));
    assert.throws(() => importCoverage(report, path.join(root, 'bad.json'), root), /statementMap/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('unmatched report paths warn instead of silently appearing clean', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'panopticode-unmatched-'));
  try {
    const report = analyze({ project: demo });
    const filename = path.join(root, 'lint.json');
    writeFileSync(filename, JSON.stringify([{ filePath: '/different/checkout/code.ts', messages: [] }]));
    importEslint(report, filename, demo);
    assert.ok(report.warnings.some(warning => warning.includes('matched no')));
    assert.ok(report.files.every(file => file.findings === null));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('offline HTML safely embeds untrusted filenames and lint text', () => {
  const report = analyze({ project: demo, name: '</title><script>alert(1)</script>' });
  const hostile = '</script><script>alert("injected")</script>';
  report.warnings.push(hostile);
  const html = renderHtml(report);
  assert.ok(!html.includes(hostile));
  assert.ok(html.includes('&lt;/title&gt;'));
  const data = html.match(/<script id="report-data" type="application\/json">([\s\S]*?)<\/script>/)[1];
  assert.equal(JSON.parse(data).warnings.at(-1), hostile);
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+href=|@import/);
  assert.match(html, /Content-Security-Policy/);
});

test('treemap partitions conserve area, remain bounded, and do not overlap', () => {
  const items = Array.from({ length: 60 }, (_, i) => ({ id: i, weight: (i * 7) % 31 + 1 }));
  const rectangles = partition(items, { x: 7, y: 11, width: 900, height: 400 });
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  assert.equal(rectangles.length, items.length);
  for (const rect of rectangles) {
    assert.ok(Math.abs(rect.width * rect.height / 360000 - rect.item.weight / total) < 1e-12);
    assert.ok(rect.x >= 7 - 1e-9 && rect.y >= 11 - 1e-9);
    assert.ok(rect.x + rect.width <= 907 + 1e-9 && rect.y + rect.height <= 411 + 1e-9);
    for (const other of rectangles) {
      if (other === rect) continue;
      const overlapW = Math.min(rect.x + rect.width, other.x + other.width) - Math.max(rect.x, other.x);
      const overlapH = Math.min(rect.y + rect.height, other.y + other.height) - Math.max(rect.y, other.y);
      assert.ok(overlapW < 1e-8 || overlapH < 1e-8);
    }
  }
  assert.deepEqual(partition([], { x: 0, y: 0, width: 1, height: 1 }), []);
});

test('CLI generates usable JSON and HTML, and rejects invalid inputs', () => {
  const output = mkdtempSync(path.join(tmpdir(), 'panopticode-cli-'));
  try {
    const result = spawnSync(process.execPath, ['dist/cli.js', demo, '--out', output,
      '--coverage', 'examples/demo/coverage.json', '--eslint', 'examples/demo/eslint.json'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(readFileSync(path.join(output, 'report.json'), 'utf8'));
    assert.equal(report.files.length, 4);
    assert.match(readFileSync(path.join(output, 'report.html'), 'utf8'), /Codebase treemap/);
    const invalid = spawnSync(process.execPath, ['dist/cli.js', demo, '--thresholds', '5,4,2'], { encoding: 'utf8' });
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /thresholds/);
    const help = spawnSync(process.execPath, ['dist/cli.js', '--help'], { encoding: 'utf8' });
    assert.equal(help.status, 0);
    assert.match(help.stdout, /Usage:/);
  } finally { rmSync(output, { recursive: true, force: true }); }
});

test('CLI offers no-* controls and reports unavailable defaults as failures without abandoning other tools', () => {
  const output = mkdtempSync(path.join(tmpdir(), 'panopticode-cli-defaults-'));
  try {
    const skip = spawnSync(process.execPath, ['dist/cli.js', demo, '--out', output,
      '--no-typed-lint', '--no-lint', '--no-coverage', '--no-knip', '--no-dep-cruiser', '--no-duplication'], { encoding: 'utf8' });
    assert.equal(skip.status, 0, skip.stderr);
    const skipped = JSON.parse(readFileSync(path.join(output, 'report.json'), 'utf8'));
    assert.ok(skipped.analyzers.filter(pass => pass.id !== 'ts-morph').every(pass => pass.status === 'skipped'));
    const defaults = spawnSync(process.execPath, ['dist/cli.js', demo, '--out', output], { encoding: 'utf8' });
    assert.equal(defaults.status, 1, 'Demo has no test script; coverage must fail visibly');
    const report = JSON.parse(readFileSync(path.join(output, 'report.json'), 'utf8'));
    assert.equal(report.analyzers.find(pass => pass.id === 'coverage').status, 'failed');
    for (const id of ['eslint', 'jscpd', 'knip-command', 'dependency-cruiser-command']) {
      assert.equal(report.analyzers.find(pass => pass.id === id).status, 'complete', defaults.stderr);
    }
    assert.match(defaults.stderr, /--no-coverage/);
  } finally { rmSync(output, { recursive: true, force: true }); }
});
