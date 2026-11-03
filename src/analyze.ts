import path from 'node:path';
import fs from 'node:fs';
import type { Report } from './model.js';
import { discover } from './discovery.js';
import { analyzeSourceFile, parsingProject } from './source-analysis.js';
import { definitions } from './definitions.js';
export { analyzeSource } from './source-analysis.js';

export interface AnalyzeOptions {
  project: string;
  name?: string;
  thresholds?: [number, number, number];
  excludeDirectory?: string;
}

function validBoundary(value: number, index: number, values: number[]): boolean {
  if (!Number.isInteger(value) || value < 2) return false;
  return index === 0 || value > values[index - 1]!;
}

function thresholdsFor(options: AnalyzeOptions): [number, number, number] {
  const thresholds = options.thresholds ?? [6, 10, 25];
  if (thresholds.length !== 3 || !thresholds.every(validBoundary)) {
    throw new Error('Complexity thresholds must be three increasing integers of at least 2.');
  }
  return thresholds;
}

export function analyze(options: AnalyzeOptions): Report {
  const thresholds = thresholdsFor(options);
  const { root, filenames, warnings } = discover(options.project, options.excludeDirectory);
  const project = parsingProject();
  const sources = filenames.map(filename => project.createSourceFile(filename, fs.readFileSync(filename, 'utf8')));
  const files = sources.map(source => analyzeSourceFile(source, path.relative(root, source.getFilePath()).split(path.sep).join('/')));
  return { schemaVersion: 1, name: options.name ?? path.basename(root), generatedAt: new Date().toISOString(),
    thresholds, files, warnings, inputs: { coverage: null, eslint: null }, definitions: { ...definitions } };
}
