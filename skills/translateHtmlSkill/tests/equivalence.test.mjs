import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import * as core from '../src/core.mjs';
import { validateTranslation } from '../src/validation.mjs';
async function setup(t, mode = 'ro') {
  const dir = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'translation-test-'))
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
    targetLanguage: mode === 'ar' ? 'ar' : 'ro',
    jobDir: job
  });
  return { dir, data, source, job, prepared };
}
async function complete(job, data) {
  await fs.writeFile(
    path.join(job, 'context.json'),
    data.files['context.json']
  );
  for (const [p, v] of Object.entries(data.files).filter(([p]) =>
    p.startsWith('translations/')
  ))
    await fs.writeFile(path.join(job, p), v);
}
for (const mode of ['ro', 'ar', 'memory'])
  test(
    'frozen reference extraction, template, states and output: ' + mode,
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
      await complete(job, data);
      assert.deepEqual(await core.jobStatus(job), data.ready);
      const r = await core.buildJob(job);
      assert.deepEqual(r, data.buildReport);
      assert.equal(await fs.readFile(r.artifact, 'utf8'), data.html);
      assert.deepEqual(
        await validateTranslation(source, r.artifact, {
          targetLanguage: mode === 'ar' ? 'ar' : 'ro'
        }),
        data.validation
      );
      assert.equal(await fs.readFile(source, 'utf8'), data.source);
    }
  );
test('changed placeholder, unreviewed context and changed source block build', async t => {
  const { source, job, data } = await setup(t);
  await assert.rejects(core.buildJob(job), /bootstrapReviewed/);
  await complete(job, data);
  const manifest = await core.readJson(path.join(job, 'job.json')),
    file = path.join(job, 'translations', manifest.batches[0]),
    p = await core.readJson(file);
  p.units.find(u =>
    u.translation.includes('⟦OPEN:')
  ).translation = p.units
    .find(u => u.translation.includes('⟦OPEN:'))
    .translation.replace('⟦OPEN:', '⟦BROKEN:');
  await core.writeJson(file, p);
  await assert.rejects(core.buildJob(job), /placeholder/);
  await fs.appendFile(source, 'changed');
  await assert.rejects(core.buildJob(job), /Source HTML changed/);
});
test('bootstrap pages and page-aware batching', () => {
  const prose = 'narrative '.repeat(170);
  const doc = core.parse(
    `<html><body><section data-source-page="1"><img src="cover.png"></section><section data-source-page="2"><table><tr><td>Contents</td></tr></table></section><section data-source-page="3"><p>${prose}</p><p>${prose}</p></section><section data-source-page="4"><p>${prose}</p><p>${prose}</p></section></body></html>`
  );
  assert.deepEqual(core.bootstrapPages(doc), ['3', '4']);
  assert.deepEqual(
    core
      .batchUnits(
        [1, 2, 3, 4].map(i => ({
          id: 'u' + i,
          page: String(i),
          source: 'x'.repeat(10000)
        })),
        new Set()
      )
      .map(b => b.length),
    [3, 1]
  );
});
test('resource reference rewriting', () => {
  const source = '/book/en/index.html',
    target = '/book/ro/index.html';
  assert.equal(
    core.rewriteReference('assets/a.png?v=1#x', source, target),
    '../en/assets/a.png?v=1#x'
  );
  assert.equal(core.rewriteReference('#page_2', source, target), '#page_2');
  assert.equal(
    core.rewriteSrcset('assets/a.png 1x, assets/b.png 2x', source, target),
    '../en/assets/a.png 1x, ../en/assets/b.png 2x'
  );
  assert.equal(
    core.rewriteCssUrls("background:url('assets/a.png')", source, target),
    "background:url('../en/assets/a.png')"
  );
});

test('reviewed bootstrap opens later batches and incomplete results stay pending', async t => {
  const { job } = await setup(t);
  const manifest = await core.readJson(path.join(job, 'job.json'));
  const names = ['batch-0001.json', 'batch-0002.json', 'batch-0003.json'];
  manifest.batches = names;
  manifest.unitCount = 3;
  manifest.modelUnitCount = 3;
  await core.writeJson(path.join(job, 'job.json'), manifest);
  for (const [i, name] of names.entries())
    await core.writeJson(path.join(job, 'batches', name), {
      bootstrap: i === 0,
      units: [{ id: 'u' + i, source: 'Text ' + i }]
    });
  assert.deepEqual((await core.jobStatus(job)).readyBatches, [names[0]]);
  await core.writeJson(path.join(job, 'translations', names[0]), {
    units: [{ id: 'u0', translation: 'Text tradus' }]
  });
  assert.deepEqual((await core.jobStatus(job)).readyBatches, []);
  await core.writeJson(path.join(job, 'context.json'), {
    bootstrapReviewed: true,
    documentProfile: 'Clear prose.'
  });
  assert.deepEqual((await core.jobStatus(job)).readyBatches, names.slice(1));
  await core.writeJson(path.join(job, 'translations', names[1]), {
    units: [{ id: 'wrong', translation: 'Text' }]
  });
  assert.equal((await core.jobStatus(job)).remainingBatches, 2);
});
