import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import type { AnalyzerRun, Report } from './model.js';

interface ToolPackage { name: string; version: string; bin?: string | Record<string, string> }

function toolPackage(name: string): { directory: string; pkg: ToolPackage } {
  let directory = path.dirname(fileURLToPath(import.meta.resolve(name)));
  while (true) {
    const filename = path.join(directory, 'package.json');
    if (fs.existsSync(filename)) {
      const pkg = JSON.parse(fs.readFileSync(filename, 'utf8')) as ToolPackage;
      if (pkg.name === name) return { directory, pkg };
    }
    const parent = path.dirname(directory);
    if (parent === directory) throw new Error(`Cannot determine version of ${name}`);
    directory = parent;
  }
}

export function toolVersion(name: string): string {
  return toolPackage(name).pkg.version;
}

export function toolBinary(name: string, binary: string): string {
  const { directory, pkg } = toolPackage(name);
  const relative = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.[binary];
  if (!relative) throw new Error(`No bundled ${binary} binary in ${name}`);
  return path.resolve(directory, relative);
}

export function recordPass(report: Report, run: AnalyzerRun): void {
  report.analyzers.push(run);
}

export function importedPass(report: Report, id: string, filename: string, files: number): void {
  recordPass(report, { id, version: 'external / unspecified', status: 'imported', files, durationMs: 0,
    configuration: { id: 'external', version: 1, options: { filename } } });
}
