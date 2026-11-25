// Capture real screenshots of the game with headless Chrome over CDP.
// Usage: node capture.mjs — screenshots each staged ?shot= state from
// shots.json into screenshots/ as real renders of the game's own code.
// The game files are opened directly (file://) because this Chrome build
// blocks navigation from about:blank to local HTTP servers.
// Do NOT use --screenshot: it silently produces no file on this machine.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const ROOT = new URL('./', import.meta.url).pathname;
const GAME = ROOT + 'game/index.html';
const shots = JSON.parse(readFileSync(ROOT + 'shots.json', 'utf8'));
const CHROME = '/opt/meta-chromium/chrome';
const PROFILE = '/tmp/warung-chrome-profile';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitOk(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return true; } catch {}
    await sleep(250);
  }
  return false;
}

rmSync(PROFILE, { recursive: true, force: true });
const chrome = spawn(CHROME, [
  '--headless', '--no-sandbox', '--disable-gpu',
  '--remote-allow-origins=*',
  '--hatch-webgl-allowed-domains-file=/var/lib/hatch-browser/rootfs-base/usr/share/hatch/chromium/webgl-allowed-domains.txt',
  '--hatch-webgl-allowed-domains-sha256=8097045f0459c96c4cdc76e3a1af4e0f43f640b4b59c43d6db35e3641c0264c6',
  '--remote-debugging-port=9229',
  `--user-data-dir=${PROFILE}`,
  '--window-size=984,664', '--force-device-scale-factor=1',
  'about:blank',
], { stdio: 'ignore' });

try {
  if (!await waitOk('http://127.0.0.1:9229/json/version')) throw new Error('chrome did not start');
  mkdirSync(ROOT + 'screenshots', { recursive: true });
  for (const shot of shots) {
    const page = 'file://' + GAME + shot.query;
    const t = await (await fetch(`http://127.0.0.1:9229/json/new?${encodeURIComponent(page)}`, { method: 'PUT' })).json();
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0;
    const pending = new Map();
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
    };
    const cmd = (method, params = {}) => new Promise((res) => {
      const i = ++id;
      pending.set(i, res);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
    await cmd('Page.enable');
    await cmd('Runtime.enable');
    await sleep(1800);
    const errors = await cmd('Runtime.evaluate', { expression: 'window.__warung ? "ok" : "missing"', returnByValue: true });
    const shotRes = await cmd('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
    if (!shotRes.result?.data) throw new Error('no screenshot data for ' + shot.name);
    const buf = Buffer.from(shotRes.result.data, 'base64');
    writeFileSync(ROOT + 'screenshots/' + shot.name, buf);
    console.log(shot.name, buf.length + ' bytes', 'game=' + (errors.result?.result?.value ?? '?'));
    ws.close();
  }
  console.log('done');
} finally {
  chrome.kill('SIGTERM');
}
