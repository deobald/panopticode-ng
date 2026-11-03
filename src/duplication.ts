import { Detector, MemoryStore, getDefaultOptions, type IClone, type IMapFrame } from '@jscpd/core';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import type { Report, SourceRange } from './model.js';
import { recordPass, toolVersion } from './provenance.js';

// The tokenizer's ESM build has extensionless imports; its CJS build is compatible with Node.
const { Tokenizer } = createRequire(import.meta.url)('@jscpd/tokenizer') as typeof import('@jscpd/tokenizer');

export interface DuplicationOptions { enabled: boolean; minLines: number; minTokens: number }
export const duplicationDefaults: DuplicationOptions = { enabled: true, minLines: 5, minTokens: 50 };

function cloneRange(range: IClone['duplicationA'], root: string): SourceRange {
  return { file: path.relative(root, path.resolve(range.sourceId)).split(path.sep).join('/'),
    line: range.start.line, column: range.start.column ?? 0, endLine: range.end.line, endColumn: range.end.column ?? 0 };
}

export function countDuplicatedLines(report: Report): void {
  const lines = new Map(report.files.map(file => [file.path, new Set<number>()]));
  const totals = new Map(report.files.map(file => [file.path, file.measurements.physicalLines]));
  for (const block of report.duplicates ?? []) {
    for (const range of [block.first, block.second]) {
      const measured = lines.get(range.file);
      const end = Math.min(range.endLine, totals.get(range.file) ?? 0);
      for (let line = range.line; line <= end; line++) measured?.add(line);
    }
  }
  for (const file of report.files) file.measurements.duplicatedLines = lines.get(file.path)!.size;
}

export async function runDuplication(report: Report, root: string, options: DuplicationOptions): Promise<void> {
  if (!options.enabled) return;
  const start = performance.now();
  const clones = await detectFiles(report, root, options);
  report.duplicates = clones.map((clone, index) => ({ id: `clone-${index}`, first: cloneRange(clone.duplicationA, root),
    second: cloneRange(clone.duplicationB, root), lines: clone.duplicationA.end.line - clone.duplicationA.start.line + 1,
    tokens: (clone.duplicationA.end.position ?? 0) - (clone.duplicationA.start.position ?? 0) }));
  countDuplicatedLines(report);
  recordPass(report, { id: 'jscpd', version: toolVersion('@jscpd/core'), status: 'complete', files: report.files.length,
    durationMs: performance.now() - start, configuration: { id: 'panopticode-duplication', version: 1, options: { ...options, mode: 'mild' } } });
}

async function detectFiles(report: Report, root: string, options: DuplicationOptions): Promise<IClone[]> {
  const store = new MemoryStore<IMapFrame>();
  const detector = new Detector(new Tokenizer(), store, [], { ...getDefaultOptions(), ...options });
  const clones: IClone[] = [];
  try {
    for (const file of report.files) {
      const filename = path.resolve(root, file.path);
      const format = /\.[cm]?tsx?$/i.test(filename) ? 'typescript' : 'javascript';
      clones.push(...await detector.detect(filename, fs.readFileSync(filename, 'utf8'), format));
    }
  } finally { store.close(); }
  return clones;
}
