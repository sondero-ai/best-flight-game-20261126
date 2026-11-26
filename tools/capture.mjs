// Capture the four deterministic screenshots at 1280 x 720 JPEG under 256 KiB.
// Node 22 standard library only: a static server, headless Chrome and the Chrome DevTools Protocol.
//
//   node tools/capture.mjs            all four shots
//   node tools/capture.mjs cover      one or more named shots

import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const screenshotsDir = join(root, 'screenshots');
const profileDir = join(root, '.tmp', 'chrome-profile');
const chromePath = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SHOTS = [
  { name: '1-cover.jpg', shot: 'cover' },
  { name: '2-cockpit.jpg', shot: 'cockpit' },
  { name: '3-rings.jpg', shot: 'rings' },
  { name: '4-landing.jpg', shot: 'landing' },
];
const requested = process.argv.slice(2);
const selected = requested.length ? SHOTS.filter((shot) => requested.includes(shot.shot) || requested.includes(shot.name)) : SHOTS;
if (!selected.length) {
  console.error(`unknown shot; use one of ${SHOTS.map((s) => s.shot).join(', ')}`);
  process.exit(2);
}

const children = [];
let finished = false;
let cdp = null;

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
  console.error('capture failed:', error?.stack ?? error);
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
    server.on('exit', (code) => {
      if (code && !finished) reject(new Error(`serve.ts exited with ${code}`));
    });
  });
}

function startChrome() {
  rmSync(profileDir, { recursive: true, force: true });
  mkdirSync(profileDir, { recursive: true });
  const args = [
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
  ];
  const chrome = spawn(chromePath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  children.push(chrome);
  let stderr = '';
  chrome.stderr.on('data', (chunk) => { stderr += chunk; });
  chrome.on('exit', (code) => {
    if (!finished && code) console.error(`chrome exited with ${code}\n${stderr.slice(-2000)}`);
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
    this.eventLog = [];
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
      const list = this.handlers.get(message.method);
      if (list) for (const handler of list) handler(message.params);
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

  close() {
    this.socket.close();
  }
}

async function newTarget(url) {
  const response = await fetch(`http://127.0.0.1:9222/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  if (!response.ok) throw new Error(`could not create Chrome target: ${response.status}`);
  return response.json();
}

function jpegSize(buffer) {
  let offset = 2;
  while (offset < buffer.length - 9) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    const marker = buffer[offset + 1];
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    const length = buffer.readUInt16BE(offset + 2);
    offset += 2 + length;
  }
  return null;
}

async function openClient(target) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('CDP WebSocket failed to open')), { once: true });
  });
  return new CdpClient(socket);
}

async function main() {
  mkdirSync(screenshotsDir, { recursive: true });
  await startServer();
  startChrome();
  await waitForChrome();
  const foreign = [];
  const failures = [];
  const consoleErrors = [];
  for (const entry of selected) {
    const url = `http://127.0.0.1:8080/?shot=${entry.shot}`;
    const target = await newTarget('about:blank');
    cdp = await openClient(target);
    cdp.on('Runtime.consoleAPICalled', (params) => {
      if (params.type === 'error') {
        consoleErrors.push(params.args.map((arg) => arg.value ?? arg.description ?? '').join(' '));
      }
    });
    cdp.on('Runtime.exceptionThrown', (params) => {
      consoleErrors.push(params.exceptionDetails?.exception?.description ?? params.exceptionDetails?.text ?? 'exception');
    });
    cdp.on('Network.loadingFailed', (params) => {
      if (!params.canceled) failures.push(params.errorText ?? 'request failed');
    });
    cdp.on('Network.requestWillBeSent', (params) => {
      const requestUrl = params.request?.url ?? '';
      if (/^(https?|wss?):/i.test(requestUrl) && !/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(requestUrl)) {
        foreign.push(requestUrl);
      }
    });
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.navigate', { url });
    let ready = false;
    const started = Date.now();
    while (Date.now() - started < 30000) {
      const result = await cdp.send('Runtime.evaluate', { expression: 'window.__shotReady === true', returnByValue: true });
      if (result.result?.value === true) { ready = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!ready) {
      if (consoleErrors.length) console.error(`console errors before ${entry.name}:\n${consoleErrors.join('\n')}`);
      if (failures.length) console.error(`failed requests before ${entry.name}:\n${[...new Set(failures)].join('\n')}`);
      throw new Error(`${entry.name}: __shotReady never became true at ${url}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (process.env.CAPTURE_HIDE_OVERLAYS === '1') {
      await cdp.send('Runtime.evaluate', {
        expression: `(() => { const style = document.createElement('style'); style.textContent = '#hud,#screens,.world-vignette,.world-grain{display:none!important}'; document.head.appendChild(style); })()`,
      });
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    if (process.env.CAPTURE_DEBUG_EVAL) {
      await cdp.send('Runtime.evaluate', { expression: process.env.CAPTURE_DEBUG_EVAL, returnByValue: true });
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    let quality = 90;
    let data = null;
    let buffer = null;
    while (quality >= 45) {
      const result = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality, fromSurface: true });
      data = result.data;
      buffer = Buffer.from(data, 'base64');
      if (buffer.length <= 262144) break;
      quality -= 3;
    }
    if (!buffer || buffer.length > 262144) throw new Error(`${entry.name}: JPEG still ${buffer?.length ?? 0} bytes at quality ${quality}`);
    const size = jpegSize(buffer);
    if (!size || size.width !== 1280 || size.height !== 720) {
      throw new Error(`${entry.name}: expected 1280x720, got ${size ? `${size.width}x${size.height}` : 'not a JPEG'}`);
    }
    const outName = `${process.env.CAPTURE_PREFIX ?? ''}${entry.name}`;
    const outDir = process.env.CAPTURE_OUT_DIR ? join(root, process.env.CAPTURE_OUT_DIR) : screenshotsDir;
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, outName), buffer);
    console.log(`${outName}: ${buffer.length} bytes, ${size.width}x${size.height}, q${quality}`);
    cdp.close();
    cdp = null;
    await fetch(`http://127.0.0.1:9222/json/close/${target.id}`);
  }
  if (consoleErrors.length) {
    console.error('console errors:\n' + consoleErrors.map((line) => `  ${line}`).join('\n'));
    process.exitCode = 1;
  }
  if (failures.length) {
    console.error('failed requests:\n' + [...new Set(failures)].map((line) => `  ${line}`).join('\n'));
    process.exitCode = 1;
  }
  if (foreign.length) {
    console.error('foreign requests:\n' + [...new Set(foreign)].map((line) => `  ${line}`).join('\n'));
    process.exitCode = 1;
  }
  if (!consoleErrors.length && !failures.length && !foreign.length) console.log('screenshots ok');
  cleanup();
  process.exit(process.exitCode ?? 0);
}

main().catch((error) => {
  console.error('capture failed:', error?.stack ?? error);
  cleanup();
  process.exit(1);
});
