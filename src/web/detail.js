import { $, element, button, swatch, format, percent } from './dom.js';
import { regionColor, complexityBand } from './metrics.js';

function appendDetailMetrics(panel, node) {
  const metrics = element('dl');
  for (const [label, value] of [
    ['Source statements', format(node.statements)],
    [node.unit ? 'Cyclomatic complexity' : 'Maximum complexity', node.complexity ?? 'Unknown'],
    ['Measured line coverage', percent(node.coverage)],
    ['File lint findings', node.lintKnown ? format(node.findings.length) : 'Unknown'],
  ]) metrics.append(element('dt', label), element('dd', String(value)));
  panel.append(metrics);
}

function appendCoverageDetail(panel, node) {
  if (!node.coverage) {
    panel.append(element('p', 'No mapped line coverage for this region. Supply source-mapped Istanbul coverage-final.json to see test coverage.'));
    return;
  }
  panel.append(element('p', `${node.coverage.covered} / ${node.coverage.total} mapped statement-start lines covered. ${node.coverageKnown} / ${node.coverageExpected} ${node.unit ? 'regions' : 'files'} have line data.`));
}

function appendComplexityTip(panel, node, bands) {
  if (node.complexity === null) return;
  const tips = [
    'Few decision points. Review size and tests alongside this number; simple branching does not guarantee correctness.',
    'Several decision points. Check whether tests exercise the alternate paths.',
    'Many decision points. Inspect the branches and consider whether the responsibilities can be split.',
    'A concentrated area of branching. Start by understanding behavior and test coverage before changing it.',
  ];
  panel.append(element('p', tips[complexityBand(node.complexity, bands)], 'tip'));
}

function findingItem(finding) {
  const item = element('li');
  item.append(element('code', `${finding.severity === 2 ? 'Error' : 'Warning'} · ${finding.rule}`),
    element('div', finding.message), element('div', `${finding.file}${finding.line ? ':' + finding.line : ''}`));
  return item;
}

function appendLintDetail(panel, node) {
  panel.append(element('h4', 'Lint evidence · file scope'));
  if (!node.lintKnown) {
    panel.append(element('p', 'No ESLint result for these files. Import existing ESLint JSON to show the project’s findings.'));
    return;
  }
  panel.append(element('p', `${node.lintKnown} / ${node.filePaths.length} files represented in the lint report. Findings belong to the file, including when a function is selected.`));
  if (!node.findings.length) panel.append(element('p', 'No findings in the supplied results for these files.'));
  const list = element('ul', undefined, 'findings');
  list.append(...node.findings.slice(0, 40).map(findingItem));
  panel.append(list);
  if (node.findings.length > 40) panel.append(element('p', 'Showing the first 40 findings. The JSON report contains the complete list.'));
}

export function drawDetail(state, zoom) {
  const node = state.selected;
  const panel = $('detail');
  panel.replaceChildren(element('p', 'SELECTED REGION', 'eyebrow'));
  const badge = element('span', undefined, 'badge');
  badge.append(swatch(regionColor(node, state.metric, state.bands)), document.createTextNode(node.kind.toUpperCase()));
  const location = node.unit ? `${node.unit.file}:${node.unit.line}:${node.unit.column}` : node.path ?? 'Whole project';
  panel.append(badge, element('h3', node.name), element('p', location, 'location'));
  appendDetailMetrics(panel, node);
  appendCoverageDetail(panel, node);
  if (node.children.length) {
    panel.append(element('p', `${format(node.units.length)} regions across ${format(node.filePaths.length)} files. Group complexity shows the most complex region.`));
    panel.append(button('Open this group →', () => zoom(node)));
  }
  appendComplexityTip(panel, node, state.bands);
  appendLintDetail(panel, node);
}
