import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import * as core from '../src/core.mjs';
import { validateHumanisation } from '../src/validation.mjs';
async function setup(t, mode = 'keep') {
  const dir = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'humanisation-test-'))
  );
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const data = JSON.parse(
    (await fs.readFile(
      new URL('./fixtures/' + mode + '.json', import.meta.url),
      'utf8'
    )).replaceAll('__ROOT__', JSON.stringify(dir).slice(1, -1))
  );
  for (const [p, hex] of Object.entries(data.assets)) {
    await fs.mkdir(path.dirname(path.join(dir, p)), { recursive: true });
    await fs.writeFile(path.join(dir, p), Buffer.from(hex, 'hex'));
  }
  const source = path.join(dir, data.sourceRelative),
    job = path.join(dir, 'job');
  await fs.mkdir(path.dirname(source), { recursive: true });
  await fs.writeFile(source, data.source);
  const prepared = await core.prepareJob(source, {
    jobDir: job,
    inPlace: mode === 'inplace'
  });
  return { dir, data, source, job, prepared };
}
async function complete(job, data) {
  await fs.writeFile(
    path.join(job, 'context.json'),
    data.files['context.json']
  );
  for (const [p, v] of Object.entries(data.files).filter(([p]) =>
    p.startsWith('rewrites/')
  ))
    await fs.writeFile(path.join(job, p), v);
}
for (const mode of ['keep', 'rewrite', 'inplace'])
  test(
    'frozen reference extraction, profile states, exact HTML and validation: ' +
      mode,
    async t => {
      const { data, source, job, prepared } = await setup(t, mode);
      assert.deepEqual(prepared, data.prepared);
      for (const p of [
        'job.json',
        'bootstrap.json',
        ...JSON.parse(data.files['job.json']).batches.map(n => 'batches/' + n)
      ])
        assert.deepEqual(
          await core.readJson(path.join(job, p)),
          JSON.parse(data.files[p]),
          p
        );
      assert.equal(
        await fs.readFile(path.join(job, 'template.html'), 'utf8'),
        data.files['template.html']
      );
      assert.deepEqual(await core.jobStatus(job), data.initial);
      await fs.writeFile(
        path.join(job, 'context.json'),
        data.files['context.json']
      );
      assert.deepEqual(await core.jobStatus(job), data.profile);
      assert.equal(
        await fs.readFile(path.join(job, 'context.sha256'), 'utf8'),
        data.files['context.sha256']
      );
      await complete(job, data);
      assert.deepEqual(await core.jobStatus(job), data.ready);
      const r = await core.buildJob(job);
      assert.deepEqual(r, data.buildReport);
      assert.equal(await fs.readFile(r.artifact, 'utf8'), data.html);
      assert.deepEqual(
        await validateHumanisation(
          path.join(job, 'source-original.html'),
          r.artifact,
          { intendedSource: source }
        ),
        data.validation
      );
      assert.equal(
        await fs.readFile(path.join(job, 'source-original.html'), 'utf8'),
        data.source
      );
      if (mode !== 'inplace')
        assert.equal(await fs.readFile(source, 'utf8'), data.source);
    }
  );
test('frozen profile rejects changes', async t => {
  const { job, data } = await setup(t);
  await complete(job, data);
  await core.jobStatus(job);
  const c = await core.readJson(path.join(job, 'context.json'));
  c.documentProfile = 'changed';
  await core.writeJson(path.join(job, 'context.json'), c);
  await assert.rejects(core.jobStatus(job), /changed after it was frozen/);
});
test('strict schema, audits, verify-only policy and protected tokens', async t => {
  const { job, data } = await setup(t);
  await complete(job, data);
  const manifest = await core.readJson(path.join(job, 'job.json')),
    file = path.join(job, 'rewrites', manifest.batches[0]),
    original = await core.readJson(file),
    units = await core.allUnits(job, manifest);
  let p = structuredClone(original);
  p.version = 1;
  await core.writeJson(file, p);
  await assert.rejects(core.buildJob(job), /invalid root schema/);
  p = structuredClone(original);
  p.units[0].audit.factsPreserved = false;
  await core.writeJson(file, p);
  await assert.rejects(core.buildJob(job), /affirmative audit/);
  p = structuredClone(original);
  const verify = units.find(u => u.policy === 'verify-only' && !u.reuseOf),
    v = p.units.find(e => e.id === verify.id);
  v.action = 'rewrite';
  v.text += ' changed';
  await core.writeJson(file, p);
  await assert.rejects(core.buildJob(job), /Verify-only/);
  p = structuredClone(original);
  const protectedUnit = p.units.find(e => e.text.includes('⟦PROTECT:'));
  protectedUnit.action = 'rewrite';
  protectedUnit.text = protectedUnit.text.replace(/⟦PROTECT:P\d+⟧/, '2099');
  await core.writeJson(file, p);
  await assert.rejects(core.buildJob(job), /protected token/);
});
test('in-place requires explicit flag and existing user output is protected', async t => {
  const { source, job, data, dir } = await setup(t);
  await assert.rejects(
    core.prepareJob(source, { output: source, jobDir: path.join(dir, 'bad') }),
    /--in-place/
  );
  await complete(job, data);
  const out = (await core.readJson(path.join(job, 'job.json'))).output;
  await fs.writeFile(out, 'user file');
  await assert.rejects(
    core.buildJob(job, { overwrite: true }),
    /Refusing to replace/
  );
  assert.equal(await fs.readFile(out, 'utf8'), 'user file');
});
test('chapter fallback and batching', () => {
  const { chapters } = core.extractUnits(
    core.parse(
      '<html lang="en"><body><main><section><h2>One</h2><p>Text one.</p></section><section><h2>Two</h2><p>Text two.</p></section></main></body></html>'
    )
  );
  assert.deepEqual(chapters.map(c => c.title), ['One', 'Two']);
  assert.deepEqual(
    core
      .batchUnits(
        [1, 2, 3, 4, 5, 6].map(i => ({
          id: 'u' + i,
          chapterId: i < 5 ? 'chapter-0001' : 'chapter-0002',
          source: 'x'.repeat(10000)
        }))
      )
      .map(b => b.length),
    [3, 3]
  );
});
