import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { analyze, analyzeSource, runProject, importKnip, importDependencyCruiser } from '../dist/index.js';
import { runCommand } from '../dist/command.js';
import { countDuplicatedLines } from '../dist/duplication.js';

function fixture() {
  const root = fs.mkdtempSync(path.join(tmpdir(), 'panopticode-runners-'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'runner-fixture', private: true, type: 'module', scripts: { 'test:coverage': 'node fixture-coverage.cjs' } }));
  fs.writeFileSync(path.join(root, 'fixture-coverage.cjs'), `const fs=require('node:fs');fs.mkdirSync('coverage',{recursive:true});fs.writeFileSync('coverage/coverage-final.json',JSON.stringify({'one.ts':{statementMap:{a:{start:{line:2}}},s:{a:1}}}));`);
  fs.writeFileSync(path.join(root, 'knip.json'), JSON.stringify({ entry: ['one.ts'], project: ['*.ts', '*.js'] }));
  fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', strict: true, allowJs: true }, include: ['*.ts', '*.js'] }));
  fs.writeFileSync(path.join(root, 'one.ts'), `export function first(value: number): number {
    let total = value + 1;
    total += value * 2;
    total += value * 3;
    total += value * 4;
    total += value * 5;
    total += value * 6;
    total += value * 7;
    total += value * 8;
    total += value * 9;
    return total;
  }
  const unused = 1;
  export const same = (value: number) => (value > 1) && (value > 1);`);
  fs.writeFileSync(path.join(root, 'two.ts'), `export function second(value: number): number {
    let total = value + 1;
    total += value * 2;
    total += value * 3;
    total += value * 4;
    total += value * 5;
    total += value * 6;
    total += value * 7;
    total += value * 8;
    total += value * 9;
    return total;
  }`);
  return root;
}

