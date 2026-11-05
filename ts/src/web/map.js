import { $, element, svgElement } from './dom.js';
import { regionColor, metricText } from './metrics.js';
import { filterTree } from './tree.js';
import { partition } from './treemap.js';

class MapRenderer {
  constructor(svg, state, actions) {
    this.svg = svg;
    this.state = state;
    this.actions = actions;
    this.serial = 0;
    this.defs = svgElement('defs', {});
    svg.append(this.defs);
  }

  tile(node, bounds) {
    const { x, y, width, height } = bounds;
    if (width < 2 || height < 2) return;
    const expanded = node.children.length > 0 && width > 90 && height > 60;
    const group = this.group(node, expanded);
    this.rectangle(group, node, bounds, expanded);
    this.labels(group, node, bounds, expanded);
    this.bind(group, node);
    this.svg.append(group);
    if (expanded) this.children(node.children, { x: x + 3, y: y + 24, width: width - 6, height: height - 27 });
  }

  children(nodes, bounds) {
    for (const region of partition(nodes, bounds)) this.tile(region.item, region);
  }

  group(node, expanded) {
    const group = svgElement('g', { class: 'tile', 'data-region': node.id, role: 'button', tabindex: 0,
      'aria-label': `${node.name}. ${node.statements} statements. ${metricText(node, this.state.metric)}. ${node.children.length ? 'Group. Select for navigation.' : ''}` });
    group.classList.toggle('selected', node.id === this.state.selected.id);
    group.classList.toggle('tile-group', expanded);
    const title = svgElement('title', {});
    title.textContent = `${node.path ?? node.unit?.file ?? node.name}\n${node.name}\n${metricText(node, this.state.metric)}`;
    group.append(title);
    return group;
  }

  rectangle(group, node, bounds, expanded) {
    const { x, y, width, height } = bounds;
    const fill = regionColor(node, this.state.metric, this.state.bands);
    group.classList.toggle('tile-critical', !expanded && fill === '#783f51');
    group.append(svgElement('rect', { x: x + 1, y: y + 1, width: Math.max(0, width - 2),
      height: Math.max(0, height - 2), fill, rx: 2 }));
  }

  clip(bounds) {
    const { x, y, width, height } = bounds;
    const id = `clip-${this.serial++}`;
    const clip = svgElement('clipPath', { id });
    clip.append(svgElement('rect', { x: x + 6, y: y + 3, width: Math.max(0, width - 12), height: Math.max(0, height - 6) }));
    this.defs.append(clip);
    return id;
  }

  labels(group, node, bounds, expanded) {
    const { x, y, width, height } = bounds;
    if (width <= 45 || height <= 20) return;
    const clip = this.clip(bounds);
    const text = svgElement('text', { x: x + 8, y: y + 17, 'font-size': expanded ? 10 : 11,
      'font-weight': 550, 'clip-path': `url(#${clip})` });
    text.textContent = node.name;
    group.append(text);
    if (!expanded && height > 48 && width > 90) {
      const sub = svgElement('text', { x: x + 8, y: y + 34, 'font-size': 9, 'clip-path': `url(#${clip})` });
      sub.textContent = metricText(node, this.state.metric);
      group.append(sub);
    }
  }

  bind(group, node) {
    const original = this.state.byId.get(node.id);
    group.addEventListener('click', event => { event.stopPropagation(); this.actions.choose(original); });
    group.addEventListener('dblclick', event => { event.stopPropagation(); this.actions.zoom(original); });
    group.addEventListener('keydown', event => {
      if (!['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      this.actions.choose(original);
    });
  }
}

export function drawMap(state, actions) {
  const container = $('treemap');
  container.replaceChildren();
  const tree = filterTree(state.scope, state.query);
  if (!tree) { container.append(element('p', 'No regions match this search.', 'empty')); return; }
  const width = Math.max(280, container.clientWidth);
  const height = container.clientHeight || 460;
  const svg = svgElement('svg', { viewBox: `0 0 ${width} ${height}`, role: 'group',
    'aria-label': 'Treemap. Select a region for details. Use the table below for all regions.' });
  const renderer = new MapRenderer(svg, state, actions);
  renderer.children(tree.children.length ? tree.children : [tree], { x: 0, y: 0, width, height });
  container.append(svg);
}
