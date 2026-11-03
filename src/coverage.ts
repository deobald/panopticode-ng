import path from 'node:path';
import type { Coverage, Report } from './model.js';
import { importRecords, integer, readJson, record } from './evidence.js';

function summarize(lines: Iterable<number>): Coverage | null {
  const values = [...lines];
  return values.length ? { total: values.length, covered: values.filter(hits => hits > 0).length } : null;
}

function coverageEntry(key: string, raw: unknown): { path: string; lines: Map<number, number> } {
  const entry = record(raw, `Coverage entry ${key}`);
  const statements = record(entry.statementMap, `${key}.statementMap (use coverage-final.json, not coverage-summary.json)`);
  const hits = record(entry.s, `${key}.s`);
  const lines = new Map<number, number>();
  for (const [id, rawLocation] of Object.entries(statements)) {
    const location = record(rawLocation, `${key}.statementMap.${id}`);
    const start = record(location.start, `Statement ${id} start`);
    const line = integer(start.line, `Statement ${id} line`, 1);
    const executions = integer(hits[id], `Statement ${id} execution count`);
    lines.set(line, Math.max(lines.get(line) ?? 0, executions));
  }
  return { path: typeof entry.path === 'string' ? entry.path : key, lines };
}

export function importCoverage(report: Report, filename: string, projectRoot: string): void {
  const data = record(readJson(filename), 'Istanbul coverage JSON');
  const records = Object.entries(data).map(([key, value]) => coverageEntry(key, value));
  importRecords(report, records, projectRoot, 'Coverage', (file, entry) => {
    file.coverage = summarize(entry.lines.values());
    for (const unit of file.units) {
      unit.coverage = summarize(unit.statementLines.filter(line => entry.lines.has(line)).map(line => entry.lines.get(line)!));
    }
  });
  report.inputs.coverage = path.basename(filename);
}
