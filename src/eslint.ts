import path from 'node:path';
import type { Finding, Report } from './model.js';
import { importRecords, integer, readJson, record } from './evidence.js';

function optionalLocation(value: unknown, label: string): number | null {
  return value == null ? null : integer(value, label, 1);
}

function finding(raw: unknown): Finding | null {
  const message = record(raw, 'ESLint message');
  if (message.severity === 0) return null;
  if ((message.severity !== 1 && message.severity !== 2) || typeof message.message !== 'string') {
    throw new Error('ESLint messages must have severity 1 or 2 and message text.');
  }
  return { rule: typeof message.ruleId === 'string' ? message.ruleId : '(parser/configuration)',
    severity: message.severity, message: message.message,
    line: optionalLocation(message.line, 'ESLint line'), column: optionalLocation(message.column, 'ESLint column') };
}

function eslintEntry(raw: unknown): { path: string; findings: Finding[] } {
  const entry = record(raw, 'ESLint result');
  if (typeof entry.filePath !== 'string' || !Array.isArray(entry.messages)) {
    throw new Error('Each ESLint result must contain filePath and messages.');
  }
  return { path: entry.filePath, findings: entry.messages.map(finding).filter(value => value !== null) };
}

export function importEslint(report: Report, filename: string, projectRoot: string): void {
  const data = readJson(filename);
  if (!Array.isArray(data)) throw new Error('ESLint JSON must be an array from eslint --format json.');
  importRecords(report, data.map(eslintEntry), projectRoot, 'ESLint', (file, entry) => { file.findings = entry.findings; });
  report.inputs.eslint = path.basename(filename);
}
