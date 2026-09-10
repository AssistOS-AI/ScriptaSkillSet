import { EXTRA_ENGINES } from './providers.mjs';
import { createExtraCloudBackend } from './extra-cloud.mjs';
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import path from 'node:path';
import { ROOT, hashFile, hash, canonical, readJSON, exists, fail, directoryFingerprint } from './util.mjs';
import { writeWav } from './wav.mjs';
import { createCloudBackend } from './cloud.mjs';

export function actingInstruction(direction = {}) {
  const parts = ['Read only the supplied text. Keep the voice identity consistent.'];
  if (direction.emotion) parts.push(`Emotion: ${direction.emotion}.`);
  if (direction.intensity !== undefined) parts.push(`Emotional intensity: ${Math.round(direction.intensity * 100)} out of 100; do not confuse intensity with loudness.`);
  if (direction.pace !== undefined) parts.push(direction.pace < .9 ? 'Speak slowly and deliberately.' : direction.pace > 1.1 ? 'Speak briskly but intelligibly.' : 'Use a natural conversational pace.');
  if (direction.pace !== undefined) parts.push(`Aim for approximately ${Math.round(direction.pace * 100)} percent of your usual speaking rate; keep natural phrasing.`);
  if (direction.delivery) parts.push(direction.delivery);
  if (direction.emphasis?.length) parts.push(`Emphasize these words naturally: ${direction.emphasis.join(', ')}.`);
  return parts.join(' ');
}
export class JsonlWorker {
  constructor(python, worker, timeoutMs = 600000) {
    this.pending = new Map(); this.counter = 0; this.dead = false;
    this.child = spawn(python, ['-u', worker], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PYTHONUNBUFFERED: '1' } });
    this.timeoutMs = timeoutMs;
    this.child.stderr.on('data', data => process.stderr.write(data));
    const lines = readline.createInterface({ input: this.child.stdout });
    lines.on('line', line => {
      let message;
      try { message = JSON.parse(line); } catch { this.abort(new Error(`Worker protocol corruption: ${line.slice(0, 160)}`)); return; }
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer); this.pending.delete(message.id);
      message.ok ? pending.resolve(message.result) : pending.reject(new Error(message.error));
    });
    this.child.on('error', error => this.abort(error));
    this.child.on('exit', (code, signal) => this.abort(new Error(`Worker exited: ${code ?? signal}`)));
    this.child.stdin.on('error', error => this.abort(error));
  }
  request(data) {
    if (this.dead) return Promise.reject(new Error('Worker is not running'));
    const id = ++this.counter;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.abort(new Error(`Worker timeout after ${this.timeoutMs} ms`)), this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ id, ...data }) + '\n');
    });
  }
  abort(error) {
    this.dead = true;
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(error); }
    this.pending.clear();
    if (this.child.exitCode === null && !this.child.killed) this.child.kill();
  }
  async close() { if (!this.dead) { try { await this.request({ op: 'close' }); } finally { this.child.stdin.end(); this.child.kill(); this.dead = true; } } }
}
export async function createBackend(engine, options = {}) {
  const codeFingerprint = hash(canonical(await Promise.all(['python/worker.py', 'python/backends.py', 'src/backend.mjs', 'python/piper_worker.py'].map(f => hashFile(path.join(ROOT, f))))));
  if (engine === 'test-tone') {
    return { info: { engine, control: 'test-signal-not-speech', warnings: ['TEST SIGNALS. Not speech.'], versions: { node: process.version } }, fingerprint: codeFingerprint,
      async synthesize(job, output) {
        const sr = 24000, n = Math.round(sr * (.25 + job.text.length / 45)), samples = new Float32Array(n);
        const frequency = 180 + Number.parseInt(hash(job.text + job.seed).slice(0, 4), 16) % 400;
        for (let i=0;i<n;i++) samples[i]=.18*Math.sin(2*Math.PI*frequency*i/sr)*Math.min(1,i/200,(n-1-i)/200);
        await writeWav(output, { sampleRate: sr, channels: [samples] }); return { frames: n, sampleRate: sr, clampedSamples: 0 };
      }, async close() {} };
  }
  if (EXTRA_ENGINES.includes(engine)) return createExtraCloudBackend(engine, options);
  if (['openai', 'elevenlabs', 'azure'].includes(engine)) return createCloudBackend(engine, options);
  if (!['piper', 'qwen', 'kokoro'].includes(engine)) fail(`Unknown engine ${engine}`);
  const configPath = options.config ? path.resolve(String(options.config)) : path.join(ROOT, 'runtime', engine + '.json');
  if (!(await exists(configPath))) fail(`Missing ${configPath}. Use node "${path.join(ROOT, 'bin/audio.mjs')}" setup ${engine} --download for authorized local preparation, or supply --config PATH to an existing runtime.`);
  const config = await readJSON(configPath);
  if (config.engine !== engine) fail('Backend config engine does not match --engine');
  config.modelDir = path.resolve(ROOT, config.modelDir); config.root = ROOT;
  const python = options.python ? String(options.python) : path.resolve(ROOT, config.python);
  if (config.device === 'mps' && process.platform !== 'darwin') fail('mps requires macOS and a compatible PyTorch installation');
  if (!(await exists(python))) fail(`Missing private Python: ${python}. Rebuild this machine's venv; do not copy a venv between operating systems.`);
  process.stderr.write('Hashing local model files for reproducible cache identity...\n');
  const modelFingerprint = await directoryFingerprint(config.modelDir);
  const worker = new JsonlWorker(python, path.join(ROOT, 'python', engine === 'piper' ? 'piper_worker.py' : 'worker.py'), Number(options['timeout-ms'] ?? 600000));
  let info;
  try { info = await worker.request({ op: 'init', config }); } catch(e) { worker.abort(e); throw e; }
  const fingerprint = hash(canonical({ codeFingerprint, model: modelFingerprint.sha256, config: { device: config.device, dtype: config.dtype, mode: config.mode, attention: config.attention }, versions: info.versions }));
  return { info: { ...info, modelSha256: modelFingerprint.sha256 }, fingerprint,
    validateJob: engine === 'piper' ? job => { if (job.language.split('-')[0] !== config.language) fail('Piper voice language does not match score'); if (job.voice?.piperVoice && job.voice.piperVoice !== config.voice) fail('Piper voice differs from prepared model'); } : undefined,
    synthesize: (job, output) => worker.request({ op: 'synthesize', job, output }), close: () => worker.close() };
}
