import fs from 'node:fs';
import type { Report } from './model.js';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

export function renderHtml(report: Report): string {
  const css = fs.readFileSync(new URL('./web/report.css', import.meta.url), 'utf8');
  const script = fs.readFileSync(new URL('./web/report.js', import.meta.url), 'utf8');
  // Data is untrusted: file names and lint messages can contain closing script tags.
  const json = JSON.stringify(report).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'">
<title>${escapeHtml(report.name)} · Panopticode</title><style>${css}</style></head>
<body>
<header><div class="brand"><span class="brand-mark" aria-hidden="true">▦</span><span>PANOPTICODE <b>TS</b></span></div><span class="edition">CODEBASE ATLAS / 01</span></header>
<main>
<section class="intro"><div><p class="eyebrow">A FIELD GUIDE TO YOUR CODE</p><h1 id="project-name"></h1><p class="subtitle">See the shape of your code. Find the places that need a closer look.</p></div><div class="stamp">LOCAL ANALYSIS<span id="generated"></span></div></section>
<div id="warnings" role="status"></div>
<section id="summary" class="summary" aria-label="Project summary"></section>
<section class="workspace">
<div class="map-panel"><div class="panel-heading"><div><p class="eyebrow">01 / EXPLORE THE CODEBASE</p><h2>Where does the complexity live?</h2></div><label class="metric-label">Color by <select id="metric"><option value="complexity">Cyclomatic complexity</option><option value="coverage">Line coverage</option><option value="lint">Lint findings by file</option></select></label></div>
<div class="toolbar"><nav id="breadcrumbs" aria-label="Code hierarchy"></nav><label class="search"><span class="sr-only">Find a file or function</span><input id="search" type="search" placeholder="Find a file or function…"></label></div>
<div id="legend" class="legend" aria-label="Color legend"></div>
<p class="map-guide" id="map-guide">Area = source statements · Select a region to inspect · Double-click a group to zoom</p>
<div id="treemap" aria-label="Codebase treemap"></div>
<p id="scope-note" class="scope-note" aria-live="polite"></p></div>
<aside id="detail" class="detail" aria-label="Selected code details" aria-live="polite"></aside>
</section>
<section class="inventory"><div class="panel-heading"><div><p class="eyebrow">02 / FOLLOW THE EVIDENCE</p><h2 id="inventory-title">Functions &amp; module code</h2></div><label>Order by <select id="sort"><option value="complexity">Highest complexity</option><option value="statements">Largest size</option><option value="coverage">Lowest coverage</option><option value="name">Source location</option></select></label></div>
<div class="table-scroll"><table><thead><tr><th scope="col">Function / region</th><th scope="col">Source</th><th scope="col">Statements</th><th scope="col">Complexity</th><th scope="col">Line coverage</th></tr></thead><tbody id="inventory"></tbody></table></div><button id="more" class="more" hidden>Show more regions</button></section>
<section class="methodology"><p class="eyebrow">03 / READ THE MAP</p><h2>Evidence, with its limits in view.</h2><div id="definitions" class="definitions"></div></section>
<footer><span>Panopticode TS · Inspired by Panopticode’s original code health treemaps.</span><span>Generated locally. Works offline.</span></footer>
</main><noscript>This interactive report requires JavaScript. The accompanying report.json contains all analysis data.</noscript>
<script id="report-data" type="application/json">${json}</script><script>${script}</script></body></html>`;
}
