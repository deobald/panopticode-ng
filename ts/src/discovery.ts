import { ts } from 'ts-morph';
import path from 'node:path';
import fs from 'node:fs';

const ignored = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', 'reports']);
const extensions = ['.ts', '.tsx', '.mts', '.cts'];
const sourceExtension = /\.(?:[cm]?[jt]s|[jt]sx)$/i;
const declarationExtension = /\.d\.(?:[cm]?ts)$/i;

export function diagnosticText(diagnostic: ts.Diagnostic): string {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
  if (!diagnostic.file || diagnostic.start === undefined) return message;
  const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
  return `${diagnostic.file.fileName}:${position.line + 1}:${position.character + 1}: ${message}`;
}

export function projectRoot(project: string): string {
  const target = path.resolve(project);
  return fs.statSync(target).isDirectory() ? target : path.dirname(target);
}

function localConfig(target: string, root: string): string | undefined {
  if (target !== root) return target;
  const config = path.join(root, 'tsconfig.json');
  return ts.sys.fileExists(config) ? config : undefined;
}

function configurationFiles(config: string, visited = new Set<string>()): string[] {
  config = path.resolve(config);
  if (visited.has(config)) return [];
  visited.add(config);
  const read = ts.readConfigFile(config, ts.sys.readFile);
  if (read.error) throw new Error(diagnosticText(read.error));
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(config), undefined, config);
  const errors = parsed.errors.filter(error => error.code !== 18003);
  if (errors.length) throw new Error(errors.map(diagnosticText).join('\n'));
  return parsed.fileNames.concat((parsed.projectReferences ?? []).flatMap(reference => configurationFiles(ts.resolveProjectReferencePath(reference), visited)));
}

function inside(directory: string, filename: string): boolean {
  const relative = path.relative(directory, filename);
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

function included(filename: string, root: string, excluded: string | undefined): boolean {
  const relative = path.relative(root, filename);
  if (!sourceExtension.test(relative) || declarationExtension.test(relative)) return false;
  if (relative.split(path.sep).some(part => ignored.has(part))) return false;
  return excluded === undefined || !inside(excluded, filename);
}

export function discover(project: string, excludeDirectory?: string): { root: string; filenames: string[]; warnings: string[] } {
  const target = path.resolve(project);
  const root = projectRoot(target);
  const config = localConfig(target, root);
  const excludes = [...ignored].map(directory => `**/${directory}/**`);
  const candidates = config ? configurationFiles(config) : ts.sys.readDirectory(root, extensions, excludes);
  const excluded = excludeDirectory && path.resolve(excludeDirectory);
  const warnings: string[] = [];
  const filenames = [...new Set(candidates.map(file => path.resolve(file)))].sort().filter(filename => {
    if (!included(filename, root, excluded)) return false;
    if (inside(root, filename)) return true;
    warnings.push(`Skipped source outside project root: ${filename}`);
    return false;
  });
  if (!filenames.length) throw new Error(`No TypeScript source files found in ${root}`);
  return { root, filenames, warnings };
}
