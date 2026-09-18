import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

// Native CDP avoids an npm browser controller. A fresh profile never reuses a user session.
export async function openBrowser(executable) {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'validatebook-chromium-'));
  const child = spawn(executable, ['--headless=new', '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', `--user-data-dir=${profile}`, '--no-first-run', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-extensions', '--metrics-recording-only', '--mute-audio', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let launchError, diagnostics = '';
  child.on('error', error => { launchError = error; });
  child.stderr.on('data', data => { diagnostics = (diagnostics + data).slice(-4000); });
  const stop = async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      await Promise.race([new Promise(resolve => child.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 3000))]);
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
    await fs.rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  };
  try {
    let port;
    const deadline = Date.now() + 20000;
    while (!port && Date.now() < deadline) {
      if (launchError) throw launchError;
      if (child.exitCode !== null || child.signalCode !== null) throw Error(diagnostics);
      try { port = (await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; } catch {}
      if (!port) await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!port) throw Error('Chromium startup timed out. ' + diagnostics);
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(5000) })).json();
    const socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    let sequence = 0;
    const pending = new Map();
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data), entry = pending.get(message.id);
      if (!entry) return;
      clearTimeout(entry.timer); pending.delete(message.id);
      message.error ? entry.reject(Error(message.error.message)) : entry.resolve(message.result);
    });
    const send = (method, params = {}, timeoutMs = 30000) => new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(Error(`CDP timeout: ${method}`)); }, timeoutMs);
      pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, 120000);
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    await send('Page.enable');
    await send('Network.enable');
    // Books are data. Never run their scripts or allow remote resources while auditing.
    await send('Emulation.setScriptExecutionDisabled', { value: true });
    await send('Network.setBlockedURLs', { urls: ['http://*', 'https://*', 'ws://*', 'wss://*'] });
    return { send, evaluate, async close() { socket.close(); for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(Error('Browser closed')); } await stop(); } };
  } catch (error) { await stop(); throw Error(`Chromium unavailable: ${error.message}. See dependencies.md.`); }
}
