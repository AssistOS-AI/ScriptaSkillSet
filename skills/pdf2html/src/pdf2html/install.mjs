import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { setTimeout } from 'node:timers/promises';

export function validAsset(bytes, expected) {
  return bytes.length === expected.bytes && createHash('sha256').update(bytes).digest('hex') === expected.sha256;
}

export async function installAsset(path, expected) {
  try { if (validAsset(await readFile(path), expected)) return false; } catch {}
  process.stderr.write(`Installing ${path.split('/').at(-1)}\n`);
  const response = await fetch(expected.url, { signal: AbortSignal.timeout(600000) });
  if (!response.ok) throw new Error(`Download failed: HTTP ${response.status} for ${expected.url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!validAsset(bytes, expected)) throw new Error(`Checksum mismatch: ${expected.url}`);
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.download-${process.pid}`;
  try { await writeFile(temporary, bytes); await rename(temporary, path); }
  finally { await rm(temporary, { force: true }); }
  return true;
}

export async function withInstallLock(root, action, { timeout = 1800000, interval = 1000 } = {}) {
  const lock = `${root}/.cache/setup.lock`;
  await mkdir(dirname(lock), { recursive: true });
  const started = Date.now();
  let reported = false;
  while (true) {
    try { await mkdir(lock); break; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (!reported) { process.stderr.write('Waiting for the active skill installation.\n'); reported = true; }
      if (Date.now() - started > timeout) throw new Error(`Installation lock timed out: ${lock}. Check for another installer before removing a stale lock.`);
      await setTimeout(interval);
    }
  }
  try { await writeFile(`${lock}/owner.json`, JSON.stringify({ pid: process.pid, started })); return await action(); }
  finally { await rm(lock, { recursive: true, force: true }); }
}
