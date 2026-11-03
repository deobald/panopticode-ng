import ts from 'typescript';
import path from 'node:path';
import fs from 'node:fs';
import type { FileResult, Report, Unit } from './model.js';

export interface AnalyzeOptions {
  project: string;
  name?: string;
  thresholds?: [number, number, number];
  excludeDirectory?: string;
}

const ignored = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', 'reports']);
const sourceExtension = /\.(?:[cm]?ts|tsx)$/i;
const declarationExtension = /\.d\.(?:[cm]?ts)$/i;
const slash = (value: string): string => value.split(path.sep).join('/');

function diagnosticText(diagnostic: ts.Diagnostic): string {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
  if (!diagnostic.file || diagnostic.start === undefined) return message;
  const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
  return `${diagnostic.file.fileName}:${position.line + 1}:${position.character + 1}: ${message}`;
}

function executableFunction(node: ts.Node): node is ts.FunctionLikeDeclaration & { body: ts.ConciseBody } {
  return (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)
    || ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node)
    || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) && !!node.body;
}

function statement(node: ts.Node): boolean {
  return ts.isStatement(node) && !ts.isBlock(node) && !ts.isEmptyStatement(node)
    && !ts.isFunctionDeclaration(node) && !ts.isClassDeclaration(node)
    && !ts.isInterfaceDeclaration(node) && !ts.isTypeAliasDeclaration(node)
    && !ts.isImportDeclaration(node) && !ts.isImportEqualsDeclaration(node)
    && !ts.isExportDeclaration(node) && !ts.isModuleDeclaration(node);
}

const logical = new Set([ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.AmpersandAmpersandEqualsToken,
  ts.SyntaxKind.BarBarEqualsToken, ts.SyntaxKind.QuestionQuestionEqualsToken]);

function decision(node: ts.Node): boolean {
  return ts.isIfStatement(node) || ts.isForStatement(node) || ts.isForInStatement(node)
    || ts.isForOfStatement(node) || ts.isWhileStatement(node) || ts.isDoStatement(node)
    || ts.isCaseClause(node) || ts.isCatchClause(node) || ts.isConditionalExpression(node)
    || (ts.isBinaryExpression(node) && logical.has(node.operatorToken.kind))
    || (ts.isParameter(node) && !!node.initializer);
}

function functionName(node: ts.FunctionLikeDeclaration, source: ts.SourceFile): string {
  let name: string;
  if (ts.isConstructorDeclaration(node)) name = 'constructor';
  else if (node.name) name = node.name.getText(source);
  else if (ts.isVariableDeclaration(node.parent) || ts.isPropertyAssignment(node.parent)
    || ts.isPropertyDeclaration(node.parent)) name = node.parent.name.getText(source);
  else if (ts.isBinaryExpression(node.parent) && node.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
    name = node.parent.left.getText(source);
  } else if (ts.isCallExpression(node.parent)) name = `${node.parent.expression.getText(source)} callback`;
  else name = ts.isArrowFunction(node) ? 'arrow' : 'anonymous';
  if (ts.isGetAccessorDeclaration(node)) name = `get ${name}`;
  if (ts.isSetAccessorDeclaration(node)) name = `set ${name}`;
  if (ts.isClassLike(node.parent) && node.parent.name) name = `${node.parent.name.text}.${name}`;
  return name.length > 160 ? `${name.slice(0, 157)}…` : name;
}

export function analyzeSource(text: string, file: string): FileResult {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const parseDiagnostics = (source as ts.SourceFile & { parseDiagnostics: ts.Diagnostic[] }).parseDiagnostics;
  if (parseDiagnostics.length) throw new Error(parseDiagnostics.map(diagnosticText).join('\n'));
  const units: Unit[] = [];

  function unit(node: ts.Node, name: string, kind: Unit['kind']): Unit {
    const start = source.getLineAndCharacterOfPosition(node.getStart(source));
    const end = source.getLineAndCharacterOfPosition(Math.max(node.getStart(source), node.end - 1));
    const result: Unit = {
      id: `${file}:${node.getStart(source)}:${kind}`, name, kind, file,
      line: start.line + 1, column: start.character + 1, endLine: end.line + 1,
      statements: 0, complexity: kind === 'declarations' ? null : 1,
      statementLines: [], coverage: null,
    };
    return result;
  }

  const moduleUnit = unit(source, '(module-level code)', 'module');

  function visit(node: ts.Node, owner: Unit): void {
    if (ts.canHaveModifiers(node) && ts.getModifiers(node)?.some(modifier => modifier.kind === ts.SyntaxKind.DeclareKeyword)) return;
    if (executableFunction(node)) {
      const child = unit(node, functionName(node, source), 'function');
      units.push(child);
      // Computed names and decorators execute in the surrounding context.
      if (node.name && ts.isComputedPropertyName(node.name)) visit(node.name.expression, owner);
      if (ts.canHaveDecorators(node)) for (const decorator of ts.getDecorators(node) ?? []) visit(decorator, owner);
      for (const parameter of node.parameters) visit(parameter, child);
      if (!ts.isBlock(node.body)) {
        child.statements++;
        child.statementLines.push(source.getLineAndCharacterOfPosition(node.body.getStart(source)).line + 1);
      }
      visit(node.body, child);
      child.statementLines = [...new Set(child.statementLines)].sort((a, b) => a - b);
      return;
    }
    // Type syntax has no runtime branches or source statements.
    if (ts.isTypeNode(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)
      || ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node)
      || (ts.isFunctionLike(node) && !executableFunction(node))) return;
    if (statement(node)) {
      owner.statements++;
      owner.statementLines.push(source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1);
    }
    if (decision(node)) owner.complexity = (owner.complexity ?? 1) + 1;
    // Field initializers can contain executable expressions without a statement wrapper.
    if (ts.isPropertyDeclaration(node) && node.initializer) {
      owner.statements++;
      owner.statementLines.push(source.getLineAndCharacterOfPosition(node.initializer.getStart(source)).line + 1);
    }
    ts.forEachChild(node, child => visit(child, owner));
  }
  visit(source, moduleUnit);
  moduleUnit.statementLines = [...new Set(moduleUnit.statementLines)].sort((a, b) => a - b);
  if (moduleUnit.statements > 0) units.unshift(moduleUnit);
  if (!units.length) units.push(unit(source, '(declarations only)', 'declarations'));
  return { path: file, units, coverage: null, findings: null };
}

