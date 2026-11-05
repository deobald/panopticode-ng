import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { executeCommand } from './process-task.js';

export interface CommandTask {
  command: string[];
  report: string;
  timeoutMs: number;
  successCodes?: number[];
  stdout?: boolean;
  tool?: string;
}

export function validateCommand(command: unknown): asserts command is string[] {
  if (!Array.isArray(command) || !command.length || command.some(value => typeof value !== 'string' || !value.length)) {
    throw new Error('Commands must be non-empty arrays of non-empty strings; no shell is used.');
  }
}

export async function runCommand(task: CommandTask, root: string): Promise<string> {
  validateCommand(task.command);
  const report = path.resolve(root, task.report);
  const previous = fs.existsSync(report) ? fs.statSync(report) : null;
  const temporary = task.stdout ? `${report}.${randomUUID()}.tmp` : null;
  if (temporary) fs.mkdirSync(path.dirname(report), { recursive: true });
  try {
    await executeCommand(task, root, temporary);
    if (temporary) fs.renameSync(temporary, report);
  } finally { if (temporary && fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  assertFreshReport(report, previous);
  return report;
}

function assertFreshReport(report: string, previous: fs.Stats | null): void {
  const current = fs.existsSync(report) ? fs.statSync(report) : null;
  if (!current || (previous && current.mtimeMs === previous.mtimeMs && current.ctimeMs === previous.ctimeMs)) {
    throw new Error(`Command did not produce a fresh report: ${report}`);
  }
}
