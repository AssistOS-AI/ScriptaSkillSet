import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
const skill = fileURLToPath(new URL('../', import.meta.url));
test('portable CLI, startup diagnostics and argument validation', async t => {
  const dir = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'comprehensivesummary-runtime-'))
  );
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const copy = path.join(dir, 'copy');
  for (const n of ['src', 'scripts', 'external', 'assets'])
    await fs.cp(path.join(skill, n), path.join(copy, n), { recursive: true });
  const script = path.join(copy, 'scripts/comprehensivesummary.mjs');
  const run = args =>
    spawnSync(process.execPath, [script, ...args], {
      cwd: os.tmpdir(),
      env: { PATH: '' },
      encoding: 'utf8',
      timeout: 10000
    });
  const doctor = run(['doctor']);
  assert.equal(doctor.status, 0, doctor.stderr);
  assert.equal(JSON.parse(doctor.stdout).ok, true);
  const input = path.join(dir, 'source.html'),
    output = path.join(dir, 'out.html'),
    job = path.join(dir, 'job');
  await fs.writeFile(
    input,
    '<html lang="en"><head><title>Test</title></head><body><h1>Chapter</h1><p>' +
      'Evidence supports careful interpretation. '.repeat(150) +
      '</p></body></html>'
  );
  const prepared = run([
    'prepare',
    input,
    ...['--minutes', '1'],
    '--output',
    output,
    '--job-dir',
    job
  ]);
  assert.equal(prepared.status, 0, prepared.stderr);
  assert.equal(JSON.parse(prepared.stdout).status, 'prepared');
  assert.equal(run(['status', job]).status, 0);
  assert.equal(run(['prepare']).status, 2);
  assert.equal(run(['prepare', input, '--unknown']).status, 2);
  assert.equal(run(['--help']).status, 0);
  const unsupported = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "Object.defineProperty(process.versions,'node',{value:'20.0.0'});process.argv=['node'," +
        JSON.stringify(script) +
        ",'prepare'," +
        JSON.stringify(input) +
        '];await import(' +
        JSON.stringify(pathToFileURL(script).href) +
        ');'
    ],
    { cwd: dir, env: { PATH: '' }, encoding: 'utf8' }
  );
  assert.equal(unsupported.status, 1);
  assert.match(unsupported.stderr, /Node.js >=22/);
  await fs.rename(
    path.join(copy, 'external/html'),
    path.join(copy, 'external/html-saved')
  );
  const bad = run([
    'prepare',
    input,
    ...['--minutes', '1'],
    '--output',
    output,
    '--job-dir',
    path.join(dir, 'missing-parser-job')
  ]);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /Bundled runtime/);
  await assert.rejects(fs.access(path.join(dir, 'missing-parser-job')));
  await fs.rename(
    path.join(copy, 'external/html-saved'),
    path.join(copy, 'external/html')
  );
  assert.equal(run(['doctor']).status, 0);
});

test('paths resolve directory symlinks before computing job identities', async t => {
  const dir = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'scripta-path-'))
  );
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.mkdir(path.join(dir, 'real'));
  await fs.symlink(path.join(dir, 'real'), path.join(dir, 'alias'));
  const { resolve } = await import('../src/core.mjs');
  assert.equal(
    resolve(path.join(dir, 'alias', 'new', 'output.html')),
    path.join(dir, 'real', 'new', 'output.html')
  );
});
