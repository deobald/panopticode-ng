// Optional smoke check using an installed Chromium browser and the DevTools pipe.
// No browser automation package is required or added to the project.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const executable = process.env.PANOPTICODE_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profile = mkdtempSync(path.join(tmpdir(), 'panopticode-browser-'));
const browser = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-pipe', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
let buffer = '';
let sequence = 0;
const pending = new Map();
const errors = [];
const requests = [];
browser.on('error', error => { for (const item of pending.values()) item.reject(error); });
browser.stdio[4].on('data', chunk => {
  buffer += chunk.toString();
  let boundary;
  while ((boundary = buffer.indexOf('\0')) !== -1) {
    const message = JSON.parse(buffer.slice(0, boundary));
    buffer = buffer.slice(boundary + 1);
    if (message.id) {
      const item = pending.get(message.id);
      if (!item) continue;
      pending.delete(message.id);
      clearTimeout(item.timer);
      if (message.error) item.reject(new Error(JSON.stringify(message.error)));
      else item.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    if (message.method === 'Network.requestWillBeSent') requests.push(message.params.request.url);
  }
});
function send(method, params = {}, sessionId) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timer });
    browser.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0');
  });
}

try {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const command = (method, params) => send(method, params, sessionId);
  async function evaluate(expression) {
    const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  await command('Runtime.enable');
  await command('Network.enable');
  await command('Page.enable');
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  const filename = path.resolve(process.argv[2] ?? 'reports/demo/report.html');
  await command('Page.navigate', { url: pathToFileURL(filename).href });
  await evaluate(`new Promise((resolve, reject) => {
    let tries = 0;
    const timer = setInterval(() => {
      if (document.querySelector('#treemap svg') && document.querySelector('#inventory tr')) { clearInterval(timer); resolve(true); }
      else if (++tries > 80) { clearInterval(timer); reject(new Error('Report did not render')); }
    }, 50);
  })`);
  assert.ok(await evaluate(`document.querySelectorAll('#treemap .tile').length > 0`));
  assert.equal(await evaluate(`document.querySelectorAll('#inventory tr').length`), 10);
  await evaluate(`document.querySelector('#metric').value = 'coverage'; document.querySelector('#metric').dispatchEvent(new Event('change'))`);
  assert.match(await evaluate(`document.querySelector('#legend').textContent`), /75–100%/);
  await evaluate(`document.querySelector('#metric').value = 'lint'; document.querySelector('#metric').dispatchEvent(new Event('change'))`);
  assert.match(await evaluate(`document.querySelector('#legend').textContent`), /Warnings/);
  await evaluate(`document.querySelector('#metric').value = 'complexity'; document.querySelector('#metric').dispatchEvent(new Event('change'))`);
  await evaluate(`document.querySelector('#search').value = 'validateCheckout'; document.querySelector('#search').dispatchEvent(new Event('input')); new Promise(r => setTimeout(r, 180))`);
  assert.equal(await evaluate(`document.querySelectorAll('#inventory tr').length`), 1);
  await evaluate(`document.querySelector('#inventory button').click()`);
  await evaluate(`document.querySelector('#inventory button').focus(); document.querySelector('#inventory button').click()`);
  assert.equal(await evaluate(`document.activeElement.closest('#inventory') !== null`), true, 'Selection retains keyboard focus');
  assert.equal(await evaluate(`document.querySelector('#detail h3').textContent`), 'validateCheckout');
  assert.match(await evaluate(`document.querySelector('#detail').textContent`), /Demonstration finding/);
  await evaluate(`document.querySelector('#search').value = 'no-such-function'; document.querySelector('#search').dispatchEvent(new Event('input')); new Promise(r => setTimeout(r, 180))`);
  assert.match(await evaluate(`document.querySelector('#treemap').textContent`), /No regions match/);
  await evaluate(`document.querySelector('#search').value = ''; document.querySelector('#search').dispatchEvent(new Event('input')); new Promise(r => setTimeout(r, 180))`);
  // Find a named directory using accessible region labels; exercise selection and drill-down.
  await evaluate(`Array.from(document.querySelectorAll('#treemap .tile')).find(node => node.getAttribute('aria-label').startsWith('api.')).dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
  await evaluate(`Array.from(document.querySelectorAll('#detail button')).find(node => node.textContent.includes('Open this group')).click()`);
  assert.match(await evaluate(`document.querySelector('#breadcrumbs').textContent`), /api/);
  assert.equal(await evaluate(`document.querySelectorAll('#inventory tr').length`), 2);
  await evaluate(`document.querySelector('#breadcrumbs button').click()`);
  assert.equal(await evaluate(`document.querySelectorAll('#inventory tr').length`), 10);
  await evaluate(`document.querySelector('#inventory button').click()`);
  mkdirSync('reports/demo', { recursive: true });
  const desktop = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync('reports/demo/desktop.png', Buffer.from(desktop.data, 'base64'));
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate('new Promise(r => setTimeout(r, 150))');
  assert.ok(await evaluate(`document.documentElement.scrollWidth <= 390`), 'Mobile page must not overflow horizontally');
  const mobile = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync('reports/demo/mobile.png', Buffer.from(mobile.data, 'base64'));
  assert.deepEqual(errors, [], 'No browser runtime exceptions');
  assert.ok(requests.every(url => url.startsWith('file:') || url.startsWith('data:')), `Unexpected external requests: ${requests}`);
  console.log('Browser check passed: offline load, all metrics, search, selection, lint details, group navigation, desktop/mobile layout.');
} finally {
  for (const item of pending.values()) clearTimeout(item.timer);
  browser.kill();
  await new Promise(resolve => browser.once('exit', resolve));
  rmSync(profile, { recursive: true, force: true });
}
