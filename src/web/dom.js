export const $ = id => document.getElementById(id);
export const format = value => value.toLocaleString();
export const percent = coverage => coverage && coverage.total ? `${Math.round(coverage.covered / coverage.total * 100)}%` : 'Unknown';

export function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

export function swatch(value) {
  const span = element('span', undefined, 'swatch');
  span.style.background = value;
  span.setAttribute('aria-hidden', 'true');
  return span;
}

export function button(text, action) {
  const node = element('button', text);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
}

export function svgElement(tag, attrs) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

export function debounce(action, delay) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => action(...args), delay); };
}

export function regionFocus() {
  return ['treemap', 'inventory'].find(id => $(id).contains(document.activeElement));
}

export function restoreRegionFocus(container, id) {
  if (!container) return;
  const items = Array.from($(container).querySelectorAll('[data-region]'));
  items.find(item => item.getAttribute('data-region') === id)?.focus();
}
