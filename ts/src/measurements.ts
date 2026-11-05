import { Node, SyntaxKind, type SourceFile } from 'ts-morph';
import type { ClassStructure, Measurements } from './model.js';
import { customValues, type CustomMetric } from './custom-metrics.js';
import { isDeclared } from './syntax.js';

const nesting = new Set([
  SyntaxKind.IfStatement, SyntaxKind.ForStatement, SyntaxKind.ForInStatement,
  SyntaxKind.ForOfStatement, SyntaxKind.WhileStatement, SyntaxKind.DoStatement,
  SyntaxKind.SwitchStatement, SyntaxKind.TryStatement, SyntaxKind.CatchClause,
  SyntaxKind.ConditionalExpression,
]);

export function nestingDepth(node: Node, depth: number): number {
  return depth + Number(nesting.has(node.getKind()));
}

export function unitMeasurements(node: Node, executable: boolean, metrics: CustomMetric[], file: string): Measurements {
  const start = node.getStartLineNumber();
  const end = node.getSourceFile().getLineAndColumnAtPos(Math.max(node.getStart(), node.getEnd() - 1)).line;
  const parameters = Node.isFunctionLikeDeclaration(node) ? node.getParameters().length : null;
  return { physicalLines: end - start + 1, parameterCount: parameters,
    maxNestingDepth: executable ? 0 : null,
    custom: Node.isFunctionLikeDeclaration(node) ? customValues(metrics, node, 'function', file) : {} };
}

export function fileLines(source: SourceFile): number {
  const text = source.getFullText();
  if (!text.length) return 0;
  return text.split(/\r\n|\r|\n/).length - Number(/[\r\n]$/.test(text));
}

export function classStructures(source: SourceFile, file: string, metrics: CustomMetric[]): ClassStructure[] {
  const classes = source.getDescendants().filter(node => Node.isClassDeclaration(node) || Node.isClassExpression(node));
  return classes.filter(node => ![node, ...node.getAncestors()].some(isDeclared)).map(node => {
    const start = source.getLineAndColumnAtPos(node.getStart());
    return { id: `${file}:${node.getStart()}:class`, name: node.getName() ?? '(anonymous class)',
      line: start.line, column: start.column, endLine: source.getLineAndColumnAtPos(node.getEnd() - 1).line,
      methods: node.getMethods().length, constructors: node.getConstructors().length,
      properties: node.getProperties().length, getters: node.getGetAccessors().length,
      setters: node.getSetAccessors().length, extends: node.getExtends()?.getText() ?? null,
      implements: node.getImplements().map(value => value.getText()), abstract: node.hasModifier(SyntaxKind.AbstractKeyword),
      custom: customValues(metrics, node, 'class', file) };
  });
}
