import path from 'node:path';
import type { Report, Supplement } from './model.js';
import { integer, readJson, record } from './evidence.js';
import { importedPass } from './provenance.js';

function text(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string.`);
  return value;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}

function sourcePath(root: string, filename: string): string {
  return path.relative(root, path.resolve(root, filename)).split(path.sep).join('/');
}

function knipIssue(file: string, category: string, raw: unknown): Supplement['findings'][number] {
  const items = Array.isArray(raw) ? raw : [raw];
  const symbols = items.map(value => record(value, 'Knip symbol'));
  const message = symbols.map(symbol => text(symbol.name, 'Knip symbol name')).join(', ');
  const first = symbols[0];
  return { category, file, message, line: first?.line === undefined ? null : integer(first.line, 'Knip line', 1) };
}

function knipIssues(raw: unknown, root: string): Supplement['findings'] {
  const entry = record(raw, 'Knip issue');
  const file = sourcePath(root, text(entry.file, 'Knip file'));
  return Object.entries(entry).filter(([category]) => !['file', 'owners'].includes(category)).flatMap(([category, values]) =>
    knipCategory(file, category, values));
}

function knipCategory(file: string, category: string, values: unknown): Supplement['findings'] {
  if (Array.isArray(values)) return values.map(value => knipIssue(file, category, value));
  if (!['enumMembers', 'classMembers'].includes(category)) throw new Error(`Knip ${category} must be an array.`);
  return Object.entries(record(values, `Knip ${category}`)).flatMap(([parent, members]) =>
    array(members, `Knip ${category}.${parent}`).map(value => {
      const issue = knipIssue(file, category, value);
      return { ...issue, message: `${parent}.${issue.message}` };
    }));
}

export function importKnip(report: Report, filename: string, root: string): void {
  const data = record(readJson(filename), 'Knip JSON');
  const findings = array(data.issues, 'Knip issues').flatMap(value => knipIssues(value, root));
  // Knip 5 also emitted an unused-files array at the top level.
  for (const raw of array(data.files ?? [], 'Knip files')) {
    const file = sourcePath(root, text(raw, 'Unused file'));
    findings.push({ category: 'files', file, message: 'Unused file', line: null });
  }
  report.supplements.push({ tool: 'knip', findings, dependencies: [] });
  importedPass(report, 'knip', path.basename(filename), new Set(findings.map(value => value.file)).size);
}

function cruiserModule(raw: unknown, root: string): Supplement['dependencies'] {
  const module = record(raw, 'dependency-cruiser module');
  const from = sourcePath(root, text(module.source, 'Module source'));
  return array(module.dependencies, 'Module dependencies').map(rawDependency => {
    const dependency = record(rawDependency, 'Dependency');
    return { from, to: text(dependency.resolved, 'Resolved dependency') };
  });
}

function cruiserViolation(raw: unknown, root: string): Supplement['findings'][number] {
  const value = record(raw, 'dependency-cruiser violation');
  const rule = record(value.rule, 'Dependency rule');
  return { category: text(rule.name, 'Rule name'), file: sourcePath(root, text(value.from, 'Violation source')),
    message: `Dependency to ${text(value.to, 'Violation target')}`, line: null };
}

export function importDependencyCruiser(report: Report, filename: string, root: string): void {
  const data = record(readJson(filename), 'dependency-cruiser JSON');
  const modules = array(data.modules, 'dependency-cruiser modules');
  const summary = record(data.summary, 'dependency-cruiser summary');
  const dependencies = modules.flatMap(value => cruiserModule(value, root));
  const findings = array(summary.violations, 'Dependency violations').map(value => cruiserViolation(value, root));
  report.supplements.push({ tool: 'dependency-cruiser', findings, dependencies });
  importedPass(report, 'dependency-cruiser', path.basename(filename), modules.length);
}
