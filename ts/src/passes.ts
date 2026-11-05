import type { Report } from './model.js';
import { recordPass } from './provenance.js';

export function skippedPass(report: Report, id: string, flag: string): void {
  recordPass(report, { id, version: 'not run', status: 'skipped', files: 0, durationMs: 0,
    configuration: { id: 'disabled', version: 2, options: {} }, detail: `Disabled by ${flag} or analyzer configuration.` });
}

export async function attemptPass(report: Report, id: string, run: () => Promise<void>): Promise<void> {
  const started = performance.now();
  try { await run(); }
  catch (error) {
    const detail = (error as Error).message;
    report.warnings.push(`${id} failed: ${detail}`);
    recordPass(report, { id, version: 'unavailable', status: 'failed', files: 0, durationMs: performance.now() - started,
      configuration: { id: 'default-enabled', version: 2, options: {} }, detail });
  }
}
