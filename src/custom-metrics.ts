import type { Node } from 'ts-morph';

export interface CustomMetric {
  id: string;
  version: number;
  description: string;
  /** Return null for entities to which the metric does not apply. */
  measure(node: Node, context: { kind: 'function' | 'class' | 'file'; file: string }): number | null;
}

export function validateMetrics(metrics: CustomMetric[]): void {
  const ids = new Set<string>();
  for (const metric of metrics) {
    if (!/^[a-z][a-z0-9.-]*$/.test(metric.id) || ids.has(metric.id)) throw new Error(`Invalid or duplicate custom metric ID: ${metric.id}`);
    if (!Number.isInteger(metric.version) || metric.version < 1) throw new Error(`Invalid version for metric ${metric.id}`);
    if (typeof metric.description !== 'string' || typeof metric.measure !== 'function') throw new Error(`Invalid custom metric ${metric.id}`);
    ids.add(metric.id);
  }
}

export function customValues(metrics: CustomMetric[], node: Node, kind: 'function' | 'class' | 'file', file: string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const metric of metrics) {
    const value = metric.measure(node, { kind, file });
    if (value === null) continue;
    if (!Number.isFinite(value)) throw new Error(`Custom metric ${metric.id} returned a non-finite value for ${file}`);
    result[metric.id] = value;
  }
  return result;
}
