#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { analyze, importCoverage, importEslint, renderHtml, type AnalyzeOptions, type Report } from './index.js';
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
No tests, lint configuration, or project code are executed.
`;

function readArguments() {
  const args = parseArgs({
    allowPositionals: true,
    options: {
      project: { type: 'string' }, out: { type: 'string' }, name: { type: 'string' },
      coverage: { type: 'string' }, eslint: { type: 'string' }, thresholds: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (args.positionals.length > 1 || (args.positionals.length && args.values.project)) throw new Error('Supply one project path.');
  return args;
}

type Arguments = ReturnType<typeof readArguments>;

function analysisOptions(values: Arguments['values'], project: string, output: string): AnalyzeOptions {
  const options: AnalyzeOptions = { project, excludeDirectory: output };
  if (values.name !== undefined) options.name = values.name;
  if (values.thresholds !== undefined) options.thresholds = values.thresholds.split(',').map(Number) as [number, number, number];
  return options;
}

function analyzeArguments(args: Arguments): Report {
  const { values, positionals } = args;
  const project = path.resolve(values.project ?? positionals[0] ?? '.');
  const root = projectRoot(project);
  const output = path.resolve(values.out ?? 'reports/panopticode');
  if (output === root || root.startsWith(output + path.sep)) throw new Error('Output must be a dedicated report directory, not the project root or its parent.');
  const report = analyze(analysisOptions(values, project, output));
  if (values.coverage) importCoverage(report, path.resolve(values.coverage), root);
  if (values.eslint) importEslint(report, path.resolve(values.eslint), root);
  return report;
}

function writeReport(report: Report, output: string): void {
  const html = renderHtml(report);
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(output, 'report.html'), html);
  const regions = report.files.reduce((sum, file) => sum + file.units.length, 0);
  process.stdout.write(`Analyzed ${report.files.length} files and ${regions} code regions.\nReport: ${path.join(output, 'report.html')}\nData:   ${path.join(output, 'report.json')}\n`);
  for (const warning of report.warnings) process.stderr.write(`Warning: ${warning}\n`);
}

function main(): void {
  const args = readArguments();
  if (args.values.help) { process.stdout.write(help); return; }
  writeReport(analyzeArguments(args), path.resolve(args.values.out ?? 'reports/panopticode'));
}

try { main(); }
catch (error) {
  process.stderr.write(`panopticode-ts: ${(error as Error).message}\n`);
  process.exitCode = 1;
}
