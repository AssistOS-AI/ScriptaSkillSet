import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, cp, rm, symlink, readdir, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { resolveExecutionRoot } from '../src/pdf2html/runtime-location.mjs';

test('explicit prepared runtimes must match selected code and manifests and reject missing or linked files', async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'pdf-runtime-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'source'), prepared = join(root, 'prepared');
  for (const folder of ['src', 'scripts', 'external/native', 'external/runtime']) await mkdir(join(source, folder), { recursive: true });
  for (const file of ['src/entry.mjs', 'scripts/pdf2html', 'external/native/integrity.json', 'external/runtime/package.json', 'external/runtime/package-lock.json']) await writeFile(join(source, file), '{}');
  await cp(source, prepared, { recursive: true });
  assert.equal(await resolveExecutionRoot(source), source);
  assert.equal(await resolveExecutionRoot(source, prepared), prepared);
  await assert.rejects(resolveExecutionRoot(source, join(root, 'absent')), { code: 'PREPARED_RUNTIME_MISSING' });
  await writeFile(join(prepared, 'src/entry.mjs'), 'changed');
  await assert.rejects(resolveExecutionRoot(source, prepared), { code: 'PREPARED_RUNTIME_VERSION_MISMATCH' });
  await writeFile(join(prepared, 'src/entry.mjs'), '{}');
  await writeFile(join(prepared, 'external/native/integrity.json'), '{"different":true}');
  await assert.rejects(resolveExecutionRoot(source, prepared), { code: 'PREPARED_RUNTIME_VERSION_MISMATCH' });
  await rm(join(prepared, 'external/native/integrity.json'));
  await symlink(join(source, 'external/native/integrity.json'), join(prepared, 'external/native/integrity.json'));
  await assert.rejects(resolveExecutionRoot(source, prepared), { code: 'PREPARED_RUNTIME_INCOMPLETE' });
});

test('doctor reports package and model problems without misreporting a missing browser or installing files', async t => {
  const root = await mkdtemp(join(tmpdir(), 'pdf-doctor-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const src = join(root, 'src/pdf2html'); await mkdir(src, { recursive: true });
  for (const name of ['runtime.mjs','process.mjs']) await cp(new URL(`../src/pdf2html/${name}`, import.meta.url), join(src,name));
  const code = `const {doctor}=await import(${JSON.stringify(pathToFileURL(join(src,'runtime.mjs')).href)});console.log(JSON.stringify(await doctor()));`;
  const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module','-e',code], { timeout: 120000 });
  const report = JSON.parse(stdout);
  assert.equal(report.ok, false); assert.equal(report.category, 'environment');
  assert.ok(report.missing.includes('packages')); assert.ok(report.missing.includes('models'));
  assert.ok(!report.missing.includes('chromium'));
  assert.match(report.chromium_error, /does not mean the browser binary is absent/);
  assert.ok(report.issues.some(issue => issue.code === 'JAVASCRIPT_RUNTIME_UNAVAILABLE'));
  assert.match(report.summary, /not a defect in the input PDF/);
  assert.deepEqual(await readdir(root), ['src']);
});

test('conversion with an incomplete prepared runtime fails before installing or reading the PDF', async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'pdf-prepared-only-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = new URL('../', import.meta.url);
  for (const folder of ['src','scripts']) await cp(new URL(folder,source),join(root,folder),{recursive:true});
  for (const folder of ['external/native','external/runtime']) await mkdir(join(root,folder),{recursive:true});
  for (const name of ['external/native/integrity.json','external/runtime/package.json','external/runtime/package-lock.json']) await cp(new URL(name,source),join(root,name));
  await assert.rejects(promisify(execFile)(process.execPath,
    [new URL('../scripts/launch-runtime.mjs',import.meta.url).pathname,'convert','nonexistent-input.pdf'],
    { env:{...process.env,PDF2HTML_RUNTIME_ROOT:root},timeout:120000 }), error => {
      assert.equal(error.code,1);
      assert.match(error.stderr,/JAVASCRIPT_RUNTIME_UNAVAILABLE/);
      assert.match(error.stderr,/not a defect in the input PDF/);
      return true;
    });
  assert.deepEqual((await readdir(root)).sort(),['external','scripts','src']);
});
