(() => {
  'use strict';
  const report = JSON.parse(document.getElementById('report-data').textContent);
  const $ = id => document.getElementById(id);
  const format = value => value.toLocaleString();
  const percent = coverage => coverage && coverage.total ? `${Math.round(coverage.covered / coverage.total * 100)}%` : 'Unknown';
  const colors = ['#82b5a1', '#e1bd68', '#ce795e', '#783f51'];
  const unknown = '#c6cec9';
  const byId = new Map();
  const files = new Map(report.files.map(file => [file.path, file]));
  const root = { id: '/', name: report.name, kind: 'project', children: [], parent: null };
  byId.set(root.id, root);

  for (const file of report.files) {
    let parent = root;
    let prefix = '';
    const parts = file.path.split('/');
    for (const [index, part] of parts.entries()) {
      prefix += (prefix ? '/' : '') + part;
      const id = `path:${prefix}`;
      let node = byId.get(id);
      if (!node) {
        node = { id, name: part, path: prefix, kind: index === parts.length - 1 ? 'file' : 'directory', parent, children: [] };
        parent.children.push(node);
        byId.set(id, node);
      }
      parent = node;
    }
    for (const unit of file.units) {
      const node = { id: unit.id, name: unit.name, kind: unit.kind, parent, unit, children: [] };
      parent.children.push(node);
      byId.set(node.id, node);
    }
  }

  function aggregate(node) {
    if (node.unit) {
      node.units = [node.unit];
      node.filePaths = [node.unit.file];
      node.weight = Math.max(1, node.unit.statements);
    } else {
      node.children.forEach(aggregate);
      node.units = node.children.flatMap(child => child.units);
      node.filePaths = [...new Set(node.children.flatMap(child => child.filePaths))];
      node.weight = node.children.reduce((sum, child) => sum + child.weight, 0);
      node.children.sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name));
    }
    node.statements = node.units.reduce((sum, unit) => sum + unit.statements, 0);
    const complexity = node.units.filter(unit => unit.complexity !== null).map(unit => unit.complexity);
    node.complexity = complexity.length ? complexity.reduce((maximum, value) => Math.max(maximum, value), 0) : null;
    const measured = node.unit ? [node.unit.coverage] : node.filePaths.map(file => files.get(file).coverage);
    const known = measured.filter(value => value && value.total);
    node.coverage = known.length ? known.reduce((sum, value) => ({ covered: sum.covered + value.covered, total: sum.total + value.total }), { covered: 0, total: 0 }) : null;
    node.coverageKnown = known.length;
    node.coverageExpected = measured.length;
    const lintFiles = node.filePaths.map(file => files.get(file)).filter(file => file.findings !== null);
    node.findings = lintFiles.flatMap(file => file.findings.map(finding => ({ ...finding, file: file.path })));
    node.lintKnown = lintFiles.length;
  }
  aggregate(root);

  let scope = root;
  let selected = root;
  let metric = 'complexity';
  let query = '';
  let sort = 'complexity';
  let limit = 100;
  const bands = report.thresholds;
  const complexityLabels = [`1–${bands[0] - 1}`, `${bands[0]}–${bands[1] - 1}`, `${bands[1]}–${bands[2] - 1}`, `${bands[2]}+`];

  function color(node) {
    if (metric === 'complexity') return node.complexity === null ? unknown : colors[bands.filter(value => node.complexity >= value).length];
    if (metric === 'coverage') {
      if (!node.coverage) return unknown;
      const value = node.coverage.covered / node.coverage.total;
      return colors[value >= .75 ? 0 : value >= .5 ? 1 : value > 0 ? 2 : 3];
    }
    if (!node.lintKnown) return unknown;
    return node.findings.some(finding => finding.severity === 2) ? colors[2] : node.findings.length ? colors[1] : colors[0];
  }

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function swatch(value) {
    const span = element('span', undefined, 'swatch');
    span.style.background = value;
    span.setAttribute('aria-hidden', 'true');
    return span;
  }
  function button(text, action) {
    const node = element('button', text);
    node.type = 'button';
    node.addEventListener('click', action);
    return node;
  }
  function metricText(node) {
    if (metric === 'complexity') return `${node.unit ? 'Complexity' : 'Maximum complexity'}: ${node.complexity ?? 'unknown'}`;
    if (metric === 'coverage') return `Measured line coverage: ${percent(node.coverage)}`;
    return `Lint findings in file${node.filePaths.length > 1 ? 's' : ''}: ${node.lintKnown ? node.findings.length : 'unknown'}`;
  }

  $('project-name').textContent = report.name;
  $('generated').textContent = new Date(report.generatedAt).toLocaleString();
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
  for (const warning of report.warnings) $('warnings').append(element('p', warning));
  for (const [key, title] of [['size', 'Size gives the map its shape'], ['complexity', 'Complexity describes branching'], ['coverage', 'Coverage needs runtime evidence'], ['lint', 'Lint follows the project’s rules']]) {
    const node = element('div');
    node.append(element('h3', title), element('p', report.definitions[key]));
    $('definitions').append(node);
  }
  $('definitions').append(element('p', 'Group complexity is the maximum of its regions, not an average. Group coverage combines known file lines; missing files are excluded and the measured-file count is shown. Lint colors apply to whole files and repeat across their regions.'));

  function drawLegend() {
    $('legend').replaceChildren();
    let entries;
    if (metric === 'complexity') entries = complexityLabels.map((label, index) => [colors[index], `CCN ${label}`]);
    else if (metric === 'coverage') entries = [['#82b5a1', '75–100%'], ['#e1bd68', '50–<75%'], ['#ce795e', '>0–<50%'], ['#783f51', '0%']];
    else entries = [[colors[0], 'No reported findings'], [colors[1], 'Warnings'], [colors[2], 'Errors']];
    entries.push([unknown, 'Unknown / no data']);
    for (const [fill, label] of entries) {
      const item = element('span');
      item.append(swatch(fill), document.createTextNode(label));
      $('legend').append(item);
    }
    $('map-guide').textContent = `Area = source statements · ${metric === 'lint' ? 'Color applies to whole files' : 'Group color = ' + (metric === 'complexity' ? 'maximum complexity' : 'known file coverage')} · Select to inspect; open groups in the detail panel`;
  }

  function choose(node) {
    const restoreMapFocus = $('treemap').contains(document.activeElement);
    const restoreTableFocus = $('inventory').contains(document.activeElement);
    selected = node;
    drawDetail();
    drawMap();
    drawTable();
    if (restoreMapFocus) Array.from($('treemap').querySelectorAll('[data-region]')).find(item => item.getAttribute('data-region') === node.id)?.focus();
    if (restoreTableFocus) Array.from($('inventory').querySelectorAll('[data-region]')).find(item => item.getAttribute('data-region') === node.id)?.focus();
  }
  function zoom(node) {
    if (!node.children.length) return;
    scope = node;
    selected = node;
    limit = 100;
    draw();
  }

  function drawDetail() {
    const node = selected;
    const panel = $('detail');
    panel.replaceChildren(element('p', 'SELECTED REGION', 'eyebrow'));
    const badge = element('span', undefined, 'badge');
    badge.append(swatch(color(node)), document.createTextNode(node.kind.toUpperCase()));
    panel.append(badge, element('h3', node.name));
    const location = node.unit ? `${node.unit.file}:${node.unit.line}:${node.unit.column}` : node.path ?? 'Whole project';
    panel.append(element('p', location, 'location'));
    const metrics = element('dl');
    for (const [label, value] of [
      ['Source statements', format(node.statements)],
      [node.unit ? 'Cyclomatic complexity' : 'Maximum complexity', node.complexity ?? 'Unknown'],
      ['Measured line coverage', percent(node.coverage)],
      ['File lint findings', node.lintKnown ? format(node.findings.length) : 'Unknown'],
    ]) metrics.append(element('dt', label), element('dd', String(value)));
    panel.append(metrics);
    if (node.coverage) panel.append(element('p', `${node.coverage.covered} / ${node.coverage.total} mapped statement-start lines covered. ${node.coverageKnown} / ${node.coverageExpected} ${node.unit ? 'regions' : 'files'} have line data.`));
    else panel.append(element('p', 'No mapped line coverage for this region. Supply source-mapped Istanbul coverage-final.json to see test coverage.'));
    if (node.children.length) {
      panel.append(element('p', `${format(node.units.length)} regions across ${format(node.filePaths.length)} files. Group complexity shows the most complex region.`));
      panel.append(button('Open this group →', () => zoom(node)));
    }
    if (node.complexity !== null) {
      const index = bands.filter(value => node.complexity >= value).length;
      const tips = [
        'Few decision points. Review size and tests alongside this number; simple branching does not guarantee correctness.',
        'Several decision points. Check whether tests exercise the alternate paths.',
        'Many decision points. Inspect the branches and consider whether the responsibilities can be split.',
        'A concentrated area of branching. Start by understanding behavior and test coverage before changing it.',
      ];
      panel.append(element('p', tips[index], 'tip'));
    }
    panel.append(element('h4', 'Lint evidence · file scope'));
    if (!node.lintKnown) panel.append(element('p', 'No ESLint result for these files. Import existing ESLint JSON to show the project’s findings.'));
    else {
      panel.append(element('p', `${node.lintKnown} / ${node.filePaths.length} files represented in the lint report. Findings belong to the file, including when a function is selected.`));
      if (!node.findings.length) panel.append(element('p', 'No findings in the supplied results for these files.'));
      const list = element('ul', undefined, 'findings');
      for (const finding of node.findings.slice(0, 40)) {
        const item = element('li');
        item.append(element('code', `${finding.severity === 2 ? 'Error' : 'Warning'} · ${finding.rule}`),
          element('div', finding.message), element('div', `${finding.file}${finding.line ? ':' + finding.line : ''}`));
        list.append(item);
      }
      panel.append(list);
      if (node.findings.length > 40) panel.append(element('p', 'Showing the first 40 findings. The JSON report contains the complete list.'));
    }
  }

  function matches(unit) {
    return !query || `${unit.name} ${unit.file}`.toLowerCase().includes(query);
  }
  function visibleTree(node) {
    if (node.unit) return matches(node.unit) ? node : null;
    const children = node.children.map(visibleTree).filter(Boolean);
    return children.length ? { ...node, children, weight: children.reduce((sum, child) => sum + child.weight, 0) } : null;
  }
  const ns = 'http://www.w3.org/2000/svg';
  function svgElement(tag, attrs) {
    const node = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    return node;
  }

  function drawMap() {
    const container = $('treemap');
    container.replaceChildren();
    const tree = visibleTree(scope);
    if (!tree) { container.append(element('p', 'No regions match this search.', 'empty')); return; }
    const width = Math.max(280, container.clientWidth);
    const height = container.clientHeight || 460;
    const svg = svgElement('svg', { viewBox: `0 0 ${width} ${height}`, role: 'group', 'aria-label': 'Treemap. Select a region for details. Use the table below for all regions.' });
    const defs = svgElement('defs', {});
    svg.append(defs);
    let serial = 0;
    function tile(node, bounds, depth) {
      const { x, y, width: w, height: h } = bounds;
      if (w < 2 || h < 2) return;
      const group = svgElement('g', {
        class: `tile${node.id === selected.id ? ' selected' : ''}`,
        'data-region': node.id,
        role: 'button', tabindex: 0,
        'aria-label': `${node.name}. ${node.statements} statements. ${metricText(node)}. ${node.children.length ? 'Group. Select for navigation.' : ''}`,
      });
      const title = svgElement('title', {});
      title.textContent = `${node.path ?? node.unit?.file ?? node.name}\n${node.name}\n${metricText(node)}`;
      group.append(title);
      const hasChildren = node.children.length && w > 90 && h > 60;
      const fill = hasChildren ? '#dde5dc' : color(node);
      const rect = svgElement('rect', { x: x + 1, y: y + 1, width: Math.max(0, w - 2), height: Math.max(0, h - 2), fill, rx: 2, stroke: '#fcfcf8', 'stroke-width': 1 });
      group.append(rect);
      const clipId = `clip-${serial++}`;
      const clip = svgElement('clipPath', { id: clipId });
      clip.append(svgElement('rect', { x: x + 6, y: y + 3, width: Math.max(0, w - 12), height: Math.max(0, h - 6) }));
      defs.append(clip);
      if (w > 45 && h > 20) {
        const text = svgElement('text', { x: x + 8, y: y + 17, fill: !hasChildren && fill === colors[3] ? '#fff' : '#172d30', 'font-size': hasChildren ? 10 : 11, 'font-weight': 550, 'clip-path': `url(#${clipId})` });
        text.textContent = node.name;
        group.append(text);
        if (!hasChildren && h > 48 && w > 90) {
          const sub = svgElement('text', { x: x + 8, y: y + 34, fill: fill === colors[3] ? '#f6e9eb' : '#253c3b', 'font-size': 9, 'clip-path': `url(#${clipId})` });
          sub.textContent = metricText(node);
          group.append(sub);
        }
      }
      group.addEventListener('click', event => { event.stopPropagation(); choose(byId.get(node.id)); });
      group.addEventListener('dblclick', event => { event.stopPropagation(); zoom(byId.get(node.id)); });
      group.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); choose(byId.get(node.id)); }
      });
      svg.append(group);
      if (hasChildren) {
        for (const region of partition(node.children, { x: x + 3, y: y + 24, width: w - 6, height: h - 27 })) tile(region.item, region, depth + 1);
      }
    }
    for (const region of partition(tree.children.length ? tree.children : [tree], { x: 0, y: 0, width, height })) tile(region.item, region, 0);
    container.append(svg);
  }

  function drawTable() {
    const rows = scope.units.filter(matches).slice();
    rows.sort((a, b) => {
      if (sort === 'complexity') return (b.complexity ?? -1) - (a.complexity ?? -1) || b.statements - a.statements;
      if (sort === 'statements') return b.statements - a.statements;
      if (sort === 'coverage') return (a.coverage ? a.coverage.covered / a.coverage.total : 2) - (b.coverage ? b.coverage.covered / b.coverage.total : 2);
      return a.file.localeCompare(b.file) || a.line - b.line;
    });
    const body = $('inventory');
    body.replaceChildren();
    for (const unit of rows.slice(0, limit)) {
      const node = byId.get(unit.id);
      const row = element('tr', undefined, selected.id === unit.id ? 'active' : undefined);
      const name = element('td');
      const control = button(unit.name, () => choose(node));
      control.setAttribute('data-region', unit.id);
      name.append(control);
      const value = element('td');
      const badge = element('span', undefined, 'complexity-value');
      const band = unit.complexity === null ? unknown : colors[bands.filter(n => unit.complexity >= n).length];
      badge.append(swatch(band), document.createTextNode(unit.complexity === null ? '—' : String(unit.complexity)));
      value.append(badge);
      row.append(name, element('td', `${unit.file}:${unit.line}:${unit.column}`), element('td', format(unit.statements)), value, element('td', percent(unit.coverage)));
      body.append(row);
    }
    if (!rows.length) {
      const row = element('tr');
      const cell = element('td', 'No regions match this search.');
      cell.colSpan = 5;
      row.append(cell);
      body.append(row);
    }
    $('more').hidden = rows.length <= limit;
    $('inventory-title').textContent = `Functions & module code · ${format(rows.length)} regions`;
    $('scope-note').textContent = `${format(rows.length)} matching regions in ${scope === root ? 'the project' : scope.name}. Tiny and empty regions remain available in the table. ${query ? 'The map is filtered; group colors retain full-group metrics.' : 'Open a group to see smaller regions.'}`;
  }

  function drawBreadcrumbs() {
    const parents = [];
    let current = scope;
    while (current) { parents.unshift(current); current = current.parent; }
    $('breadcrumbs').replaceChildren();
    for (const [index, node] of parents.entries()) {
      if (index) $('breadcrumbs').append(element('span', '/'));
      const control = button(node === root ? 'All code' : node.name, () => zoom(node));
      if (node === scope) control.setAttribute('aria-current', 'location');
      $('breadcrumbs').append(control);
    }
  }
  function draw() {
    drawLegend();
    drawBreadcrumbs();
    drawDetail();
    drawMap();
    drawTable();
  }
  $('metric').addEventListener('change', event => { metric = event.target.value; draw(); });
  $('sort').addEventListener('change', event => { sort = event.target.value; limit = 100; drawTable(); });
  let searchTimer;
  $('search').addEventListener('input', event => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { query = event.target.value.trim().toLowerCase(); limit = 100; drawMap(); drawTable(); }, 100);
  });
  $('more').addEventListener('click', () => { limit += 100; drawTable(); });
  let resizeTimer;
  new ResizeObserver(() => { clearTimeout(resizeTimer); resizeTimer = setTimeout(drawMap, 50); }).observe($('treemap'));
  draw();
})();
