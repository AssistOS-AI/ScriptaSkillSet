import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { normalizeLanguage } from '../src/language.mjs';
import { prepareJob, readJson } from '../src/core.mjs';

test('normalizes modern language, script and region tags', () => {
  for (const [input, expected] of [
    ['ro', 'ro'], ['RO-ro', 'ro-RO'], [' en-us ', 'en-US'],
    ['pt-BR', 'pt-BR'], ['zh-hant-tw', 'zh-Hant-TW'],
    ['sr-Latn', 'sr-Latn'], ['en-Latn', 'en-Latn'],
    ['es-419', 'es-419'], ['de-DE-u-co-phonebk', 'de-DE-u-co-phonebk']
  ]) assert.equal(normalizeLanguage(input), expected);
});

test('rejects missing and malformed tags', () => {
  for (const tag of [undefined, null, '', ' ', 42, {}, 'ro_RO', 'en--US', 'en-', 'i-klingon'])
    assert.throws(() => normalizeLanguage(tag), /Invalid BCP 47 language tag/);
});

test('prepare reads HTML language and accepts an explicit override', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'humanise-language-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const source = path.join(dir, 'index.html');
  await fs.writeFile(source, '<html lang="RO-ro"><head><title>Carte</title></head><body><p>Un text pentru verificare.</p></body></html>');
  const jobDir = path.join(dir, 'detected');
  await prepareJob(source, { jobDir });
  assert.equal((await readJson(path.join(jobDir, 'job.json'))).language, 'ro-RO');
  const override = path.join(dir, 'override');
  await prepareJob(source, { jobDir: override, language: 'en-US' });
  assert.equal((await readJson(path.join(override, 'job.json'))).language, 'en-US');
  await fs.writeFile(source, '<html><body><p>Text.</p></body></html>');
  await assert.rejects(prepareJob(source, { jobDir: path.join(dir, 'missing') }), /Document language is missing/);
});
