import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  prepareJob,
  jobStatus,
  buildJob,
  readJson,
  writeJson,
  validateSynthesis,
  extractDocument,
  chapterBatches,
  normalizeLanguage
} from '../src/core.mjs';
import { validateSummary } from '../src/validation.mjs';
import { parse } from '../src/dom.mjs';
async function setup(t) {
  const dir = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'summary-test-'))
  );
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const data = JSON.parse(
    (await fs.readFile(
      new URL('./fixtures/reference.json', import.meta.url),
      'utf8'
    )).replaceAll('__ROOT__', JSON.stringify(dir).slice(1, -1))
  );
  const source = path.join(dir, 'book/index.html'),
    job = path.join(dir, 'job');
  await fs.mkdir(path.dirname(source));
  await fs.writeFile(source, data.source);
  const prepared = await prepareJob(source, { minutes: 1, jobDir: job });
  return { dir, data, source, job, prepared };
}
async function complete(job, data) {
  for (const [n, v] of Object.entries(data.files))
    if (
      n.startsWith('analyses/') ||
      ['synthesis.json', 'draft.json'].includes(n)
    )
      await fs.writeFile(path.join(job, n), v);
}
test('frozen reference preparation, states, exact HTML and validation', async t => {
  const { data, source, job, prepared } = await setup(t);
  assert.deepEqual(prepared, data.prepared);
  for (const n of [
    'job.json',
    'context.json',
    'chapters.json',
    ...JSON.parse(data.files['job.json']).batches.map(n => 'batches/' + n)
  ])
    assert.deepEqual(
      await readJson(path.join(job, n)),
      JSON.parse(data.files[n]),
      n
    );
  assert.deepEqual(await jobStatus(job), data.states[0]);
  for (const [n, v] of Object.entries(data.files).filter(([n]) =>
    n.startsWith('analyses/')
  ))
    await fs.writeFile(path.join(job, n), v);
  assert.deepEqual(await jobStatus(job), data.states[1]);
  await fs.writeFile(
    path.join(job, 'synthesis.json'),
    data.files['synthesis.json']
  );
  assert.deepEqual(await jobStatus(job), data.states[2]);
  await fs.writeFile(path.join(job, 'draft.json'), data.files['draft.json']);
  assert.deepEqual(await jobStatus(job), data.states[3]);
  const r = await buildJob(job);
  assert.equal(await fs.readFile(r.artifact, 'utf8'), data.html);
  assert.deepEqual(await validateSummary(source, r.artifact), data.validation);
  assert.equal(await fs.readFile(source, 'utf8'), data.source);
});
test('weighted scores and complete chapter coverage', async t => {
  const { data, job } = await setup(t),
    s = JSON.parse(data.files['synthesis.json']);
  s.clusters[0].score = 0.9;
  s.chapterCoverage.pop();
  const errors = validateSynthesis(
    s,
    await readJson(path.join(job, 'job.json')),
    Object.entries(data.files)
      .filter(([n]) => n.startsWith('analyses/'))
      .map(([, v]) => JSON.parse(v))
  );
  assert.ok(errors.some(e => e.includes('weighted score')));
  assert.ok(errors.some(e => e.includes('every content chapter')));
});
test('unsupported facts and source changes block publication', async t => {
  const { data, job, source } = await setup(t);
  await complete(job, data);
  const d = await readJson(path.join(job, 'draft.json'));
  d.sections[0].paragraphs[0].text += ' The unsupported year is 2099.';
  d.conclusion[0].text = d.conclusion[0].text.replace(/ context/g, '');
  await writeJson(path.join(job, 'draft.json'), d);
  await assert.rejects(buildJob(job), /unsupported factual tokens/);
  await fs.appendFile(source, 'changed');
  await assert.rejects(buildJob(job), /Source HTML changed/);
});
test('semantic sections and oversized units retain boundaries', () => {
  const { units, chapters } = extractDocument(
    parse(
      `<html lang="en"><body><main><section><h2>One</h2><p>${'word '.repeat(
        7000
      )}</p></section><section><h2>Two</h2><p>Useful argument repeated with context.</p></section></main></body></html>`
    )
  );
  assert.deepEqual(chapters.map(c => c.title), ['One', 'Two']);
  assert.ok(
    chapterBatches(units, chapters)[0].units.some(u => u.text.length > 32000)
  );
});
test('language syntax validation preserves explicitly declared script', () => {
  assert.equal(normalizeLanguage('en-Latn-US'), 'en-Latn-US');
  assert.equal(normalizeLanguage('RO-ro'), 'ro-RO');
  for (const tag of ['ro_ro', 'en--US', 'de-1901-1901', 'en-a-bbb-a-ddd'])
    assert.throws(() => normalizeLanguage(tag));
});
