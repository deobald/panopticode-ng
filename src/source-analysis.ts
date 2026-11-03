import { Node, Project, ScriptTarget, type SourceFile } from 'ts-morph';
import type { FileResult, Unit } from './model.js';
import { executableFunction, functionName, isDeclared, isDecision, isStatement, isTypeOnly, type ExecutableFunction } from './syntax.js';
import { diagnosticText } from './discovery.js';
import { classStructures, fileLines, nestingDepth, unitMeasurements } from './measurements.js';
import { customValues, type CustomMetric } from './custom-metrics.js';

export function parsingProject(): Project {
  return new Project({ useInMemoryFileSystem: true, skipLoadingLibFiles: true,
    skipFileDependencyResolution: true, compilerOptions: { target: ScriptTarget.Latest, noLib: true, allowJs: true } });
}

class SourceAnalysis {
  private readonly units: Unit[] = [];
  constructor(private readonly source: SourceFile, private readonly file: string, private readonly metrics: CustomMetric[]) {}

  run(): FileResult {
    const diagnostics = this.source.getProject().getProgram().getSyntacticDiagnostics(this.source);
    if (diagnostics.length) throw new Error(diagnostics.map(value => diagnosticText(value.compilerObject)).join('\n'));
    const moduleUnit = this.unit(this.source, '(module-level code)', 'module');
    this.visit(this.source, moduleUnit);
    this.finish(moduleUnit);
    if (moduleUnit.statements > 0) this.units.unshift(moduleUnit);
    if (!this.units.length) this.units.push(this.unit(this.source, '(declarations only)', 'declarations'));
    return { path: this.file, units: this.units, coverage: null, findings: null,
      classes: classStructures(this.source, this.file, this.metrics),
      measurements: { physicalLines: fileLines(this.source), duplicatedLines: null,
        custom: customValues(this.metrics, this.source, 'file', this.file) } };
  }

  private unit(node: Node, name: string, kind: Unit['kind']): Unit {
    const start = this.source.getLineAndColumnAtPos(node.getStart());
    const end = this.source.getLineAndColumnAtPos(Math.max(node.getStart(), node.getEnd() - 1));
    return { id: `${this.file}:${node.getStart()}:${kind}`, name, kind, file: this.file,
      line: start.line, column: start.column, endLine: end.line,
      statements: 0, complexity: kind === 'declarations' ? null : 1, statementLines: [], coverage: null,
      measurements: unitMeasurements(node, kind !== 'declarations', this.metrics, this.file) };
  }

  private addStatement(node: Node, owner: Unit): void {
    owner.statements++;
    owner.statementLines.push(node.getStartLineNumber());
  }

  private finish(owner: Unit): void {
    owner.statementLines = [...new Set(owner.statementLines)].sort((a, b) => a - b);
  }

  private visit(node: Node, owner: Unit, depth = 0): void {
    if (isDeclared(node)) return;
    if (executableFunction(node)) { this.visitFunction(node, owner); return; }
    if (isTypeOnly(node)) return;
    this.measure(node, owner);
    const childDepth = nestingDepth(node, depth);
    owner.measurements.maxNestingDepth = Math.max(owner.measurements.maxNestingDepth ?? 0, childDepth);
    node.forEachChild(child => { this.visit(child, owner, childDepth); });
  }

  private measure(node: Node, owner: Unit): void {
    if (isStatement(node)) this.addStatement(node, owner);
    if (isDecision(node)) owner.complexity = (owner.complexity ?? 1) + 1;
    if (Node.isPropertyDeclaration(node)) {
      const initializer = node.getInitializer();
      if (initializer) this.addStatement(initializer, owner);
    }
  }

  private visitFunction(node: ExecutableFunction, owner: Unit): void {
    const child = this.unit(node, functionName(node), 'function');
    this.units.push(child);
    this.visitDefinitionContext(node, owner);
    for (const parameter of node.getParameters()) this.visit(parameter, child);
    const body = node.getBody();
    if (!Node.isBlock(body)) this.addStatement(body, child);
    this.visit(body, child);
    this.finish(child);
  }

  private visitDefinitionContext(node: ExecutableFunction, owner: Unit): void {
    if (Node.hasName(node)) {
      const name = node.getNameNode();
      if (Node.isComputedPropertyName(name)) this.visit(name.getExpression(), owner);
    }
    if (Node.isDecoratable(node)) for (const decorator of node.getDecorators()) this.visit(decorator, owner);
  }
}

export function analyzeSourceFile(source: SourceFile, file: string, metrics: CustomMetric[] = []): FileResult {
  return new SourceAnalysis(source, file, metrics).run();
}

export function analyzeSource(text: string, file: string): FileResult {
  return analyzeSourceFile(parsingProject().createSourceFile(file, text), file);
}
