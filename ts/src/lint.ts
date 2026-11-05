import path from 'node:path';
import { createHash } from 'node:crypto';
import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import type { Linter } from 'eslint';
import type { Finding, Report } from './model.js';
import { baselineConfig, lintProfile } from './lint-profile.js';
import { recordPass, toolVersion } from './provenance.js';

export type LintMode = 'baseline' | 'project' | 'off';

function lintMessage(message: ESLint.LintResult['messages'][number]): Finding {
  return { rule: message.ruleId ?? '(parser/configuration)', severity: message.severity,
    message: message.message, line: message.line ?? null, column: message.column ?? null,
    endLine: message.endLine ?? null, endColumn: message.endColumn ?? null };
}

function lintEngine(root: string, mode: LintMode, typed: boolean): ESLint {
  if (mode === 'project') return new ESLint({ cwd: root, fix: false,
    ...(typed ? {} : { overrideConfig: tseslint.configs.disableTypeChecked as Linter.Config }) });
  return new ESLint({ cwd: root, fix: false, overrideConfigFile: true, overrideConfig: baselineConfig(root, typed),
    ignore: false, allowInlineConfig: false });
}

async function configurationHashes(engine: ESLint, filenames: string[]): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const file of filenames) {
    const config = await engine.calculateConfigForFile(file) as { rules?: unknown; plugins?: Record<string, { meta?: unknown }> } | undefined;
    const plugins = Object.entries(config?.plugins ?? {}).map(([id, plugin]) => ({ id, meta: plugin.meta }));
    const snapshot = JSON.stringify({ rules: config?.rules, plugins });
    result[file] = createHash('sha256').update(snapshot).digest('hex');
  }
  return result;
}

export async function runLint(report: Report, root: string, mode: LintMode, typed: boolean): Promise<void> {
  const start = performance.now();
  if (mode === 'off') return;
  const engine = lintEngine(root, mode, typed);
  const filenames = report.files.map(file => path.resolve(root, file.path));
  const hashes = await configurationHashes(engine, filenames);
  const results = await engine.lintFiles(filenames);
  const byPath = new Map(results.map(result => [path.resolve(result.filePath), result]));
  for (const file of report.files) {
    const result = byPath.get(path.resolve(root, file.path));
    if (result) file.findings = result.messages.map(lintMessage);
  }
  const failed = results.some(result => result.fatalErrorCount > 0);
  if (failed) report.warnings.push('ESLint reported parser/configuration errors; inspect its findings.');
  recordPass(report, { id: 'eslint', version: toolVersion('eslint'), status: failed ? 'failed' : 'complete',
    files: results.length, durationMs: performance.now() - start,
    configuration: { id: mode === 'project' ? 'project-eslint-config' : lintProfile.id, version: lintProfile.version,
      options: { typed, mode, typescriptEslint: toolVersion('typescript-eslint'), sonarjs: toolVersion('eslint-plugin-sonarjs'),
        inlineConfig: mode === 'project', fixes: false, ruleConfigurationHashes: hashes } } });
}
