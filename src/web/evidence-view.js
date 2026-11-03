import { $, element, button, format } from './dom.js';

function evidenceSection(title, description) {
  const section = element('section', undefined, 'evidence-card');
  section.append(element('h3', title), element('p', description));
  return section;
}

export function findingLocations(report) {
  const locations = new Map();
  for (const file of report.files) {
    for (const finding of file.findings ?? []) {
      const key = `${file.path}:${finding.line ?? '?'}:${finding.column ?? '?'}`;
      if (!locations.has(key)) locations.set(key, { file: file.path, line: finding.line, messages: [] });
      locations.get(key).messages.push(finding);
    }
  }
  return locations;
}

function analyzerEvidence(report) {
  const section = evidenceSection('Analyzer passes', 'Measurements and findings are separate evidence. Each pass records its version, configuration, scope, and status.');
  const list = element('ul', undefined, 'pass-list');
  for (const pass of report.analyzers) {
    const item = element('li');
    item.append(element('strong', `${pass.id} · ${pass.status}`), element('div', `Tool ${pass.version} · ${pass.files} files · ${Math.round(pass.durationMs)} ms`),
      element('code', `${pass.configuration.id} v${pass.configuration.version}`));
    if (pass.detail) item.append(element('div', pass.detail));
    list.append(item);
  }
  section.append(list);
  return section;
}

function lintEvidence(report, chooseFile) {
  const groups = findingLocations(report);
  const count = report.files.reduce((sum, file) => sum + (file.findings?.length ?? 0), 0);
  const section = evidenceSection('Actionable lint findings', `${format(count)} messages at ${format(groups.size)} locations. Messages at one location are grouped for inspection; they may describe the same problem. No combined penalty or health score is calculated.`);
  for (const group of [...groups.values()].slice(0, 40)) {
    const item = element('div', undefined, 'evidence-item');
    item.append(button(`${group.file}:${group.line ?? '?'}`, () => chooseFile(group.file)));
    for (const finding of group.messages) item.append(element('p', `${finding.severity === 2 ? 'Error' : 'Warning'} · ${finding.rule}: ${finding.message}`));
    section.append(item);
  }
  if (!count) section.append(element('p', report.files.some(file => file.findings !== null) ? 'No messages in the measured lint scope.' : 'Lint evidence is unavailable.'));
  if (groups.size > 40) section.append(element('p', 'First 40 locations shown; the JSON report contains all findings.'));
  return section;
}

function duplicationEvidence(report, chooseFile) {
  const blocks = report.duplicates;
  const section = evidenceSection('Duplication matching blocks', blocks === null ? 'Duplication analysis was not run.' : `${format(blocks.length)} matching block pairs. Repeated line ranges are counted once per file; matches are measurements, not extra lint penalties.`);
  for (const block of (blocks ?? []).slice(0, 30)) {
    const item = element('div', undefined, 'evidence-item');
    item.append(button(`${block.first.file}:${block.first.line}–${block.first.endLine}`, () => chooseFile(block.first.file)),
      element('span', ' ↔ '), button(`${block.second.file}:${block.second.line}–${block.second.endLine}`, () => chooseFile(block.second.file)),
      element('p', `${block.lines} physical lines · ${block.tokens} tokens`));
    section.append(item);
  }
  if (blocks?.length === 0) section.append(element('p', 'No matches above the configured minimum token and line counts.'));
  if (blocks?.length > 30) section.append(element('p', 'First 30 pairs shown; the JSON report contains all blocks.'));
  return section;
}

function supplementalEvidence(supplement) {
  const section = evidenceSection(`${supplement.tool} · project analysis`, `${supplement.findings.length} findings · ${supplement.dependencies.length} dependency edges. This evidence does not alter the complexity or lint measurements.`);
  for (const value of supplement.findings.slice(0, 40)) section.append(element('p', `${value.file}:${value.line ?? '?'} · ${value.category}: ${value.message}`));
  for (const edge of supplement.dependencies.slice(0, 40)) section.append(element('p', `${edge.from} → ${edge.to}`, 'dependency-edge'));
  if (supplement.findings.length + supplement.dependencies.length > 40) section.append(element('p', 'Lists are limited to 40 entries here; full results are in the JSON report.'));
  return section;
}

export function drawEvidence(report, chooseFile) {
  $('evidence').replaceChildren(analyzerEvidence(report), lintEvidence(report, chooseFile), duplicationEvidence(report, chooseFile),
    ...report.supplements.map(supplementalEvidence));
}
