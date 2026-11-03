function createGroup(id, name, kind, parent, path) {
  const node = { id, name, kind, parent, path, children: [] };
  parent?.children.push(node);
  return node;
}

function addFile(root, byId, file) {
  let parent = root;
  let prefix = '';
  const parts = file.path.split('/');
  for (const [index, part] of parts.entries()) {
    prefix += (prefix ? '/' : '') + part;
    const id = `path:${prefix}`;
    if (!byId.has(id)) byId.set(id, createGroup(id, part, index === parts.length - 1 ? 'file' : 'directory', parent, prefix));
    parent = byId.get(id);
  }
  for (const unit of file.units) {
    const node = createGroup(unit.id, unit.name, unit.kind, parent);
    node.unit = unit;
    byId.set(node.id, node);
  }
}

function aggregateUnits(node) {
  if (node.unit) {
    node.units = [node.unit];
    node.filePaths = [node.unit.file];
    node.weight = Math.max(1, node.unit.statements);
    return;
  }
  node.units = node.children.flatMap(child => child.units);
  node.filePaths = [...new Set(node.children.flatMap(child => child.filePaths))];
  node.weight = node.children.reduce((sum, child) => sum + child.weight, 0);
  node.children.sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name));
}

function aggregateCoverage(node, files) {
  const measured = node.unit ? [node.unit.coverage] : node.filePaths.map(file => files.get(file).coverage);
  const known = measured.filter(value => value && value.total);
  node.coverage = known.length ? known.reduce((sum, value) => ({ covered: sum.covered + value.covered, total: sum.total + value.total }), { covered: 0, total: 0 }) : null;
  node.coverageKnown = known.length;
  node.coverageExpected = measured.length;
}

function aggregateLint(node, files) {
  const known = node.filePaths.map(file => files.get(file)).filter(file => file.findings !== null);
  node.findings = known.flatMap(file => file.findings.map(finding => ({ ...finding, file: file.path })));
  node.lintKnown = known.length;
}

function aggregateTree(node, files) {
  node.children.forEach(child => aggregateTree(child, files));
  aggregateUnits(node);
  node.statements = node.units.reduce((sum, unit) => sum + unit.statements, 0);
  const known = node.units.filter(unit => unit.complexity !== null);
  node.complexity = known.length ? known.reduce((maximum, unit) => Math.max(maximum, unit.complexity), 0) : null;
  aggregateCoverage(node, files);
  aggregateLint(node, files);
}

export function buildTree(report) {
  const root = createGroup('/', report.name, 'project', null);
  const byId = new Map([[root.id, root]]);
  report.files.forEach(file => addFile(root, byId, file));
  aggregateTree(root, new Map(report.files.map(file => [file.path, file])));
  return { root, byId };
}

export function matchingUnit(unit, query) {
  return !query || `${unit.name} ${unit.file}`.toLowerCase().includes(query);
}

export function filterTree(node, query) {
  if (node.unit) return matchingUnit(node.unit, query) ? node : null;
  const children = node.children.map(child => filterTree(child, query)).filter(Boolean);
  return children.length ? { ...node, children, weight: children.reduce((sum, child) => sum + child.weight, 0) } : null;
}
