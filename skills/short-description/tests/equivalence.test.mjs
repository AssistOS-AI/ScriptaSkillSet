import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { prepareJob, readJson, writeJson, jobStatus, buildJob, normalizeLanguage, splitSentences, guardLeaks, similarity } from '../src/core.mjs';
import { validateShortDescription } from '../src/validation.mjs';

const skill = fileURLToPath(new URL('../', import.meta.url));
async function temporary(t) {
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'shortdescription-equivalence-')));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}
const sourceText = '<html lang="en"><head><title>Test Book</title></head><body><article><h1>Questions of evidence</h1><p>The book examines how evidence shapes public judgment and how institutions assess uncertainty.</p></article></body></html>';

test('language, sentence and disclosure helpers', () => {
  assert.equal(normalizeLanguage('ro_ro'), 'ro-RO');
  assert.throws(() => normalizeLanguage('und'));
  assert.equal(splitSentences('One sentence. Another question? Final answer!').length, 3);
  assert.deepEqual(guardLeaks('A confidential verification framework.', [{ protectedRevelations: [{ id: 'r1', statement: '', guardTerms: ['confidential verification framework'] }] }]), ['r1']);
});

async function prepareFixture(t, mode = 'nonfiction') {
  const directory = await temporary(t);
  const raw = await fs.readFile(new URL('./fixtures/' + mode + '.json', import.meta.url), 'utf8');
  const data = JSON.parse(raw.replaceAll('__FIXTURE_ROOT__', JSON.stringify(directory).slice(1, -1)));
  const source = path.join(directory, 'book.html'), job = path.join(directory, 'job');
  await fs.writeFile(source, data.source);
  const prepared = await prepareJob(source, { jobDir: job, output: path.join(directory, 'shortDescription.html') });
  return { directory, source, job, data, prepared };
}
async function completeFixture(job, data) {
  for (const name of Object.keys(data.files).filter(n => n.startsWith('analyses/') || ['draft.json','review.json'].includes(n))) {
    await fs.mkdir(path.dirname(path.join(job, name)), { recursive: true });
    await fs.writeFile(path.join(job, name), data.files[name]);
  }
}
for (const mode of ['nonfiction', 'fiction', 'marketing', 'comprehensive', 'unicode', 'chapters']) {
  test('frozen reference prepare, status, exact HTML and validate: ' + mode, async t => {
    const { source, job, data, prepared } = await prepareFixture(t, mode);
    assert.deepEqual(prepared, data.prepared);
    const manifest = await readJson(path.join(job, 'job.json'));
    for (const name of ['job.json','context.json','chapters.json', ...manifest.batchNames.map(n => 'batches/' + n)]) {
      assert.deepEqual(await readJson(path.join(job, name)), JSON.parse(data.files[name]), name);
    }
    await completeFixture(job, data);
    assert.deepEqual(await jobStatus(job), data.ready);
    const result = await buildJob(job);
    assert.equal(await fs.readFile(result.artifact, 'utf8'), data.html);
    assert.equal(result.jobRemoved, true);
    await assert.rejects(fs.access(job));
    assert.equal(await fs.readFile(source, 'utf8'), data.source);
    assert.deepEqual(await validateShortDescription(source, result.artifact), data.validation);
  });
}

test('refusal states and output ownership', async t => {
  const { directory, source, job, data } = await prepareFixture(t);
  assert.equal((await jobStatus(job)).status, 'analysis_required');
  await completeFixture(job, data);
  const draftFile = path.join(job, 'draft.json'), reviewFile = path.join(job, 'review.json');
  const originalDraft = await fs.readFile(draftFile), originalReview = await fs.readFile(reviewFile);
  await fs.appendFile(draftFile, '\n');
  assert.equal((await jobStatus(job)).status, 'review_required');
  await fs.writeFile(draftFile, originalDraft);
  const review = JSON.parse(originalReview); review.sentences[0].solutionRisk = true;
  await writeJson(reviewFile, review);
  assert.equal((await jobStatus(job)).status, 'revision_required');
  await fs.writeFile(reviewFile, originalReview);
  const output = path.join(directory, 'shortDescription.html');
  await fs.writeFile(output, 'user file');
  await assert.rejects(buildJob(job, { overwrite: true }), /Output exists/);
  assert.equal(await fs.readFile(output, 'utf8'), 'user file');
  await fs.appendFile(source, 'changed');
  await assert.rejects(buildJob(job), /Source HTML changed/);
});

test('similarity matches frozen reference', async () => {
  const cases = await readJson(new URL('./fixtures/similarity.json', import.meta.url));
  for (const { pair: [a, b], expected } of cases) assert.equal(similarity(a, b), expected);
});

test('validator rejects three sentences', async t => {
  const { source, job, data } = await prepareFixture(t);
  await completeFixture(job, data);
  const { artifact } = await buildJob(job);
  const draft = JSON.parse(data.files['draft.json']);
  const html = await fs.readFile(artifact, 'utf8');
  await fs.writeFile(artifact, html.replace(draft.sentences[3].text, ''));
  const report = await validateShortDescription(source, artifact);
  assert.equal(report.status, 'failed');
  assert.ok(report.findings.some(item => item.code === 'sentence-count'));
});

test('copied runtime works outside its directory without Python or npm', async t => {
  const directory = await temporary(t), copy = path.join(directory, 'copy');
  for (const name of ['src', 'external', 'scripts']) await fs.cp(path.join(skill, name), path.join(copy, name), { recursive: true });
  const source = path.join(directory, 'book.html'); await fs.writeFile(source, sourceText);
  const script = path.join(copy, 'scripts/shortdescription.mjs');
  const result = spawnSync(process.execPath, [script, 'prepare', source], { cwd: os.tmpdir(), env: { PATH: '' }, encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).status, 'analysis_required');
  await fs.rename(path.join(copy, 'external/html'), path.join(copy, 'external/html-missing'));
  const failed = spawnSync(process.execPath, [script, 'prepare', source, '--job-dir', path.join(directory, 'must-not-exist')], { cwd: os.tmpdir(), env: { PATH: '' }, encoding: 'utf8', timeout: 10000 });
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /Bundled HTML runtime is missing/);
  await assert.rejects(fs.access(path.join(directory, 'must-not-exist')));
});
