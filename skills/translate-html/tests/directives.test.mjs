import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as core from '../src/core.mjs';
import { parse, textOf } from '../src/dom.mjs';
import { validateTranslation } from '../src/validation.mjs';

const cases = [
  { prefix: '', inline: '' },
  { prefix: '<!doctype html>', inline: '' },
  { prefix: '<?xml version="1.0" encoding="utf-8"?>', inline: '' },
  { prefix: '<?xml version="1.0"?><!DOCTYPE html>', inline: '' },
  { prefix: '<!DOCTYPE html>', inline: '<?audit preserve?>' },
  { prefix: '<!DOCTYPE html>', inline: '<!--source comment-->' }
];

for (const { prefix, inline } of cases) {
  test(`translation preserves declarations as markup: ${prefix} ${inline}`, async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'translate-directives-'));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const source = path.join(directory, 'source.html');
    const original = `${prefix}<html lang="en"><head><title>A book</title></head><body><p>The ${inline}rain stopped.</p></body></html>`;
    await fs.writeFile(source, original);
    const job = path.join(directory, 'job');
    await core.prepareJob(source, {
      targetLanguage: 'ro',
      output: path.join(directory, 'ro.html'),
      jobDir: job
    });
    const manifest = await core.readJson(path.join(job, 'job.json'));
    const units = await core.allUnits(job, manifest);
    assert.deepEqual(
      units.map(unit => unit.plainText.replace(/⟦PROTECT:P\d{6}⟧/g, '')),
      ['A book', 'The rain stopped.']
    );
    if (inline) assert.deepEqual(Object.values(units[1].protections), [inline]);
    await core.writeJson(path.join(job, 'context.json'), {
      bootstrapReviewed: true,
      documentProfile: 'Translate the two short sentences into Romanian.'
    });
    for (const batch of manifest.batches) {
      const input = await core.readJson(path.join(job, 'batches', batch));
      await core.writeJson(path.join(job, 'translations', batch), {
        units: input.units.map(unit => ({
          id: unit.id,
          translation: unit.source === 'A book'
            ? 'O carte'
            : unit.source.replace('The ', 'Ploaia ').replace('rain stopped.', 's-a oprit.')
        }))
      });
    }
    const result = await core.buildJob(job);
    const html = await fs.readFile(result.artifact, 'utf8');
    assert.equal(textOf(parse(html)), 'O carte Ploaia s-a oprit.');
    assert.equal((html.match(/<!doctype/gi) ?? []).length, prefix.includes('doctype') || prefix.includes('DOCTYPE') ? 1 : 0);
    if (prefix.startsWith('<?xml')) assert(html.startsWith(prefix.split('<!')[0]));
    if (inline) assert(html.includes(inline));
    assert.equal((await validateTranslation(source, result.artifact, { targetLanguage: 'ro' })).status, 'passed');
    assert.equal(await fs.readFile(source, 'utf8'), original);
    if (prefix || inline) {
      for (const replacement of ['', 'VISIBLE DECLARATION', '<?changed?>']) {
        const broken = path.join(directory, 'broken.html');
        await fs.writeFile(broken, html.replace(/<\?[^>]*>|<!doctype[^>]*>/gi, replacement));
        const report = await validateTranslation(source, broken, { targetLanguage: 'ro' });
        assert.equal(report.status, 'failed');
        assert(report.findings.some(finding => finding.code === 'document-directives'));
      }
    }
  });
}

test('protected source markup does not allow translated markup injection', () => {
  const unit = {
    id: 'u000001',
    source: 'Before ⟦PROTECT:P000001⟧ after.',
    placeholders: {},
    protections: { '⟦PROTECT:P000001⟧': '<?audit preserve?>' }
  };
  const translation = 'Înainte <script>alert(1)</script> ⟦PROTECT:P000001⟧ după.';
  const html = core.decodeFragment(translation, unit).map(core.serialize).join('');
  assert(html.includes('<?audit preserve?>'));
  assert(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.throws(() => core.decodeFragment('Fără token.', unit), /exactly once/);
  assert.throws(() => core.decodeFragment(translation + '⟦PROTECT:P000001⟧', unit), /exactly once/);
});
