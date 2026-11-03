import { Node, SyntaxKind, type FunctionLikeDeclaration } from 'ts-morph';

const nonStatements = new Set([
  SyntaxKind.Block, SyntaxKind.EmptyStatement, SyntaxKind.FunctionDeclaration,
  SyntaxKind.ClassDeclaration, SyntaxKind.InterfaceDeclaration, SyntaxKind.TypeAliasDeclaration,
  SyntaxKind.ImportDeclaration, SyntaxKind.ImportEqualsDeclaration,
  SyntaxKind.ExportDeclaration, SyntaxKind.ModuleDeclaration,
]);
const decisions = new Set([
  SyntaxKind.IfStatement, SyntaxKind.ForStatement, SyntaxKind.ForInStatement,
  SyntaxKind.ForOfStatement, SyntaxKind.WhileStatement, SyntaxKind.DoStatement,
  SyntaxKind.CaseClause, SyntaxKind.CatchClause, SyntaxKind.ConditionalExpression,
]);
const logical = new Set([
  SyntaxKind.AmpersandAmpersandToken, SyntaxKind.BarBarToken, SyntaxKind.QuestionQuestionToken,
  SyntaxKind.AmpersandAmpersandEqualsToken, SyntaxKind.BarBarEqualsToken, SyntaxKind.QuestionQuestionEqualsToken,
]);
const typeDeclarations = new Set([
  SyntaxKind.InterfaceDeclaration, SyntaxKind.TypeAliasDeclaration,
  SyntaxKind.ImportDeclaration, SyntaxKind.ImportEqualsDeclaration,
]);

export type ExecutableFunction = Node & FunctionLikeDeclaration & { getBody(): Node };

export function executableFunction(node: Node): node is ExecutableFunction {
  return Node.isFunctionLikeDeclaration(node) && Node.hasBody(node);
}

export function isStatement(node: Node): boolean {
  return Node.isStatement(node) && !nonStatements.has(node.getKind());
}

export function isDecision(node: Node): boolean {
  if (decisions.has(node.getKind())) return true;
  if (Node.isBinaryExpression(node)) return logical.has(node.getOperatorToken().getKind());
  return Node.isParameterDeclaration(node) && node.getInitializer() !== undefined;
}

export function isTypeOnly(node: Node): boolean {
  if (Node.isTypeNode(node)) return true;
  if (typeDeclarations.has(node.getKind())) return true;
  return Node.isFunctionLikeDeclaration(node) && !executableFunction(node);
}

export function isDeclared(node: Node): boolean {
  return Node.isModifierable(node) && node.hasModifier(SyntaxKind.DeclareKeyword);
}

function assignedName(parent: Node | undefined): string | undefined {
  if (!parent) return undefined;
  if (Node.isVariableDeclaration(parent) || Node.isPropertyAssignment(parent) || Node.isPropertyDeclaration(parent)) return parent.getNameNode().getText();
  if (Node.isBinaryExpression(parent) && parent.getOperatorToken().getKind() === SyntaxKind.EqualsToken) return parent.getLeft().getText();
  if (Node.isCallExpression(parent)) return `${parent.getExpression().getText()} callback`;
  return undefined;
}

function baseName(node: ExecutableFunction): string {
  if (Node.isConstructorDeclaration(node)) return 'constructor';
  if (Node.hasName(node)) {
    const name = node.getNameNode();
    if (name) return name.getText();
  }
  return assignedName(node.getParent()) ?? (Node.isArrowFunction(node) ? 'arrow' : 'anonymous');
}

export function functionName(node: ExecutableFunction): string {
  let name = baseName(node);
  if (Node.isGetAccessorDeclaration(node)) name = `get ${name}`;
  if (Node.isSetAccessorDeclaration(node)) name = `set ${name}`;
  const parent = node.getParent();
  if (Node.isClassDeclaration(parent) || Node.isClassExpression(parent)) {
    const className = parent.getName();
    if (className) name = `${className}.${name}`;
  }
  return name.length > 160 ? `${name.slice(0, 157)}…` : name;
}
