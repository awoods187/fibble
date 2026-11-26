// Renders public/icons/icon.svg to PNGs with headless Chrome (no image packages).
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const [svgPath, outDir, tmp] = process.argv.slice(2);
const svg = readFileSync(svgPath, 'utf8');
const port = 9800 + Math.floor(Math.random() * 100);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${mkdtempSync(join(tmp, 'p-'))}`,
  'about:blank',
]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let t;
for (let i = 0; i < 50 && !t; i++) {
  await sleep(200);
  try {
    t = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(
      (x) => x.type === 'page',
    );
  } catch {}
}
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pend = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (pend.has(m.id)) {
    pend.get(m.id)(m.result);
    pend.delete(m.id);
  }
});
const send = (method, params = {}) =>
  new Promise((r) => {
    const i = ++id;
    pend.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
// name, size, maskable (full-bleed background, mark inside the 80% safe zone), transparent corners
const jobs = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, true],
];
for (const [name, size, maskable] of jobs) {
  const inner = maskable
    ? svg
        .replace('rx="112"', 'rx="0"')
        .replace('<rect x="150"', '<g transform="translate(51 51) scale(0.8)"><rect x="150"')
        .replace('</svg>', '</g></svg>')
    : svg;
  const html = `<html><body style="margin:0;background:transparent">${inner.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`;
  await send('Emulation.setDeviceMetricsOverride', {
    width: size,
    height: size,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  await send('Page.navigate', {
    url: 'data:text/html;base64,' + Buffer.from(html).toString('base64'),
  });
  await sleep(400);
  const r = await send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 0, y: 0, width: size, height: size, scale: 1 },
  });
  writeFileSync(join(outDir, name), Buffer.from(r.data, 'base64'));
  console.log(name, size);
}
ws.close();
chrome.kill();
