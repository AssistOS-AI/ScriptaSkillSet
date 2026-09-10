import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { ROOT } from '../src/util.mjs';
import { ENV_KEYS, loadWorkspaceEnvironment } from '../src/config.mjs';

async function temporary(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'audio portable '));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

test('credential files are optional and never discovered in parent projects', async t => {
  const dir = await temporary(t);
  const child = path.join(dir, 'unrelated project');
  await fs.mkdir(child);
  await fs.writeFile(path.join(dir, '.apikeys'), 'GEMINI_API_KEY=fixture-only\n');
  const env = {};
  assert.deepEqual(await loadWorkspaceEnvironment(child, env), { workspaceRoot: null, loadedFiles: [] });
  assert.deepEqual(env, {});
  await loadWorkspaceEnvironment(child, env, { 'workspace-root': dir });
  assert.equal(env.GEMINI_API_KEY, 'fixture-only');
});

test('explicit env file precedes shared workspace variables, process values win', async t => {
  const dir = await temporary(t);
  await fs.writeFile(path.join(dir, 'speech.env'), 'GEMINI_API_KEY=file-fixture\nAUDIO_ENGINE=gemini\n');
  await fs.writeFile(path.join(dir, '.apikeys'), 'GEMINI_API_KEY=workspace-fixture\nGROQ_API_KEY=groq-fixture\nDATABASE_URL=unrelated\n');
  const env = { GEMINI_API_KEY: 'process-fixture' };
  await loadWorkspaceEnvironment(dir, env, { 'credentials-file': 'speech.env', 'workspace-root': '.' });
  assert.deepEqual(env, { GEMINI_API_KEY: 'process-fixture', AUDIO_ENGINE: 'gemini', GROQ_API_KEY: 'groq-fixture' });
  const fromFile = {};
  await loadWorkspaceEnvironment(dir, fromFile, { 'credentials-file': 'speech.env', 'workspace-root': '.' });
  assert.equal(fromFile.GEMINI_API_KEY, 'file-fixture');
  await assert.rejects(loadWorkspaceEnvironment(dir, {}, { 'credentials-file': 'missing.env' }), /Missing environment file/);
  assert.deepEqual((await loadWorkspaceEnvironment(dir, {}, { 'workspace-root': 'absent' })).loadedFiles, []);
});

async function digestTree(dir) {
  const hash = createHash('sha256');
  async function visit(current) {
    for (const entry of (await fs.readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(file);
      else { hash.update(path.relative(dir, file)); hash.update(await fs.readFile(file)); }
    }
  }
  await visit(dir);
  return hash.digest('hex');
}

test('copied skill runs from another project without configuration or writes to its installation', async t => {
  const dir = await temporary(t);
  const copy = path.join(dir, 'installed skill');
  const project = path.join(dir, 'new project');
  await fs.cp(ROOT, copy, { recursive: true, filter: file => {
    const relative = path.relative(ROOT, file);
    return !relative.split(path.sep).some(part => ['node_modules', '.env', '.apikeys', 'audio.config.json', 'cache', 'output', '.theatrical-audio', '__pycache__', 'models'].includes(part))
      && !/^runtime[\\/](qwen|kokoro)([\\/]|\.json$|\.resolved\.txt$)/.test(relative);
  } });
  await fs.mkdir(project);
  const before = await digestTree(copy);
  const env = { ...process.env };
  for (const key of [...ENV_KEYS, 'SHF_WORKSPACE_ROOT', 'THEATRICAL_AUDIO_WORKSPACE_ROOT']) delete env[key];
  function cli(args, status = 0) {
    const result = spawnSync(process.execPath, [path.join(copy, 'bin/audio.mjs'), ...args], { cwd: project, env, encoding: 'utf8', timeout: 20000 });
    assert.equal(result.status, status, result.stderr);
    return JSON.parse(status ? result.stderr : result.stdout);
  }
  const example = path.join(copy, 'examples/minimal.score.json');
  assert.equal(cli(['validate', example]).valid, true);
  cli(['plan', path.join(copy, 'examples/the-last-light.score.json'), '--engine', 'gemini']);
  assert.match(cli(['doctor', '--engine', 'qwen'], 1).error, /Missing/);
  const first = cli(['render', example, '--engine', 'test-tone', '--allow-degraded']);
  assert.ok(first.output.startsWith(project + path.sep));
  assert.ok(first.generatedTakes > 0);
  const second = cli(['render', example, '--engine', 'test-tone', '--allow-degraded']);
  assert.equal(second.generatedTakes, 0);
  assert.equal(second.cacheHits, first.generatedTakes);
  assert.equal(cli(['verify', first.output]).valid, true);
  cli(['preview', first.output, '--out', 'preview.html']);
  await fs.access(path.join(project, 'preview.html'));
  const setup = cli(['setup', 'gemini']);
  assert.equal(setup.settings, path.join(project, 'audio.config.json'));
  assert.equal(JSON.parse(await fs.readFile(setup.settings)).engine, 'gemini');
  cli(['setup', 'groq', '--settings', 'custom/settings.json']);
  await fs.access(path.join(project, 'custom/settings.json'));
  await fs.writeFile(path.join(project, 'speech.env'), 'AUDIO_ENGINE=test-tone\n');
  assert.equal(cli(['doctor', '--credentials-file', 'speech.env']).engine, 'test-tone');
  assert.match(cli(['doctor', '--credentials-file', 'missing.env'], 1).error, /Missing environment file/);
  assert.equal(await digestTree(copy), before);
});
