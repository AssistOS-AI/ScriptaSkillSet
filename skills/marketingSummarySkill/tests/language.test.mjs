import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalTag as normalizeLanguage } from '../src/language.mjs';

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
