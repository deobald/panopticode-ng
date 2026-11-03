#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { runProject, renderHtml, type RunOptions, type Report } from './index.js';
import { lintMode } from './config.js';
import { projectRoot } from './discovery.js';

const help = `Panopticode TS — visual explanations of TypeScript codebase health

Usage: panopticode-ts [project-directory | tsconfig.json] [options]

  --project PATH        Project directory or tsconfig (default: current directory)
  --out DIRECTORY       Write report.html and report.json (default: reports/panopticode)
  --name NAME           Report title
  --coverage FILE       Import source-mapped Istanbul coverage-final.json
  --eslint FILE         Import existing ESLint --format json output
  --thresholds A,B,C    Complexity band boundaries (default: 6,10,25)
  --help, -h            Show this help

Source paths in imported reports resolve relative to the project directory.
All analysis passes run by default, including typed lint, tests/coverage, Knip,
and dependency-cruiser. Test commands come from analyzer config or package scripts.

  --lint baseline|project|off  Lint policy (default: bundled typed baseline)
  --no-lint              Skip all linting
  --no-typed-lint        Disable typed lint rules; keep syntax lint
  --no-coverage          Skip coverage generation/import
  --no-knip              Skip hygiene analysis/import
  --no-dep-cruiser       Skip architecture analysis/import
  --no-duplication       Skip jscpd
  --config FILE          Versioned analyzer JSON configuration
  --coverage-script NAME Override the discovered coverage script
  --metrics-module FILE  Load explicitly chosen custom metric definitions
  --knip FILE            Import Knip JSON instead of running Knip
  --dependency-cruiser FILE  Import architecture JSON instead of running it
`;

function readArguments() {
  const args = parseArgs({
    allowPositionals: true,
    options: {
      project: { type: 'string' }, out: { type: 'string' }, name: { type: 'string' },
      coverage: { type: 'string' }, eslint: { type: 'string' }, thresholds: { type: 'string' },
      lint: { type: 'string' }, config: { type: 'string' }, 'typed-lint': { type: 'boolean' },
      'no-duplication': { type: 'boolean' }, 'run-coverage': { type: 'boolean' },
      'no-lint': { type: 'boolean' }, 'no-typed-lint': { type: 'boolean' },
      'no-coverage': { type: 'boolean' }, 'no-knip': { type: 'boolean' },
      'no-dep-cruiser': { type: 'boolean' }, 'no-dependency-cruiser': { type: 'boolean' },
      'coverage-script': { type: 'string' }, 'metrics-module': { type: 'string' },
      knip: { type: 'string' }, 'dependency-cruiser': { type: 'string' },
      'run-knip': { type: 'boolean' }, 'run-dependency-cruiser': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (args.positionals.length > 1 || (args.positionals.length && args.values.project)) throw new Error('Supply one project path.');
  return args;
}

type Arguments = ReturnType<typeof readArguments>;

function analysisOptions(values: Arguments['values'], project: string, output: string): RunOptions {
  const options: RunOptions = { project, excludeDirectory: output };
  if (values.name !== undefined) options.name = values.name;
  if (values.thresholds !== undefined) options.thresholds = values.thresholds.split(',').map(Number) as [number, number, number];
  setRunnerOptions(options, values);
  return options;
}

function setRunnerOptions(options: RunOptions, values: Arguments['values']): void {
  const strings = [['config', 'config'], ['coverage', 'coverage'], ['eslint', 'eslint'],
    ['coverage-script', 'coverageScript'], ['metrics-module', 'metricsModule'],
    ['knip', 'knip'], ['dependency-cruiser', 'dependencyCruiser']] as const;
  for (const [flag, key] of strings) if (values[flag] !== undefined) options[key] = values[flag];
  const booleans = [['typed-lint', 'typedLint'], ['no-duplication', 'noDuplication'],
    ['no-lint', 'noLint'], ['no-typed-lint', 'noTypedLint'], ['no-coverage', 'noCoverage'], ['no-knip', 'noKnip'],
    ['no-dependency-cruiser', 'noDependencyCruiser'], ['no-dep-cruiser', 'noDependencyCruiser'],
    ['run-coverage', 'runCoverage'], ['run-knip', 'runKnip'], ['run-dependency-cruiser', 'runDependencyCruiser']] as const;
  for (const [flag, key] of booleans) if (values[flag] !== undefined) options[key] = values[flag];
  if (values.lint !== undefined) options.lintMode = lintMode(values.lint);
}

async function analyzeArguments(args: Arguments): Promise<Report> {
  const { values, positionals } = args;
  const project = path.resolve(values.project ?? positionals[0] ?? '.');
  const root = projectRoot(project);
  const output = path.resolve(values.out ?? 'reports/panopticode');
  if (output === root || root.startsWith(output + path.sep)) throw new Error('Output must be a dedicated report directory, not the project root or its parent.');
  return runProject(analysisOptions(values, project, output));
}

function writeReport(report: Report, output: string): void {
  const html = renderHtml(report);
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(output, 'report.html'), html);
  const regions = report.files.reduce((sum, file) => sum + file.units.length, 0);
  process.stdout.write(`Analyzed ${report.files.length} files and ${regions} code regions.\nReport: ${path.join(output, 'report.html')}\nData:   ${path.join(output, 'report.json')}\n`);
  if (report.analyzers.some(pass => pass.status === 'failed')) process.exitCode = 1;
  for (const warning of report.warnings) process.stderr.write(`Warning: ${warning}\n`);
}

async function main(): Promise<void> {
  const args = readArguments();
  if (args.values.help) { process.stdout.write(help); return; }
  writeReport(await analyzeArguments(args), path.resolve(args.values.out ?? 'reports/panopticode'));
}

try { await main(); }
catch (error) {
  process.stderr.write(`panopticode-ts: ${(error as Error).message}\n`);
  process.exitCode = 1;
}