export function analyze(options: AnalyzeOptions): Report {
  const target = path.resolve(options.project);
  const isDirectory = fs.statSync(target).isDirectory();
  const root = isDirectory ? target : path.dirname(target);
  const config = isDirectory ? ts.findConfigFile(root, ts.sys.fileExists) : target;
  // Do not inherit a tsconfig from a parent repository when scanning a standalone directory.
  const localConfig = config && (config === target || path.dirname(config) === root) ? config : undefined;
  const filenames = new Set<string>();
  const visited = new Set<string>();
  function readConfig(configPath: string): void {
    configPath = path.resolve(configPath);
    if (visited.has(configPath)) return;
    visited.add(configPath);
    const read = ts.readConfigFile(configPath, ts.sys.readFile);
    if (read.error) throw new Error(diagnosticText(read.error));
    const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(configPath), undefined, configPath);
    const errors = parsed.errors.filter(error => error.code !== 18003);
    if (errors.length) throw new Error(errors.map(diagnosticText).join('\n'));
    parsed.fileNames.forEach(file => filenames.add(path.resolve(file)));
    for (const reference of parsed.projectReferences ?? []) {
      const referencePath = ts.resolveProjectReferencePath(reference);
      readConfig(referencePath);
    }
  }
  if (localConfig) readConfig(localConfig);
  else ts.sys.readDirectory(root, ['.ts', '.tsx', '.mts', '.cts'], [...ignored].map(dir => `**/${dir}/**`))
    .forEach(file => filenames.add(path.resolve(file)));

  const warnings: string[] = [];
  const excluded = options.excludeDirectory ? path.resolve(options.excludeDirectory) : null;
  const files: FileResult[] = [];
  for (const filename of [...filenames].sort()) {
    const relative = path.relative(root, filename);
    if (!sourceExtension.test(relative) || declarationExtension.test(relative)) continue;
    if (relative.split(path.sep).some(part => ignored.has(part))) continue;
    if (excluded && (filename === excluded || filename.startsWith(excluded + path.sep))) continue;
    if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
      warnings.push(`Skipped source outside project root: ${filename}`);
      continue;
    }
    files.push(analyzeSource(fs.readFileSync(filename, 'utf8'), slash(relative)));
  }
  if (!files.length) throw new Error(`No TypeScript source files found in ${root}`);
  const thresholds = options.thresholds ?? [6, 10, 25];
  if (thresholds.length !== 3 || thresholds.some((n, i) => !Number.isInteger(n) || n < 2 || (i > 0 && n <= thresholds[i - 1]!))) {
    throw new Error('Complexity thresholds must be three increasing integers of at least 2.');
  }
  return {
    schemaVersion: 1, name: options.name ?? path.basename(root), generatedAt: new Date().toISOString(),
    thresholds, files, warnings, inputs: { coverage: null, eslint: null },
    definitions: {
      size: 'Executable AST statements, excluding blocks, empty statements, imports and type/function/class declarations. Expression-bodied arrows and field initializers add one. Nested bodies belong to their own function. Empty units receive minimum display area of one.',
      complexity: 'One plus if, loops, non-default switch cases, catch, ternary expressions, logical && / || / ?? (including assignments), and default parameters. Nested functions are independent. Optional chaining is not counted. Module-level branches are shown separately. Not a control-flow or type-aware analysis.',
      coverage: 'Imported Istanbul statement-start line coverage: a line is covered if any mapped statement starting there ran. File totals use all mapped lines; function totals intersect those lines with owned statement start lines. Functions sharing a source line can share its coverage. This is not branch coverage or proof of correctness.',
      lint: 'Imported ESLint messages using the producing project’s rule policy. Counts describe findings, not a quality score. Missing report entries are unknown, not clean.',
    },
  };
}
