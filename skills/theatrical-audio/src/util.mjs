import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const VERSION = '3.2.0';
export const fail = (message) => { throw new Error(message); };
export const hash = (value) => createHash('sha256').update(value).digest('hex');
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
export async function hashFile(file) {
  const h = createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) h.update(chunk);
  return h.digest('hex');
}
export async function atomicWrite(file, data) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const temp = file + '.' + randomUUID() + '.tmp';
  try { await fsp.writeFile(temp, data); await fsp.rename(temp, file); }
  finally { await fsp.rm(temp, { force: true }); }
}
export const writeJSON = (file, data) => atomicWrite(file, JSON.stringify(data, null, 2) + '\n');
export async function readJSON(file) {
  let data;
  try { data = await fsp.readFile(file, 'utf8'); }
  catch (e) { throw new Error(`Cannot read ${file}: ${e.message}`); }
  try { return JSON.parse(data); }
  catch (e) { throw new Error(`Invalid JSON in ${file}: ${e.message}`); }
}
export async function exists(file) { try { await fsp.access(file); return true; } catch { return false; } }
export function safeRelative(base, name) {
  const result = path.resolve(base, name);
  if (result !== path.resolve(base) && !result.startsWith(path.resolve(base) + path.sep)) fail(`Path escapes its bundle: ${name}`);
  return result;
}
export async function directoryFingerprint(dir) {
  // Hash actual bytes, not an arbitrary model label. Sequential streaming bounds RAM.
  const entries = [];
  async function visit(folder) {
    for (const entry of (await fsp.readdir(folder, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === '.cache' || entry.name.startsWith('.')) continue;
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile()) entries.push({ file: path.relative(dir, full).split(path.sep).join('/'), sha256: await hashFile(full) });
      else fail(`Models must be materialized regular files, not symlinks: ${full}`);
    }
  }
  await visit(dir);
  if (!entries.length) fail(`No model files in ${dir}`);
  return { sha256: hash(canonical(entries)), files: entries };
}
export function parseArgs(args) {
  const positional = [], options = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) { positional.push(arg); continue; }
    const key = arg.slice(2);
    if (key.includes('=')) fail(`Use --name value, not ${arg}`);
    if (Object.hasOwn(options, key)) fail(`Duplicate option --${key}`);
    options[key] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
  }
  return { positional, options };
}
export function checkOptions(options, allowed) {
  for (const key of Object.keys(options)) if (!allowed.includes(key)) fail(`Unknown option --${key}`);
}
export const dbGain = (db) => 10 ** (db / 20);
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export function secondsToFrames(seconds, sampleRate) {
  if (!Number.isFinite(seconds)) fail('Non-finite time');
  return Math.round(seconds * sampleRate);
}