test('default passes provide complete measurements, actionable rule IDs, duplication pairs and provenance', async () => {
  const root = fixture();
  try {
    const report = await runProject({ project: root });
    assert.equal(report.schemaVersion, 2);
    assert.ok(report.files.every(file => file.findings !== null));
    const findings = report.files.flatMap(file => file.findings);
    assert.ok(findings.some(finding => finding.rule === '@typescript-eslint/no-unused-vars'));
    assert.ok(findings.some(finding => finding.rule === 'sonarjs/no-identical-expressions'));
    assert.ok(findings.every(finding => finding.line > 0 && finding.column > 0));
    assert.ok(report.duplicates.length > 0);
    assert.ok(report.duplicates.some(block => block.first.file !== block.second.file));
    assert.ok(report.files.every(file => file.measurements.duplicatedLines > 0));
    assert.ok(report.files.flatMap(file => file.units).some(unit => unit.complexity === 1));
    const lint = report.analyzers.find(pass => pass.id === 'eslint');
    assert.equal(lint.configuration.id, 'panopticode-baseline');
    assert.equal(lint.configuration.version, 1);
    assert.equal(Object.keys(lint.configuration.options.ruleConfigurationHashes).length, 2);
    assert.equal(report.analyzers.find(pass => pass.id === 'jscpd').status, 'complete');
    assert.equal(lint.configuration.options.typed, true);
    assert.equal(report.analyzers.find(pass => pass.id === 'coverage-command').status, 'complete');
    assert.equal(report.analyzers.find(pass => pass.id === 'knip-command').status, 'complete');
    assert.equal(report.analyzers.find(pass => pass.id === 'dependency-cruiser-command').status, 'complete');
    assert.ok(report.analyzers.every(pass => pass.status !== 'failed'));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('function nesting resets at nested functions and class structure is measured independently', () => {
  const result = analyzeSource(`abstract class Work extends Base implements Contract {
    value = 1;
    constructor() { super(); }
    get current() { return this.value; }
    set current(value: number) { this.value = value; }
    run(flag: boolean) {
      if (flag) { for (const item of []) { console.log(item); } }
      const inner = () => { if (flag) { while (flag) { if (flag) break; } } };
      return inner;
    }
  }`, 'class.ts');
  const run = result.units.find(unit => unit.name === 'Work.run');
  const inner = result.units.find(unit => unit.name === 'inner');
  assert.equal(run.measurements.maxNestingDepth, 2);
  assert.equal(inner.measurements.maxNestingDepth, 3);
  assert.equal(run.measurements.parameterCount, 1);
  assert.equal(result.classes.length, 1);
  assert.deepEqual({ methods: result.classes[0].methods, properties: result.classes[0].properties,
    constructors: result.classes[0].constructors, getters: result.classes[0].getters, setters: result.classes[0].setters },
    { methods: 1, properties: 1, constructors: 1, getters: 1, setters: 1 });
  assert.equal(result.classes[0].extends, 'Base');
  assert.deepEqual(result.classes[0].implements, ['Contract']);
  assert.equal(result.classes[0].abstract, true);
});

test('custom metrics are opt-in, versioned, and applied to relevant functions, classes and files', () => {
  const root = fixture();
  try {
    fs.writeFileSync(path.join(root, 'entity.ts'), 'export class Entity { run() { return 1; } }');
    const report = analyze({ project: root, customMetrics: [{ id: 'text-width', version: 1,
      description: 'Fixture metric: syntax-node width in characters', measure: node => node.getWidth() }] });
    const file = report.files.find(file => file.path === 'entity.ts');
    assert.ok(file.measurements.custom['text-width'] > 0);
    assert.ok(file.classes[0].custom['text-width'] > 0);
    assert.ok(file.units[0].measurements.custom['text-width'] > 0);
    assert.equal(report.analyzers[0].configuration.options.customMetrics[0].version, 1);
    assert.throws(() => analyze({ project: root, customMetrics: [{ id: 'bad', version: 1, description: 'Invalid', measure: () => NaN }] }), /non-finite/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('project lint mode respects project rules rather than imposing the bundled policy', async () => {
  const root = fixture();
  try {
    fs.writeFileSync(path.join(root, 'eslint.config.mjs'), `export default [{files:['**/*.{js,ts}'], rules:{'no-console':'warn'}}];`);
    fs.writeFileSync(path.join(root, 'view.js'), 'console.log(1);');
    fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { allowJs: true }, include: ['view.js'] }));
    const report = await runProject({ project: root, lintMode: 'project', noDuplication: true, noCoverage: true, noKnip: true, noDependencyCruiser: true });
    assert.equal(report.files.find(file => file.path === 'view.js').findings[0].rule, 'no-console');
    assert.equal(report.analyzers.find(pass => pass.id === 'eslint').configuration.id, 'project-eslint-config');
    assert.equal(report.duplicates, null);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('typed linting uses a separate project service and flags an unhandled promise', async () => {
  const root = fixture();
  try {
    fs.writeFileSync(path.join(root, 'promise.ts'), 'async function work(): Promise<number> { return 1; }\nwork();');
    const report = await runProject({ project: root, noDuplication: true, noCoverage: true, noKnip: true, noDependencyCruiser: true });
    assert.ok(report.files.find(file => file.path === 'promise.ts').findings.some(value => value.rule === '@typescript-eslint/no-floating-promises'));
    assert.equal(report.analyzers.find(pass => pass.id === 'eslint').configuration.options.typed, true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('configured coverage runs a real command and imports its fresh report', async () => {
  const root = fixture();
  try {
    const data = { 'one.ts': { statementMap: { a: { start: { line: 2 } } }, s: { a: 1 } } };
    const command = [process.execPath, '-e', `require('node:fs').writeFileSync('coverage.json', ${JSON.stringify(JSON.stringify(data))})`];
    fs.writeFileSync(path.join(root, 'panopticode.config.json'), JSON.stringify({ version: 1, coverage: { command, report: 'coverage.json' } }));
    const report = await runProject({ project: root, noLint: true, noDuplication: true, noKnip: true, noDependencyCruiser: true });
    assert.deepEqual(report.files.find(file => file.path === 'one.ts').coverage, { covered: 1, total: 1 });
    assert.equal(report.analyzers.find(pass => pass.id === 'coverage-command').status, 'complete');
    assert.equal(report.analyzers.find(pass => pass.id === 'istanbul-coverage').status, 'imported');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('runner rejects failures, stale reports and timeouts rather than presenting old evidence', async () => {
  const root = fixture();
  try {
    fs.writeFileSync(path.join(root, 'old.json'), '{}');
    const task = { command: [process.execPath, '-e', 'process.exit(0)'], report: 'old.json', timeoutMs: 2000 };
    await assert.rejects(runCommand(task, root), /fresh report/);
    await assert.rejects(runCommand({ ...task, command: [process.execPath, '-e', 'process.exit(1)'] }, root), /exited 1/);
    await assert.rejects(runCommand({ ...task, command: [process.execPath, '-e', 'setInterval(()=>{},1000)'], timeoutMs: 100 }, root), /timed out/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('optional adapters import Knip hygiene and dependency-cruiser graph/violations separately', () => {
  const root = fixture();
  try {
    const report = analyze({ project: root });
    fs.writeFileSync(path.join(root, 'knip.json'), JSON.stringify({ issues: [{ file: 'one.ts', exports: [{ name: 'first', line: 1 }] }] }));
    fs.writeFileSync(path.join(root, 'cruise.json'), JSON.stringify({ modules: [{ source: 'one.ts', dependencies: [{ resolved: 'two.ts' }] }],
      summary: { violations: [{ from: 'one.ts', to: 'two.ts', rule: { name: 'no-cycle' } }] } }));
    importKnip(report, path.join(root, 'knip.json'), root);
    importDependencyCruiser(report, path.join(root, 'cruise.json'), root);
    assert.equal(report.supplements[0].findings[0].category, 'exports');
    assert.deepEqual(report.supplements[1].dependencies, [{ from: 'one.ts', to: 'two.ts' }]);
    assert.equal(report.supplements[1].findings[0].category, 'no-cycle');
    assert.ok(report.files.every(file => file.findings === null));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('duplication totals union overlapping source ranges rather than adding match penalties', () => {
  const root = fixture();
  try {
    const report = analyze({ project: root });
    const range = (line, endLine) => ({ file: 'one.ts', line, endLine, column: 1, endColumn: 10 });
    report.duplicates = [{ id: 'one', first: range(2, 8), second: range(4, 10), tokens: 50, lines: 7 }];
    countDuplicatedLines(report);
    assert.equal(report.files.find(file => file.path === 'one.ts').measurements.duplicatedLines, 9);
    assert.equal(report.files.find(file => file.path === 'two.ts').measurements.duplicatedLines, 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('optional configured adapters accept documented finding exit codes and import fresh JSON', async () => {
  const root = fixture();
  try {
    const command = [process.execPath, '-e', `require('node:fs').writeFileSync('knip.json', JSON.stringify({issues:[{file:'one.ts',exports:[{name:'first',line:1}]}]})); process.exit(1);`];
    fs.writeFileSync(path.join(root, 'panopticode.config.json'), JSON.stringify({ version: 1,
      knip: { command, report: 'knip.json', successCodes: [0, 1] } }));
    const report = await runProject({ project: root, noLint: true, noDuplication: true, noCoverage: true, noDependencyCruiser: true });
    assert.equal(report.supplements[0].tool, 'knip');
    assert.ok(report.analyzers.some(pass => pass.id === 'knip-command' && pass.status === 'complete'));
    assert.ok(report.files.every(file => file.findings === null));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('explicit metric modules run through the integrated pipeline and invalid config versions fail', async () => {
  const root = fixture();
  try {
    fs.writeFileSync(path.join(root, 'metric.mjs'), `export default [{id:'file-width',version:1,description:'Test metric',measure:(node,context)=>context.kind==='file'?node.getWidth():null}];`);
    const report = await runProject({ project: root, metricsModule: path.join(root, 'metric.mjs'), noLint: true, noDuplication: true, noCoverage: true, noKnip: true, noDependencyCruiser: true });
    assert.ok(report.files.every(file => file.measurements.custom['file-width'] > 0));
    fs.writeFileSync(path.join(root, 'panopticode.config.json'), JSON.stringify({ version: 9 }));
    await assert.rejects(runProject({ project: root }), /version must be 1/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('no-* options skip their passes even when commands and imports are configured', async () => {
  const root = fixture();
  try {
    const command = [process.execPath, '-e', "require('node:fs').writeFileSync('should-not-run','bad');process.exit(1)"];
    const task = { command, report: 'missing.json' };
    fs.writeFileSync(path.join(root, 'panopticode.config.json'), JSON.stringify({ version: 1, coverage: task, knip: task, dependencyCruiser: task }));
    const report = await runProject({ project: root, noCoverage: true, noKnip: true, noDependencyCruiser: true,
      noLint: true, noDuplication: true, coverage: 'missing.json', eslint: 'missing.json' });
    assert.ok(!fs.existsSync(path.join(root, 'should-not-run')));
    for (const id of ['coverage', 'knip', 'dependency-cruiser', 'eslint', 'jscpd']) {
      assert.equal(report.analyzers.find(pass => pass.id === id).status, 'skipped');
    }
    assert.ok(report.files.every(file => file.coverage === null && file.findings === null));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('no-typed-lint keeps syntax linting while disabling the typed promise rules', async () => {
  const root = fixture();
  try {
    fs.writeFileSync(path.join(root, 'promise.ts'), 'async function work(): Promise<number> { return 1; }\nwork();');
    const report = await runProject({ project: root, noTypedLint: true, noCoverage: true, noKnip: true,
      noDependencyCruiser: true, noDuplication: true });
    const findings = report.files.flatMap(file => file.findings);
    assert.ok(findings.some(value => value.rule === '@typescript-eslint/no-unused-vars'));
    assert.ok(!findings.some(value => value.rule === '@typescript-eslint/no-floating-promises'));
    assert.equal(report.analyzers.find(pass => pass.id === 'eslint').configuration.options.typed, false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('plain test scripts automatically get bundled c8 coverage without a coverage command', async () => {
  const root = fixture();
  try {
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'auto-test-fixture', private: true, type: 'module', scripts: { test: 'node --test smoke.test.cjs' } }));
    fs.writeFileSync(path.join(root, 'main.js'), 'export function value() { return 42; }');
    fs.writeFileSync(path.join(root, 'smoke.test.cjs'), "require('node:test')('runs code', async()=>{const m=await import('./main.js');require('node:assert/strict').equal(m.value(),42)});");
    const report = await runProject({ project: root, noLint: true, noDuplication: true, noKnip: true, noDependencyCruiser: true });
    const pass = report.analyzers.find(pass => pass.id === 'coverage-command');
    assert.equal(pass?.status, 'complete', report.warnings.join('\n'));
    assert.equal(pass.configuration.options.tool, 'c8');
    assert.ok(report.files.find(file => file.path === 'main.js').coverage.covered > 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('unavailable default coverage is reported as failed while other passes still complete', async () => {
  const root = fixture();
  try {
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'no-tests-fixture', private: true }));
    const report = await runProject({ project: root, noKnip: true, noDependencyCruiser: true });
    assert.equal(report.analyzers.find(pass => pass.id === 'coverage').status, 'failed');
    assert.ok(report.warnings.some(value => value.includes('--no-coverage')));
    assert.equal(report.analyzers.find(pass => pass.id === 'eslint').status, 'complete');
    assert.equal(report.analyzers.find(pass => pass.id === 'jscpd').status, 'complete');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('stdout task reports are atomic and failed commands leave no temporary artifacts', async () => {
  const root = fixture();
  try {
    const report = path.join(root, 'stdout.json');
    fs.writeFileSync(report, 'previous');
    const task = { command: [process.execPath, '-e', "console.log('{}');process.exit(1)"], report, stdout: true, timeoutMs: 2000 };
    await assert.rejects(runCommand(task, root), /exited 1/);
    assert.equal(fs.readFileSync(report, 'utf8'), 'previous');
    assert.ok(!fs.readdirSync(root).some(name => name.endsWith('.tmp')));
    await runCommand({ ...task, command: [process.execPath, '-e', "console.log('{\"issues\":[]}')"] }, root);
    assert.deepEqual(JSON.parse(fs.readFileSync(report, 'utf8')), { issues: [] });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Knip member maps are normalized alongside ordinary array findings', () => {
  const root = fixture();
  try {
    const report = analyze({ project: root });
    fs.writeFileSync(path.join(root, 'members.json'), JSON.stringify({ files: [], issues: [{ file: 'one.ts',
      enumMembers: { Mode: [{ name: 'unused', line: 2 }] }, classMembers: { Thing: [{ name: 'unusedMethod', line: 3 }] } }] }));
    importKnip(report, path.join(root, 'members.json'), root);
    assert.deepEqual(report.supplements[0].findings.map(value => value.message), ['Mode.unused', 'Thing.unusedMethod']);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
