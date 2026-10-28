import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { prepareJob, readJson, writeJson, jobStatus, buildJob, budget } from '../src/core.mjs';
import { validateMarketingSummary } from '../src/validation.mjs';
const skill = fileURLToPath(new URL('../', import.meta.url));
async function temporary(t) {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'marketing-regression-')));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}
async function fixture(mode, dir) {
  const text = await fs.readFile(new URL(`./fixtures/${mode}.json`, import.meta.url), 'utf8');
  return JSON.parse(text.replaceAll('__FIXTURE_ROOT__', JSON.stringify(dir).slice(1, -1)));
}
async function prepareFixture(t, mode = 'nonfiction') {
  const dir = await temporary(t), data = await fixture(mode, dir);
  const source = path.join(dir, 'book.html'), job = path.join(dir, 'job');
  await fs.writeFile(source, data.source);
  const prepared = await prepareJob(source, { jobDir: job });
  return { dir, data, source, job, prepared };
}
async function completeFixture(t) {
  const result = await prepareFixture(t);
  for (const name of ['analyses/batch-0001.json', 'synthesis.json', 'draft.json', 'review.json']) {
    await fs.mkdir(path.dirname(path.join(result.job, name)), { recursive: true });
    await fs.writeFile(path.join(result.job, name), result.data.files[name]);
  }
  return result;
}
async function refreshReview(job) {
  const file = path.join(job, 'review.json'), review = await readJson(file);
  review.draftSha256 = createHash('sha256').update(await fs.readFile(path.join(job, 'draft.json'))).digest('hex');
  await writeJson(file, review);
}
test('word budget boundaries', () => {
  assert.deepEqual([5000, 5001, 20000, 20001].map(budget), [[275,250,300],[425,375,475],[425,375,475],[600,550,650]]);
});
for (const mode of ['nonfiction', 'fiction', 'comprehensive']) test(`frozen reference job and exact output: ${mode}`, async t => {
  const { data, source, job, prepared } = await prepareFixture(t, mode);
  assert.deepEqual(prepared, data.prepared);
  const manifest = await readJson(path.join(job, 'job.json'));
  for (const name of ['job.json', 'context.json', 'chapters.json', ...manifest.batchNames.map(n => `batches/${n}`)]) {
    assert.deepEqual(await readJson(path.join(job, name)), JSON.parse(data.files[name]), name);
  }
  assert.deepEqual(await jobStatus(job), data.states[0]);
  for (const [i, name] of ['analyses/batch-0001.json', 'synthesis.json', 'draft.json', 'review.json'].entries()) {
    await fs.mkdir(path.dirname(path.join(job, name)), { recursive: true });
    await fs.writeFile(path.join(job, name), data.files[name]);
    assert.deepEqual(await jobStatus(job), data.states[i + 1]);
  }
  const result = await buildJob(job);
  assert.equal(await fs.readFile(result.artifact, 'utf8'), data.html);
  assert.equal(await fs.readFile(source, 'utf8'), data.source);
  assert.deepEqual(await validateMarketingSummary(source, result.artifact), data.validation);
});
test('stale review and protected spoiler prevent publication', async t => {
  const { job } = await completeFixture(t), file = path.join(job, 'draft.json');
  const draft = await readJson(file); draft.dek += ' Curiosity remains.';
  await writeJson(file, draft);
  assert.equal((await jobStatus(job)).status, 'review_required');
  await assert.rejects(buildJob(job));
  draft.closing.text = 'The final answer is hidden while every difficult question still invites thoughtful reading.';
  await writeJson(file, draft);
  await refreshReview(job);
  await assert.rejects(buildJob(job), /protected spoiler guard phrases/);
});
test('copied runtime and missing parser fail before writes', async t => {
  const dir = await temporary(t), copy = path.join(dir, 'copy');
  for (const name of ['src','external','scripts','assets']) await fs.cp(path.join(skill,name), path.join(copy,name), { recursive: true });
  const script = path.join(copy, 'scripts/marketingsummary.mjs');
  const good = spawnSync(process.execPath, [script, 'doctor'], { cwd: os.tmpdir(), env: { PATH: '' }, encoding:'utf8' });
  assert.equal(good.status, 0, good.stderr);
  await fs.rename(path.join(copy,'external/html'), path.join(copy,'external/missing'));
  const bad = spawnSync(process.execPath, [script,'prepare',path.join(dir,'source.html')], { cwd:os.tmpdir(),env:{PATH:''},encoding:'utf8' });
  assert.equal(bad.status,1); assert.match(bad.stderr,/Bundled HTML runtime/);
  assert.deepEqual((await fs.readdir(dir)).sort(), ['copy']);
});
test('non-HTML input is rejected', async t => {
  const dir = await temporary(t), source = path.join(dir, 'book.md');
  await fs.writeFile(source, '# Book');
  await assert.rejects(prepareJob(source), /html or .htm/);
});
test('Romanian bibliography is excluded', async t => {
  const dir = await temporary(t), source = path.join(dir, 'romanian.html'), job = path.join(dir, 'job');
  await fs.writeFile(source, '<html lang="ro"><body><h1>Cartea</h1><p>O întrebare importantă deschide această cercetare amplă pentru cititori.</p><h1>Bibliografie selectivă</h1><p>Autor, Titlu, Editură, București.</p></body></html>');
  await prepareJob(source, { jobDir: job });
  assert.ok((await readJson(path.join(job, 'context.json'))).excluded.some(item => item.title === 'Bibliografie selectivă'));
});
test('validator rejects visible internal data', async t => {
  const { source, job } = await completeFixture(t);
  const { artifact } = await buildJob(job);
  const html = await fs.readFile(artifact, 'utf8');
  await fs.writeFile(artifact, html.replace('</article>', '<p class="reading-time">Internal words</p></article>'));
  const report = await validateMarketingSummary(source, artifact);
  assert.equal(report.status, 'failed');
  assert.ok(report.findings.some(item => item.code === 'internal-data-visible'));
});
