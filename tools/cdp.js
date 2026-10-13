/*
 * Minimal Chrome DevTools Protocol driver with zero dependencies (Node 18+:
 * global fetch and WebSocket). Used by the end-to-end tests and the screenshot tool.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function findChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch(opts) {
  opts = opts || {};
  const exe = findChrome();
  if (!exe) return null;
  const port = 9300 + Math.floor(Math.random() * 600);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kuru-chrome-'));
  const w = opts.width || 1400, h = opts.height || 900;
  const proc = spawn(exe, [
    '--headless=new', `--remote-debugging-port=${port}`, `--window-size=${w},${h}`, `--user-data-dir=${profile}`,
    '--allow-file-access-from-files', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
    '--no-first-run', '--no-default-browser-check', ...(process.platform === 'linux' ? ['--no-sandbox'] : []), '--autoplay-policy=no-user-gesture-required', 'about:blank',
  ], { stdio: 'ignore' });

  let targets = [];
  for (let i = 0; i < 75 && !targets.length; i++) {
    try { targets = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).filter((t) => t.type === 'page'); } catch (e) { /* not up yet */ }
    if (!targets.length) await sleep(200);
  }
  if (!targets.length) { proc.kill(); throw new Error('Chrome did not start'); }
  const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });

  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.addEventListener('message', (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      errors.push((d.exception && d.exception.description) || d.text);
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push('console.error: ' + msg.params.args.map((a) => a.value || a.description || '').join(' ').slice(0, 2000));
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error' && !/favicon/.test(msg.params.entry.url || '')) errors.push('log: ' + msg.params.entry.text);
  });
  const send = (method, params) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');

  const page = {
    errors,
    // Navigate, then wait until the NEW document has fully loaded (unloading a heavy WebGL page can be slow).
    async goto(url, waitMs) {
      await send('Page.navigate', { url });
      const end = Date.now() + 20000;
      while (Date.now() < end) {
        const r = await send('Runtime.evaluate', { expression: 'location.href + "|" + document.readyState', returnByValue: true });
        const v = (r.result && r.result.result && r.result.result.value) || '';
        if (decodeURI(v.split('|')[0]) === decodeURI(url) && v.endsWith('|complete')) break;
        await sleep(100);
      }
      await sleep(waitMs || 1500);
    },
    async eval(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.result.exceptionDetails) throw new Error('eval failed: ' + ((r.result.exceptionDetails.exception || {}).description || r.result.exceptionDetails.text));
      return r.result.result.value;
    },
    async screenshot(file) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
    },
    async waitFor(expr, timeoutMs) {
      const end = Date.now() + (timeoutMs || 20000);
      while (Date.now() < end) { if (await page.eval(expr)) return true; await sleep(150); }
      throw new Error('timed out waiting for: ' + expr);
    },
    async close() { try { ws.close(); } catch (e) { /* ignore */ } proc.kill(); },
  };
  return page;
}

const fileUrl = (rel) => 'file:///' + path.resolve(__dirname, '..', rel).replace(/\\/g, '/');

module.exports = { launch, findChrome, sleep, fileUrl };
