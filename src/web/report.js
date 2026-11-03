import { $, debounce, regionFocus, restoreRegionFocus } from './dom.js';
import { buildTree } from './tree.js';
import { drawDetail } from './detail.js';
import { drawMap } from './map.js';
import { drawInventory } from './inventory.js';
import { drawIntroduction, drawLegend, drawBreadcrumbs } from './chrome.js';

function startReport(report) {
  const { root, byId } = buildTree(report);
  const state = { root, byId, scope: root, selected: root, metric: 'complexity',
    query: '', sort: 'complexity', limit: 100, bands: report.thresholds };

  function drawSelection() {
    drawDetail(state, zoom);
    drawMap(state, { choose, zoom });
    drawInventory(state, choose);
  }

  function choose(node) {
    const focus = regionFocus();
    state.selected = node;
    drawSelection();
    restoreRegionFocus(focus, node.id);
  }

  function zoom(node) {
    if (!node.children.length) return;
    state.scope = node;
    state.selected = node;
    state.limit = 100;
    draw();
  }

  function draw() {
    drawLegend(state);
    drawBreadcrumbs(state, zoom);
    drawSelection();
  }

  $('metric').addEventListener('change', event => { state.metric = event.target.value; draw(); });
  $('sort').addEventListener('change', event => { state.sort = event.target.value; state.limit = 100; drawInventory(state, choose); });
  $('search').addEventListener('input', debounce(event => {
    state.query = event.target.value.trim().toLowerCase();
    state.limit = 100;
    drawMap(state, { choose, zoom });
    drawInventory(state, choose);
  }, 100));
  $('more').addEventListener('click', () => { state.limit += 100; drawInventory(state, choose); });
  new ResizeObserver(debounce(() => drawMap(state, { choose, zoom }), 50)).observe($('treemap'));
  drawIntroduction(report, state);
  draw();
}

startReport(JSON.parse($('report-data').textContent));
