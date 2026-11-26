// Headless smoke test for Kestrel Courier. Node 22 standard library only: serve the game, drive real
// Chrome keyboard events through CDP, exercise fuel, flight, crash/results and every screenshot scene.
//
//   node tools/smoke.mjs

import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const profileDir = join(root, '.tmp', 'smoke-profile');
const chromePath = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const children = [];
let cdp = null;
let finished = false;
const results = [];
let failures = 0;

function ok(name, detail = '') {
  results.push(`ok - ${name}${detail ? `: ${detail}` : ''}`);
}

function notOk(name, detail = '') {
  failures += 1;
  results.push(`not ok - ${name}${detail ? `: ${detail}` : ''}`);
}

function assert(condition, name, detail = '') {
  if (condition) ok(name, detail);
  else notOk(name, detail);
}

function cleanup() {
  if (finished) return;
  finished = true;
  try { cdp?.close(); } catch {}
  for (const child of children.reverse()) {
    if (!child || child.killed) continue;
    try {
      if (process.platform === 'win32') spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      else child.kill('SIGKILL');
    } catch {}
  }
}

process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(130); });
process.on('unhandledRejection', (error) => {
  console.error('smoke failed:', error?.stack ?? error);
  cleanup();
  process.exit(1);
});

function startServer() {
  return new Promise((resolve, reject) => {
    const server = spawn(process.execPath, ['serve.ts'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    children.push(server);
    let output = '';
    const timer = setTimeout(() => reject(new Error('serve.ts did not start in 10s')), 10000);
    server.stdout.on('data', (chunk) => {
      output += chunk;
      if (/game\/ is on/.test(output)) {
        clearTimeout(timer);
        resolve(server);
      }
    });
    server.stderr.on('data', (chunk) => process.stderr.write(chunk));
    server.on('exit', (code) => { if (code && !finished) reject(new Error(`serve.ts exited with ${code}`)); });
  });
}

function startChrome() {
  rmSync(profileDir, { recursive: true, force: true });
  mkdirSync(profileDir, { recursive: true });
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9222',
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--hide-scrollbars',
    '--enable-unsafe-swiftshader',
    '--disable-background-networking',
    '--window-size=1280,720',
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  children.push(chrome);
  let stderr = '';
  chrome.stderr.on('data', (chunk) => { stderr += chunk; });
  chrome.on('exit', (code) => {
    if (!finished && code) console.error(`chrome exited with ${code}\n${stderr.slice(-1500)}`);
  });
  return chrome;
}

async function waitForChrome() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const response = await fetch('http://127.0.0.1:9222/json/version');
      if (response.ok) return response.json();
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Chrome DevTools endpoint did not appear on port 9222');
}

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = new Map();
    socket.addEventListener('message', (event) => this.onMessage(event.data));
    socket.addEventListener('close', () => {
      for (const { reject } of this.pending.values()) reject(new Error('CDP socket closed'));
      this.pending.clear();
    });
  }

  onMessage(raw) {
    let message;
    try { message = JSON.parse(raw); } catch { return; }
    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(`${message.error.message} (${message.error.code})`));
      else resolve(message.result);
      return;
    }
    if (message.method) {
      for (const handler of this.handlers.get(message.method) ?? []) handler(message.params);
    }
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, handler) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(handler);
  }

  close() { this.socket.close(); }
}

async function openClient(target) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('CDP WebSocket failed to open')), { once: true });
  });
  return new CdpClient(socket);
}

async function newTarget() {
  const response = await fetch('http://127.0.0.1:9222/json/new?about:blank', { method: 'PUT' });
  if (!response.ok) throw new Error(`could not create target: ${response.status}`);
  return response.json();
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? 'evaluate failed');
  }
  return result.result?.value;
}

async function sleep(ms) { await new Promise((resolve) => setTimeout(resolve, ms)); }

async function key(client, type, code, keyName, vk) {
  await client.send('Input.dispatchKeyEvent', {
    type,
    code,
    key: keyName,
    windowsVirtualKeyCode: vk,
    nativeVirtualKeyCode: vk,
  });
}

async function openPage(url, collect) {
  const target = await newTarget();
  const client = await openClient(target);
  const consoleErrors = [];
  const foreign = [];
  client.on('Runtime.consoleAPICalled', (params) => {
    if (params.type === 'error') consoleErrors.push(params.args.map((arg) => arg.value ?? arg.description ?? '').join(' '));
  });
  client.on('Runtime.exceptionThrown', (params) => {
    consoleErrors.push(params.exceptionDetails?.exception?.description ?? params.exceptionDetails?.text ?? 'exception');
  });
  client.on('Network.requestWillBeSent', (params) => {
    const requestUrl = params.request?.url ?? '';
    if (/^(https?|wss?):/i.test(requestUrl) && !/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(requestUrl)) foreign.push(requestUrl);
  });
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Network.enable');
  await client.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await client.send('Page.navigate', { url });
  if (collect) collect(client, consoleErrors, foreign);
  return { target, client, consoleErrors, foreign };
}

async function waitFor(client, expression, timeout = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      if (await evaluate(client, expression)) return true;
    } catch {}
    await sleep(200);
  }
  return false;
}

