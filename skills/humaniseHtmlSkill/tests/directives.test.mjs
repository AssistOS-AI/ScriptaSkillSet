import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as core from '../src/core.mjs';
import { textOf, parse } from '../src/dom.mjs';
import { validateHumanisation } from '../src/validation.mjs';

for (const prefix of ['', '<!doctype html>', '<?xml version="1.0" encoding="utf-8"?>', '<?xml version="1.0"?><!DOCTYPE html>']) {
  test(`declarations stay non-editorial and non-visible: ${prefix || 'no declaration'}`, async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'humanise-directives-'));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const source = path.join(directory, 'book.html');
    const original = `${prefix}<html lang="en"><head><title>A book</title></head><body><p>The rain stopped.</p></body></html>`;
    await fs.writeFile(source, original);
    const job = path.join(directory, 'job');
    await core.prepareJob(source, { jobDir: job });
    const manifest = await core.readJson(path.join(job, 'job.json'));
    const units = await core.allUnits(job, manifest);
    assert.deepEqual(units.map(unit => unit.plainText), ['A book', 'The rain stopped.']);
    await core.writeJson(path.join(job, 'context.json'), { profileReviewed: true, documentProfile: 'Keep the short fixture exact.', preserveTerms: [], avoidPatterns: [], notes: '' });
    for (const batch of manifest.batches) {
      const input = await core.readJson(path.join(job, 'batches', batch));
      await core.writeJson(path.join(job, 'rewrites', batch), { units: input.units.filter(unit => !unit.reuseOf).map(unit => ({ id: unit.id, action: 'keep', text: unit.source, audit: { meaningPreserved: true, factsPreserved: true, natural: true, noSlop: true, notes: 'Exact fixture text.' } })) });
    }
    const result = await core.buildJob(job);
    const html = await fs.readFile(result.artifact, 'utf8');
    assert.equal(textOf(parse(html)), 'A book The rain stopped.');
    assert.equal((html.match(/<!doctype/gi) || []).length, prefix.toLowerCase().includes('<!doctype') ? 1 : 0);
    if (prefix.startsWith('<?xml')) assert(html.startsWith('<?xml'));
    assert.equal((await validateHumanisation(source, result.artifact)).status, 'passed');
    assert.equal(await fs.readFile(source, 'utf8'), original);
    if (prefix) {
      const broken = path.join(directory, 'broken.html');
      await fs.writeFile(broken, html.replace(/<\?xml[^>]*>|<!doctype[^>]*>/gi, 'VISIBLE DECLARATION'));
      assert((await validateHumanisation(source, broken)).findings.some(finding => finding.code === 'document-directives'));
    }
  });
}
