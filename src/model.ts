export interface Coverage {
  covered: number;
  total: number;
}

export interface Finding {
  rule: string;
  severity: 1 | 2;
  message: string;
  line: number | null;
  column: number | null;
}

export interface Unit {
  id: string;
  name: string;
  kind: 'function' | 'module' | 'declarations';
  file: string;
  line: number;
  column: number;
  endLine: number;
  statements: number;
  complexity: number | null;
  /** Statement start lines owned by this unit; excludes nested functions. */
  statementLines: number[];
  coverage: Coverage | null;
}

export interface FileResult {
  path: string;
  units: Unit[];
  coverage: Coverage | null;
  /** null means the supplied lint report did not include this file. */
  findings: Finding[] | null;
}

export interface Report {
  schemaVersion: 1;
  name: string;
  generatedAt: string;
  thresholds: [number, number, number];
  files: FileResult[];
  warnings: string[];
  inputs: { coverage: string | null; eslint: string | null };
  definitions: { size: string; complexity: string; coverage: string; lint: string };
}