async function main() {
  await startServer();
  startChrome();
  await waitForChrome();

  let consoleErrors = [];
  let foreign = [];
  const game = await openPage('http://127.0.0.1:8080/?skipTitle=1', (client, errors, external) => {
    consoleErrors = errors;
    foreign = external;
  });
  cdp = game.client;
  assert(await waitFor(game.client, 'window.__kestrel?.ready === true'), 'boot', 'window.__kestrel.ready');
  const webgl = await evaluate(game.client, `(() => { const canvas = document.querySelector('#scene'); return Boolean(canvas && (canvas.getContext('webgl2') || canvas.getContext('webgl'))); })()`);
  assert(webgl === true, 'webgl renderer present');
  assert(await evaluate(game.client, `window.__kestrel.qa.startMission('first-light')`) === true, 'startMission(first-light)');
  await sleep(400);

  const before = await evaluate(game.client, 'window.__kestrel.state');
  await key(game.client, 'keyDown', 'ShiftLeft', 'Shift', 16);
  await sleep(1400);
  await key(game.client, 'keyUp', 'ShiftLeft', 'Shift', 16);
  await key(game.client, 'keyDown', 'KeyW', 'w', 87);
  await sleep(1200);
  await key(game.client, 'keyUp', 'KeyW', 'w', 87);
  await sleep(200);
  const after = await evaluate(game.client, 'window.__kestrel.state');
  assert(after.iasKts > before.iasKts + 1, 'keyboard throttle raises airspeed', `${before.iasKts.toFixed(1)} -> ${after.iasKts.toFixed(1)} kt`);
  assert(after.throttle > before.throttle + 0.05, 'keyboard throttle raises throttle', `${(before.throttle * 100).toFixed(0)}% -> ${(after.throttle * 100).toFixed(0)}%`);

  const fuelBefore = await evaluate(game.client, `(() => { window.__kestrel.qa.startMission('first-light'); return window.__kestrel.state.fuel; })()`);
  const fuelRun = await evaluate(game.client, `(() => { window.__kestrel.qa.setControl('throttle', 1); window.__kestrel.qa.step(3); return window.__kestrel.state; })()`);
  assert(fuelRun.fuel < fuelBefore - 0.1, 'fuel burns under power', `${fuelBefore.toFixed(2)} -> ${fuelRun.fuel.toFixed(2)}`);

  const rings = await evaluate(game.client, `(() => {
    const q = window.__kestrel.qa;
    q.startMission('narrows');
    let best = 0;
    for (let i = 0; i < 600; i += 1) {
      const snap = q.snapshot();
      const m = snap.mission;
      if (!m || m.status !== 'flying') break;
      const s = snap.state;
      const t = m.target;
      if (t) {
        const desired = Math.atan2(t.x - s.x, -(t.z - s.z)) * 180 / Math.PI;
        let error = ((desired - s.heading + 540) % 360) - 180;
        q.setControl('roll', Math.max(-0.9, Math.min(0.9, error * 0.04)));
        q.setControl('pitch', Math.max(-0.5, Math.min(0.5, (t.y * 3.28084 - s.altFt) / 180)));
        q.setControl('throttle', 0.7);
      }
      q.step(0.25);
      const next = q.snapshot();
      best = Math.max(best, next.mission?.ringIndex ?? 0);
      if (next.mode === 'results') break;
    }
    return { best, snap: q.snapshot() };
  })()`);
  assert(rings.best >= 1, 'ring gate can be collected', `ringIndex ${rings.best}`);
  assert(rings.snap.mode === 'results' || rings.best >= 4, 'ring course progresses', `mode ${rings.snap.mode}, ring ${rings.best}`);

  const dive = await evaluate(game.client, `(() => {
    window.__kestrel.qa.startMission('narrows');
    window.__kestrel.qa.setControl('throttle', 0);
    window.__kestrel.qa.setControl('pitch', -1);
    window.__kestrel.qa.setControl('roll', 0.2);
    window.__kestrel.qa.step(10);
    return { state: window.__kestrel.state, mode: window.__kestrel.mode, mission: window.__kestrel.mission };
  })()`);
  assert(dive.state.crashed === true, 'crash path reaches crashed state', dive.state.crashReason ?? '');
  assert(dive.mode === 'results', 'crash presents results', `mode ${dive.mode}`);

  const snapshot = await evaluate(game.client, 'JSON.stringify(window.__kestrel.qa.snapshot()).length');
  assert(Number(snapshot) > 100, 'QA snapshot serialises');

  for (const name of ['cover', 'cockpit', 'rings', 'landing']) {
    const page = await openPage(`http://127.0.0.1:8080/?shot=${name}`);
    const ready = await waitFor(page.client, 'window.__shotReady === true', 20000);
    assert(ready, `shot ${name} ready`);
    assert(page.consoleErrors.length === 0, `shot ${name} no console errors`, page.consoleErrors.join(' | '));
    assert(page.foreign.length === 0, `shot ${name} no external requests`, page.foreign.join(' | '));
    page.client.close();
    await fetch(`http://127.0.0.1:9222/json/close/${page.target.id}`);
  }

  assert(consoleErrors.length === 0, 'no console errors', consoleErrors.join(' | '));
  assert(foreign.length === 0, 'no external requests', foreign.join(' | '));

  console.log(results.join('\n'));
  cleanup();
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error('smoke failed:', error?.stack ?? error);
  cleanup();
  process.exit(1);
});
