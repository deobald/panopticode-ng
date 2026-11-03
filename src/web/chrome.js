import { $, element, button, swatch, format, percent } from './dom.js';
import { legendEntries, unknown } from './metrics.js';

function drawSummary(report, root, bands) {
  const complex = root.units.filter(unit => unit.complexity >= bands[1]);
  for (const [label, value, note] of [
    ['SOURCE FILES', report.files.length, `${format(root.units.length)} executable / declaration regions`],
    ['SOURCE STATEMENTS', root.statements, 'Rectangle area follows statement count'],
    [`COMPLEXITY ${bands[1]}+`, complex.length, 'Regions worth a closer look'],
    ['MEASURED LINE COVERAGE', percent(root.coverage), `${root.coverageKnown} of ${root.coverageExpected} files have line data`],
  ]) {
    const stat = element('div', undefined, 'stat');
    stat.append(element('span', label, 'label'), element('strong', typeof value === 'number' ? format(value) : value), element('small', note));
    $('summary').append(stat);
  }
}

function drawDefinitions(report) {
  for (const [key, title] of [['size', 'Size gives the map its shape'], ['complexity', 'Complexity describes branching'], ['coverage', 'Coverage needs runtime evidence'], ['lint', 'Lint follows the project’s rules']]) {
    const node = element('div');
    node.append(element('h3', title), element('p', report.definitions[key]));
    $('definitions').append(node);
  }
  $('definitions').append(element('p', 'Group complexity is the maximum of its regions, not an average. Group coverage combines known file lines; missing files are excluded and the measured-file count is shown. Lint colors apply to whole files and repeat across their regions.'));
}

export function drawIntroduction(report, state) {
  $('project-name').textContent = report.name;
  $('generated').textContent = new Date(report.generatedAt).toLocaleString();
  for (const warning of report.warnings) $('warnings').append(element('p', warning));
  drawSummary(report, state.root, state.bands);
  drawDefinitions(report);
}

export function drawLegend(state) {
  $('legend').replaceChildren();
  const entries = [...legendEntries(state.metric, state.bands), [unknown, 'Unknown / no data']];
  for (const [fill, label] of entries) {
    const item = element('span');
    item.append(swatch(fill), document.createTextNode(label));
    $('legend').append(item);
  }
  const guides = { complexity: 'Group color = maximum complexity', coverage: 'Group color = known file coverage', lint: 'Color applies to whole files' };
  $('map-guide').textContent = `Area = source statements · ${guides[state.metric]} · Select to inspect; open groups in the detail panel`;
}

export function drawBreadcrumbs(state, zoom) {
  const parents = [];
  let current = state.scope;
  while (current) { parents.unshift(current); current = current.parent; }
  $('breadcrumbs').replaceChildren();
  for (const [index, node] of parents.entries()) {
    if (index) $('breadcrumbs').append(element('span', '/'));
    const control = button(node === state.root ? 'All code' : node.name, () => zoom(node));
    if (node === state.scope) control.setAttribute('aria-current', 'location');
    $('breadcrumbs').append(control);
  }
}
