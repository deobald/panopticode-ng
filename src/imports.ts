import fs from 'node:fs';
import path from 'node:path';
import type { Coverage, Finding, Report } from './model.js';

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function number(value: unknown, label: string, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || !Number.isInteger(value)) {
    throw new Error(`${label} must be an integer of at least ${minimum}.`);
  }
  return value;
}

function read(filename: string): unknown {
  try { return JSON.parse(fs.readFileSync(filename, 'utf8')) as unknown; }
  catch (error) { throw new Error(`Cannot read JSON from ${filename}: ${(error as Error).message}`); }
}

function fileKey(root: string, filename: string): string {
  return path.relative(root, path.resolve(root, filename)).split(path.sep).join('/');
}

function summarize(lines: Iterable<number>): Coverage | null {
  const values = [...lines];
  return values.length ? { total: values.length, covered: values.filter(hits => hits > 0).length } : null;
}

export function importCoverage(report: Report, filename: string, projectRoot: string): void {
  const data = record(read(filename), 'Istanbul coverage JSON');
  const matched = new Map(report.files.map(file => [file.path, file]));
  let count = 0;
  let unmatched = 0;
  for (const [key, raw] of Object.entries(data)) {
    const entry = record(raw, `Coverage entry ${key}`);
    const statements = record(entry.statementMap, `${key}.statementMap (use coverage-final.json, not coverage-summary.json)`);
    const hits = record(entry.s, `${key}.s`);
    const lineHits = new Map<number, number>();
    for (const [id, rawLocation] of Object.entries(statements)) {
      const location = record(rawLocation, `${key}.statementMap.${id}`);
      const start = record(location.start, `Statement ${id} start`);
      const line = number(start.line, `Statement ${id} line`, 1);
      const executions = number(hits[id], `Statement ${id} execution count`);
      lineHits.set(line, Math.max(lineHits.get(line) ?? 0, executions));
    }
    const coveragePath = typeof entry.path === 'string' ? entry.path : key;
    const file = matched.get(fileKey(projectRoot, coveragePath));
    if (!file) { unmatched++; continue; }
    if (file.coverage) throw new Error(`Duplicate coverage entry for ${file.path}`);
    count++;
    file.coverage = summarize(lineHits.values());
    for (const unit of file.units) {
      unit.coverage = summarize(unit.statementLines.filter(line => lineHits.has(line)).map(line => lineHits.get(line)!));
    }
  }
  report.inputs.coverage = path.basename(filename);
  if (!count) report.warnings.push('Coverage report matched no analyzed files. Paths must refer to the analyzed checkout.');
  if (unmatched) report.warnings.push(`${unmatched} coverage entries did not match analyzed files.`);
}

export function importEslint(report: Report, filename: string, projectRoot: string): void {
  const data = read(filename);
  if (!Array.isArray(data)) throw new Error('ESLint JSON must be an array from eslint --format json.');
  const matched = new Map(report.files.map(file => [file.path, file]));
  let count = 0;
  let unmatched = 0;
  for (const raw of data) {
    const entry = record(raw, 'ESLint result');
    if (typeof entry.filePath !== 'string' || !Array.isArray(entry.messages)) {
      throw new Error('Each ESLint result must contain filePath and messages.');
    }
    const findings: Finding[] = [];
    for (const rawMessage of entry.messages) {
      const message = record(rawMessage, 'ESLint message');
      if (message.severity === 0) continue;
      if ((message.severity !== 1 && message.severity !== 2) || typeof message.message !== 'string') {
        throw new Error('ESLint messages must have severity 1 or 2 and message text.');
      }
      findings.push({
        rule: typeof message.ruleId === 'string' ? message.ruleId : '(parser/configuration)',
        severity: message.severity, message: message.message,
        line: message.line == null ? null : number(message.line, 'ESLint line', 1),
        column: message.column == null ? null : number(message.column, 'ESLint column', 1),
      });
    }
    const file = matched.get(fileKey(projectRoot, entry.filePath));
    if (!file) { unmatched++; continue; }
    if (file.findings !== null) throw new Error(`Duplicate ESLint entry for ${file.path}`);
    file.findings = findings;
    count++;
  }
  report.inputs.eslint = path.basename(filename);
  if (!count) report.warnings.push('ESLint report matched no analyzed files. Paths must refer to the analyzed checkout.');
  if (unmatched) report.warnings.push(`${unmatched} ESLint entries did not match analyzed files.`);
}
