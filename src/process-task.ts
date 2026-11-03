import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import type { CommandTask } from './command.js';

function terminate(child: ChildProcess): void {
  if (process.platform === 'win32' || !child.pid) { child.kill('SIGKILL'); return; }
  try { process.kill(-child.pid, 'SIGKILL'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
}

function outputFile(child: ChildProcess, filename: string | null): Promise<void> {
  if (!filename) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(filename);
    let failure: Error | null = null;
    output.once('error', error => { failure = error; terminate(child); });
    child.once('error', error => { failure = error; output.destroy(); });
    output.once('close', () => { if (failure) reject(failure); else resolve(); });
    child.stdout!.pipe(output);
  });
}

export async function executeCommand(task: CommandTask, root: string, stdoutFile: string | null): Promise<void> {
  const env = { ...process.env };
  // A calling Node test harness must not suppress the target project's tests.
  delete env.NODE_TEST_CONTEXT;
  const child = spawn(task.command[0]!, task.command.slice(1), { cwd: root, shell: false,
    env, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  const collect = (data: Buffer): void => { output = (output + data.toString()).slice(-12000); };
  child.stdout!.on('data', collect);
  child.stderr!.on('data', collect);
  const completion = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { terminate(child); reject(new Error(`Command timed out: ${task.command.join(' ')}`)); }, task.timeoutMs);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => {
      clearTimeout(timer);
      if (code === null || !(task.successCodes ?? [0]).includes(code)) reject(new Error(`Command exited ${code}: ${task.command.join(' ')}\n${output}`));
      else resolve();
    });
  });
  const results = await Promise.allSettled([completion, outputFile(child, stdoutFile)]);
  for (const result of results) if (result.status === 'rejected') throw result.reason;
}
