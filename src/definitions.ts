import type { Report } from './model.js';

export const definitions: Report['definitions'] = {
  size: 'Executable AST statements, excluding blocks, empty statements, imports and type/function/class declarations. Expression-bodied arrows and field initializers add one. Nested bodies belong to their own function. Empty units receive minimum display area of one.',
  complexity: 'One plus if, loops, non-default switch cases, catch, ternary expressions, logical && / || / ?? (including assignments), and default parameters. Nested functions are independent. Optional chaining is not counted. Module-level branches are shown separately. Not a control-flow or type-aware analysis.',
  coverage: 'Imported Istanbul statement-start line coverage: a line is covered if any mapped statement starting there ran. File totals use all mapped lines; function totals intersect those lines with owned statement start lines. Functions sharing a source line can share its coverage. This is not branch coverage or proof of correctness.',
  lint: 'Imported ESLint messages using the producing project’s rule policy. Counts describe findings, not a quality score. Missing report entries are unknown, not clean.',
};
