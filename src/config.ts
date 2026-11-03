import fs from 'node:fs';
import path from 'node:path';
import { record, readJson, integer } from './evidence.js';
import { duplicationDefaults, type DuplicationOptions } from './duplication.js';
import { validateCommand, type CommandTask } from './command.js';
import type { LintMode } from './lint.js';

export interface AnalyzerConfig {
  version: 1;
  lint: { mode: LintMode; typed: boolean };
  duplication: DuplicationOptions;
  coverage: CommandTask | null;
  knip: CommandTask | null;
  dependencyCruiser: CommandTask | null;
}

function section(data: Record<string, unknown>, key: string): Record<string, unknown> {
  return data[key] === undefined ? {} : record(data[key], key);
}

function boolean(value: unknown, fallback: boolean, label: string): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw new Error(`${label} must be boolean.`);
  return value;
}

export function lintMode(value: unknown): LintMode {
  if (value === undefined) return 'baseline';
  if (value === 'baseline' || value === 'project' || value === 'off') return value;
  throw new Error('Lint mode must be baseline, project, or off.');
}

function commandTask(raw: unknown, label: string): CommandTask | null {
  if (raw === undefined) return null;
  const task = record(raw, label);
  validateCommand(task.command);
  if (typeof task.report !== 'string' || !task.report) throw new Error(`${label}.report must name the generated JSON file.`);
  return { command: task.command, report: task.report, timeoutMs: integer(task.timeoutMs ?? 300000, `${label}.timeoutMs`, 1),
    successCodes: taskSuccessCodes(task.successCodes, label), stdout: boolean(task.stdout, false, `${label}.stdout`) };
}

function taskSuccessCodes(raw: unknown, label: string): number[] {
  const successCodes = raw ?? [0];
  if (!Array.isArray(successCodes) || !successCodes.length) throw new Error(`${label}.successCodes must be a non-empty integer array.`);
  const codes = successCodes.map(value => integer(value, 'Success exit code', 0));
  if (label === 'coverage' && codes.some(code => code !== 0)) throw new Error('Coverage commands must succeed with exit code 0.');
  return codes;
}

export function readAnalyzerConfig(root: string, filename?: string): AnalyzerConfig {
  const configPath = path.resolve(root, filename ?? 'panopticode.config.json');
  const data = !filename && !fs.existsSync(configPath) ? { version: 1 } : record(readJson(configPath), 'Analyzer configuration');
  if (data.version !== 1) throw new Error('Analyzer configuration version must be 1.');
  const lint = section(data, 'lint');
  const duplication = section(data, 'duplication');
  return { version: 1, lint: { mode: lintMode(lint.mode), typed: boolean(lint.typed, true, 'lint.typed') },
    duplication: { enabled: boolean(duplication.enabled, true, 'duplication.enabled'),
      minLines: integer(duplication.minLines ?? duplicationDefaults.minLines, 'duplication.minLines', 1),
      minTokens: integer(duplication.minTokens ?? duplicationDefaults.minTokens, 'duplication.minTokens', 1) },
    coverage: commandTask(data.coverage, 'coverage'), knip: commandTask(data.knip, 'knip'),
    dependencyCruiser: commandTask(data.dependencyCruiser, 'dependencyCruiser') };
}
