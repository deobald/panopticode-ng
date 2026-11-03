import { percent } from './dom.js';

export const colors = ['#82b5a1', '#e1bd68', '#ce795e', '#783f51'];
export const unknown = '#c6cec9';
export const complexityBand = (value, bands) => bands.filter(boundary => value >= boundary).length;

export function complexityColor(value, bands) {
  return value === null ? unknown : colors[complexityBand(value, bands)];
}

function coverageColor(node) {
  if (!node.coverage) return unknown;
  const value = node.coverage.covered / node.coverage.total;
  const boundaries = [.75, .5, 0];
  const index = boundaries.findIndex((boundary, i) => i === 2 ? value > boundary : value >= boundary);
  return colors[index === -1 ? 3 : index];
}

function lintColor(node) {
  if (!node.lintKnown) return unknown;
  if (node.findings.some(finding => finding.severity === 2)) return colors[2];
  return node.findings.length ? colors[1] : colors[0];
}

export function regionColor(node, metric, bands) {
  if (metric === 'complexity') return complexityColor(node.complexity, bands);
  if (metric === 'coverage') return coverageColor(node);
  if (metric === 'nesting') return node.maxNestingDepth === null ? unknown : colors[[3, 5, 7].filter(value => node.maxNestingDepth >= value).length];
  if (metric === 'duplication') return duplicationColor(node);
  return lintColor(node);
}

function duplicationColor(node) {
  if (node.duplicatedLines === null || !node.physicalLines) return unknown;
  const fraction = node.duplicatedLines / node.physicalLines;
  if (fraction === 0) return colors[0];
  if (fraction < .1) return colors[1];
  return fraction < .25 ? colors[2] : colors[3];
}

const metricDescriptions = {
  complexity: node => `${node.unit ? 'Complexity' : 'Maximum complexity'}: ${node.complexity ?? 'unknown'}`,
  coverage: node => `Measured line coverage: ${percent(node.coverage)}`,
  nesting: node => `Maximum nesting: ${node.maxNestingDepth ?? 'unknown'}`,
  duplication: node => `Duplicated lines in file scope: ${node.duplicatedLines ?? 'unknown'}`,
  lint: node => `Lint findings in file${node.filePaths.length > 1 ? 's' : ''}: ${node.lintKnown ? node.findings.length : 'unknown'}`,
};

export function metricText(node, metric) {
  return metricDescriptions[metric](node);
}

export function legendEntries(metric, bands) {
  const labels = [`1–${bands[0] - 1}`, `${bands[0]}–${bands[1] - 1}`, `${bands[1]}–${bands[2] - 1}`, `${bands[2]}+`];
  if (metric === 'complexity') return labels.map((label, i) => [colors[i], `CCN ${label}`]);
  if (metric === 'coverage') return colors.map((color, i) => [color, ['75–100%', '50–<75%', '>0–<50%', '0%'][i]]);
  if (metric === 'nesting') return colors.map((color, i) => [color, ['Depth 0–2', 'Depth 3–4', 'Depth 5–6', 'Depth 7+'][i]]);
  if (metric === 'duplication') return colors.map((color, i) => [color, ['0%', '>0–<10%', '10–<25%', '25%+'][i]]);
  return [[colors[0], 'No reported findings'], [colors[1], 'Warnings'], [colors[2], 'Errors']];
}
