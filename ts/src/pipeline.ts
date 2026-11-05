import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { analyze, type AnalyzeOptions } from './analyze.js';
import { readAnalyzerConfig, type AnalyzerConfig } from './config.js';
import { projectRoot } from './discovery.js';
import { runLint, type LintMode } from './lint.js';
import { runDuplication } from './duplication.js';
import { importCoverage, importEslint } from './imports.js';
import { importDependencyCruiser, importKnip } from './supplements.js';
import { runCommand, type CommandTask } from './command.js';
import { recordPass, toolVersion } from './provenance.js';
import { defaultCoverage, coverageScriptTask, defaultKnip, defaultDependencyCruiser, type TaskContext } from './default-tasks.js';
import { attemptPass, skippedPass } from './passes.js';
import type { Report } from './model.js';
import type { CustomMetric } from './custom-metrics.js';

export interface RunOptions extends AnalyzeOptions {
  config?: string;
  lintMode?: LintMode;
  typedLint?: boolean;
  noTypedLint?: boolean;
  noLint?: boolean;
  noCoverage?: boolean;
  noKnip?: boolean;
  noDependencyCruiser?: boolean;
  noDuplication?: boolean;
  coverage?: string;
  eslint?: string;
  /** @deprecated Coverage is enabled by default; use noCoverage to disable it. */
  runCoverage?: boolean;
  coverageScript?: string;
  metricsModule?: string;
  knip?: string;
  dependencyCruiser?: string;
  /** @deprecated Knip is enabled by default; use noKnip to disable it. */
  runKnip?: boolean;
  /** @deprecated Architecture analysis is enabled by default; use noDependencyCruiser. */
  runDependencyCruiser?: boolean;
}

async function executeTask(report: Report, id: string, task: CommandTask | null, root: string): Promise<string> {
  if (!task) throw new Error(`Configure a ${id} command and JSON report path first.`);
  const started = performance.now();
  const filename = await runCommand(task, root);
  recordPass(report, { id: `${id}-command`, version: task.tool ? toolVersion(task.tool) : 'project-defined', status: 'complete', files: report.files.length,
    durationMs: performance.now() - started, configuration: { id: 'project-command', version: 1, options: { ...task } } });
  return filename;
}

async function coveragePass(report: Report, options: RunOptions, config: AnalyzerConfig, context: TaskContext): Promise<void> {
  if (options.noCoverage) { skippedPass(report, 'coverage', '--no-coverage'); return; }
  if (options.coverage && !options.coverageScript) { importCoverage(report, path.resolve(options.coverage), context.root); return; }
  const task = options.coverageScript ? coverageScriptTask(context, options.coverageScript, options.coverage)
    : config.coverage ?? defaultCoverage(context);
  const filename = await executeTask(report, 'coverage', task, context.root);
  importCoverage(report, filename, context.root);
}

async function lintPass(report: Report, options: RunOptions, config: AnalyzerConfig, root: string): Promise<void> {
  if (options.noLint) { skippedPass(report, 'eslint', '--no-lint'); return; }
  if (options.eslint) { importEslint(report, path.resolve(options.eslint), root); return; }
  const mode = options.lintMode ?? config.lint.mode;
  if (mode === 'off') { skippedPass(report, 'eslint', '--no-lint'); return; }
  const typed = !options.noTypedLint && (options.typedLint ?? config.lint.typed);
  await runLint(report, root, mode, typed);
}

async function supplementalPasses(report: Report, options: RunOptions, config: AnalyzerConfig, context: TaskContext): Promise<void> {
  const adapters = [
    { id: 'knip', disabled: options.noKnip, filename: options.knip, task: config.knip,
      fallback: defaultKnip, import: importKnip, flag: '--no-knip' },
    { id: 'dependency-cruiser', disabled: options.noDependencyCruiser, filename: options.dependencyCruiser,
      task: config.dependencyCruiser, fallback: defaultDependencyCruiser, import: importDependencyCruiser, flag: '--no-dep-cruiser' },
  ];
  for (const adapter of adapters) {
    if (adapter.disabled) { skippedPass(report, adapter.id, adapter.flag); continue; }
    await attemptPass(report, adapter.id, async () => {
      const task = adapter.filename ? null : adapter.task ?? adapter.fallback(context);
      const filename = adapter.filename ?? await executeTask(report, adapter.id, task, context.root);
      adapter.import(report, path.resolve(filename), context.root);
      if (task?.tool) {
        const imported = report.analyzers.at(-1)!;
        imported.version = toolVersion(task.tool);
        imported.status = 'complete';
      }
    });
  }
}

async function pluginMetrics(options: RunOptions): Promise<CustomMetric[]> {
  if (!options.metricsModule) return options.customMetrics ?? [];
  const module = await import(pathToFileURL(path.resolve(options.metricsModule)).href) as { default: CustomMetric[] };
  if (!Array.isArray(module.default)) throw new Error('Metrics module must default-export an array of custom metric definitions.');
  return module.default;
}

export async function runProject(options: RunOptions): Promise<Report> {
  const root = projectRoot(options.project);
  const config = readAnalyzerConfig(root, options.config);
  const report = analyze({ ...options, customMetrics: await pluginMetrics(options) });
  const context: TaskContext = { root, project: options.project, report,
    artifacts: path.join(path.resolve(options.excludeDirectory ?? path.join(root, 'reports/panopticode')), 'analyzers') };
  // Separate sequential passes: typescript-eslint owns its own program/project service.
  await attemptPass(report, 'coverage', () => coveragePass(report, options, config, context));
  await attemptPass(report, 'eslint', () => lintPass(report, options, config, root));
  await attemptPass(report, 'jscpd', async () => {
    const duplication = { ...config.duplication, enabled: config.duplication.enabled && !options.noDuplication };
    if (!duplication.enabled) { skippedPass(report, 'jscpd', '--no-duplication'); return; }
    await runDuplication(report, root, duplication);
  });
  await supplementalPasses(report, options, config, context);
  return report;
}
