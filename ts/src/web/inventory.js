import { $, element, button, swatch, format, percent } from './dom.js';
import { complexityColor } from './metrics.js';
import { matchingUnit } from './tree.js';

const coverageFraction = unit => unit.coverage ? unit.coverage.covered / unit.coverage.total : 2;
const comparators = {
  complexity: (a, b) => (b.complexity ?? -1) - (a.complexity ?? -1) || b.statements - a.statements,
  statements: (a, b) => b.statements - a.statements,
  coverage: (a, b) => coverageFraction(a) - coverageFraction(b),
  name: (a, b) => a.file.localeCompare(b.file) || a.line - b.line,
};

function inventoryRow(unit, state, choose) {
  const row = element('tr', undefined, state.selected.id === unit.id ? 'active' : undefined);
  const name = element('td');
  const control = button(unit.name, () => choose(state.byId.get(unit.id)));
  control.setAttribute('data-region', unit.id);
  name.append(control);
  const value = element('td');
  const badge = element('span', undefined, 'complexity-value');
  badge.append(swatch(complexityColor(unit.complexity, state.bands)), document.createTextNode(unit.complexity === null ? '—' : String(unit.complexity)));
  value.append(badge);
  row.append(name, element('td', `${unit.file}:${unit.line}:${unit.column}`), element('td', format(unit.statements)), value, element('td', percent(unit.coverage)));
  return row;
}

function emptyInventoryRow() {
  const row = element('tr');
  const cell = element('td', 'No regions match this search.');
  cell.colSpan = 5;
  row.append(cell);
  return row;
}

export function drawInventory(state, choose) {
  const rows = state.scope.units.filter(unit => matchingUnit(unit, state.query)).sort(comparators[state.sort]);
  const body = $('inventory');
  body.replaceChildren(...rows.slice(0, state.limit).map(unit => inventoryRow(unit, state, choose)));
  if (!rows.length) body.append(emptyInventoryRow());
  $('more').hidden = rows.length <= state.limit;
  $('inventory-title').textContent = `Functions & module code · ${format(rows.length)} regions`;
  const scopeName = state.scope === state.root ? 'the project' : state.scope.name;
  const explanation = state.query ? 'The map is filtered; group colors retain full-group metrics.' : 'Open a group to see smaller regions.';
  $('scope-note').textContent = `${format(rows.length)} matching regions in ${scopeName}. Tiny and empty regions remain available in the table. ${explanation}`;
}
