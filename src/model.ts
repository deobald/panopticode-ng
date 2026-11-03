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
  endLine?: number | null;
  endColumn?: number | null;
}

export interface Measurements {
  physicalLines: number;
  parameterCount: number | null;
  maxNestingDepth: number | null;
  custom: Record<string, number>;
}

export interface ClassStructure {
  id: string;
  name: string;
  line: number;
  column: number;
  endLine: number;
  methods: number;
  constructors: number;
  properties: number;
  getters: number;
  setters: number;
  extends: string | null;
  implements: string[];
  abstract: boolean;
  custom: Record<string, number>;
}

export interface AnalyzerRun {
  id: string;
  version: string;
  configuration: { id: string; version: number; options: Record<string, unknown> };
  status: 'complete' | 'imported' | 'skipped' | 'failed';
  files: number;
  durationMs: number;
  detail?: string;
}

export interface SourceRange {
  file: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}

export interface DuplicateBlock {
  id: string;
  first: SourceRange;
  second: SourceRange;
  tokens: number;
  lines: number;
}

export interface Supplement {
  tool: 'knip' | 'dependency-cruiser';
  findings: { category: string; file: string; message: string; line: number | null }[];
  dependencies: { from: string; to: string }[];
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
  measurements: Measurements;
}

export interface FileResult {
  path: string;
  units: Unit[];
  coverage: Coverage | null;
  /** null means the supplied lint report did not include this file. */
  findings: Finding[] | null;
  classes: ClassStructure[];
  measurements: { physicalLines: number; duplicatedLines: number | null; custom: Record<string, number> };
}

export interface Report {
  schemaVersion: 2;
  name: string;
  generatedAt: string;
  thresholds: [number, number, number];
  files: FileResult[];
  warnings: string[];
  inputs: { coverage: string | null; eslint: string | null };
  definitions: { size: string; complexity: string; coverage: string; lint: string;
    nesting: string; structure: string; duplication: string; custom: string };
  analyzers: AnalyzerRun[];
  duplicates: DuplicateBlock[] | null;
  supplements: Supplement[];
}
