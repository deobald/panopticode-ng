import fs from 'node:fs';
import path from 'node:path';
import type { FileResult, Report } from './model.js';

export function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

export function integer(value: unknown, label: string, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum) {
    throw new Error(`${label} must be an integer of at least ${minimum}.`);
  }
  return value;
}

export function readJson(filename: string): unknown {
  try { return JSON.parse(fs.readFileSync(filename, 'utf8')) as unknown; }
  catch (error) { throw new Error(`Cannot read JSON from ${filename}: ${(error as Error).message}`); }
}

function fileKey(root: string, filename: string): string {
  const resolved = path.resolve(root, filename);
  const physical = fs.existsSync(resolved) ? fs.realpathSync(resolved) : resolved;
  return path.relative(root, physical).split(path.sep).join('/');
}

export function importRecords<T extends { path: string }>(report: Report, records: T[], root: string,
  label: string, apply: (file: FileResult, entry: T) => void): void {
  const files = new Map(report.files.map(file => [file.path, file]));
  const canonicalRoot = fs.realpathSync(root);
  const matched = new Set<string>();
  let unmatched = 0;
  for (const entry of records) {
    const file = files.get(fileKey(canonicalRoot, entry.path));
    if (!file) { unmatched++; continue; }
    if (matched.has(file.path)) throw new Error(`Duplicate ${label} entry for ${file.path}`);
    matched.add(file.path);
    apply(file, entry);
  }
  if (!matched.size) report.warnings.push(`${label} report matched no analyzed files. Paths must refer to the analyzed checkout.`);
  if (unmatched) report.warnings.push(`${unmatched} ${label} entries did not match analyzed files.`);
}
