#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { analyze, importCoverage, importEslint, renderHtml } from './index.js';

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

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      project: { type: 'string' }, out: { type: 'string' }, name: { type: 'string' },
      coverage: { type: 'string' }, eslint: { type: 'string' }, thresholds: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) process.stdout.write(help);
  else {
    if (positionals.length > 1 || (positionals.length && values.project)) throw new Error('Supply one project path.');
    const project = path.resolve(values.project ?? positionals[0] ?? '.');
    const root = fs.statSync(project).isDirectory() ? project : path.dirname(project);
    const output = path.resolve(values.out ?? 'reports/panopticode');
    if (output === root || root.startsWith(output + path.sep)) throw new Error('Output must be a dedicated report directory, not the project root or its parent.');
    const report = analyze({
      project, excludeDirectory: output,
      ...(values.name !== undefined ? { name: values.name } : {}),
      ...(values.thresholds !== undefined ? { thresholds: values.thresholds.split(',').map(Number) as [number, number, number] } : {}),
    });
    if (values.coverage) importCoverage(report, path.resolve(values.coverage), root);
    if (values.eslint) importEslint(report, path.resolve(values.eslint), root);
    const html = renderHtml(report);
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    fs.writeFileSync(path.join(output, 'report.html'), html);
    const units = report.files.flatMap(file => file.units);
    process.stdout.write(`Analyzed ${report.files.length} files and ${units.length} code regions.\nReport: ${path.join(output, 'report.html')}\nData:   ${path.join(output, 'report.json')}\n`);
    for (const warning of report.warnings) process.stderr.write(`Warning: ${warning}\n`);
  }
} catch (error) {
  process.stderr.write(`panopticode-ts: ${(error as Error).message}\n`);
  process.exitCode = 1;
}
