import fs from 'node:fs';
import path from 'node:path';
import type { CommandTask } from './command.js';
import type { Report } from './model.js';
import { toolBinary } from './provenance.js';

export interface TaskContext { root: string; project: string; artifacts: string; report: Report }

function projectPackage(root: string): { scripts?: Record<string, string>; packageManager?: string } {
  const filename = path.join(root, 'package.json');
  return fs.existsSync(filename) ? JSON.parse(fs.readFileSync(filename, 'utf8')) : {};
}

function scriptCommand(root: string, script: string): string[] {
  const manager = projectPackage(root).packageManager?.split('@')[0] ?? 'npm';
  if (!['npm', 'pnpm', 'yarn', 'bun'].includes(manager)) throw new Error(`Unsupported package manager: ${manager}`);
  return [manager, 'run', script];
}

export function selectedTsconfig(context: TaskContext): string | null {
  const selected = path.resolve(context.project);
  if (fs.statSync(selected).isFile()) return selected;
  const filename = path.join(context.root, 'tsconfig.json');
  return fs.existsSync(filename) ? filename : null;
}

export function defaultCoverage(context: TaskContext): CommandTask {
  const scripts = projectPackage(context.root).scripts ?? {};
  const script = ['test:coverage', 'coverage'].find(name => scripts[name]);
  if (script) return { command: scriptCommand(context.root, script), report: 'coverage/coverage-final.json', timeoutMs: 300000 };
  if (!scripts.test) throw new Error('No test:coverage, coverage, or test script found. Configure coverage.command or use --no-coverage.');
  const config = path.join(context.artifacts, 'c8.json');
  const directory = path.join(context.artifacts, 'coverage');
  fs.mkdirSync(context.artifacts, { recursive: true });
  fs.writeFileSync(config, JSON.stringify({ all: true, src: [context.root], include: context.report.files.map(file => file.path),
    extension: ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'], excludeAfterRemap: true,
    reporter: ['json'], reportsDirectory: directory }));
  return { command: [process.execPath, toolBinary('c8', 'c8'), '--config', config,
    '--reporter=json', '--reports-dir', directory, ...scriptCommand(context.root, 'test')],
    report: path.join(directory, 'coverage-final.json'), timeoutMs: 300000, tool: 'c8' };
}

export function coverageScriptTask(context: TaskContext, script: string, report?: string): CommandTask {
  return { command: scriptCommand(context.root, script), report: report ?? 'coverage/coverage-final.json', timeoutMs: 300000 };
}

export function defaultKnip(context: TaskContext): CommandTask {
  const config = selectedTsconfig(context);
  const args = ['--directory', context.root, '--reporter', 'json', '--no-progress', '--no-config-hints', '--no-exit-code'];
  if (config) args.push('--tsConfig', config, '--use-tsconfig-files');
  return { command: [process.execPath, toolBinary('knip', 'knip'), ...args],
    report: path.join(context.artifacts, 'knip.json'), timeoutMs: 300000, stdout: true, tool: 'knip' };
}

function architectureConfig(context: TaskContext, binary: string): string {
  const candidates = ['.dependency-cruiser.cjs', '.dependency-cruiser.mjs', '.dependency-cruiser.js',
    '.dependency-cruiser.json', '.dependency-cruiser.ts', '.dependency-cruiser.cts', '.dependency-cruiser.mts'];
  const projectConfig = candidates.map(name => path.join(context.root, name)).find(filename => fs.existsSync(filename));
  return projectConfig ?? path.resolve(path.dirname(binary), '../configs/recommended-warn-only.cjs');
}

export function defaultDependencyCruiser(context: TaskContext): CommandTask {
  const binary = toolBinary('dependency-cruiser', 'dependency-cruiser');
  const args = ['--output-type', 'json', '--config', architectureConfig(context, binary), '--do-not-follow', 'node_modules'];
  const config = selectedTsconfig(context);
  if (config) args.push('--ts-config', config);
  return { command: [process.execPath, binary, ...args, ...context.report.files.map(file => file.path)],
    report: path.join(context.artifacts, 'dependencies.json'), timeoutMs: 300000,
    stdout: true, successCodes: [0, 1], tool: 'dependency-cruiser' };
}
