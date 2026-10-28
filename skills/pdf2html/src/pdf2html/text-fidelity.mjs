import { expandLigatures } from './common.mjs';

export const fidelityTokens = value => expandLigatures(value).normalize('NFC')
  .replaceAll('\u00ad', '').match(/[\p{L}\p{M}\p{N}_]+|[^\s]/gu) ?? [];
const word = value => /^[\p{L}\p{M}]+$/u.test(value ?? '');
const same = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);

export function sourceVocabulary(texts) {
  // A complete source occurrence is evidence; a language guess is not.
  const words = new Set(), compounds = new Set();
  for (const text of texts) {
    for (const value of text.match(/[\p{L}\p{M}]+(?:[-\u2010\u2011][\p{L}\p{M}]+)*/gu) ?? []) {
      if (/[-\u2010\u2011]/u.test(value)) {
        compounds.add(value.replace(/[-\u2010\u2011]/gu, ''));
        for (const component of value.split(/[-\u2010\u2011]/u)) words.add(component);
      }
      else words.add(value);
    }
  }
  return { words, compounds };
}

export function lineBreaks(source, page, vocabulary) {
  const breaks = new Map(), lines = source.split('\n');
  let offset = 0;
  for (let index = 0; index < lines.length; index++) {
    const current = fidelityTokens(lines[index]), next = fidelityTokens(lines[index + 1] ?? '');
    const geometry = page?.source_lines ?? page?.lines;
    const before = geometry?.[index], after = geometry?.[index + 1];
    const left = current.at(-2), hyphen = current.at(-1), right = next[0];
    const size = Math.max(before?.size_pt ?? 0, after?.size_pt ?? 0);
    if (word(left) && word(right) && ['-', '\u2010'].includes(hyphen)
      && before && after && same(current, fidelityTokens(before.text)) && same(next, fidelityTokens(after.text))
      && size > 0 && Math.abs(after.x0 - before.x0) < size
      && after.top > before.top && after.top - before.bottom >= -size * .2 && after.top - before.bottom < size * .8
      && Math.abs(before.size_pt - after.size_pt) < size * .1) {
      const joined = left + right;
      breaks.set(offset + current.length - 2, {
        joined, original: left + hyphen + right,
        accepted: vocabulary?.words.has(joined) && !vocabulary.compounds.has(joined),
      });
    }
    offset += current.length;
  }
  return breaks;
}

export function restorationPlan(source, output, { page, vocabulary } = {}) {
  const expected = fidelityTokens(source), actual = fidelityTokens(output);
  const breaks = lineBreaks(source, page, vocabulary), edits = [];
  let sourceIndex = 0, outputIndex = 0;
  let complete = true;
  const contextLength = 6, searchDistance = 32;
  const contexts = values => {
    const map = new Map();
    for (let i = 0; i + contextLength <= values.length; i++) {
      const key = JSON.stringify(values.slice(i, i + contextLength));
      map.set(key, map.has(key) ? null : i);
    }
    return map;
  };
  const sourceContexts = contexts(expected), outputContexts = contexts(actual);
  while (sourceIndex < expected.length && outputIndex < actual.length) {
    if (expected[sourceIndex] === actual[outputIndex]) { sourceIndex++; outputIndex++; continue; }
    const boundary = breaks.get(sourceIndex);
    if (boundary?.joined === actual[outputIndex]) {
      if (!boundary.accepted) edits.push({ index: outputIndex, value: boundary.original });
      sourceIndex += 3; outputIndex++; continue;
    }
    // Restore a compound hyphen dropped by extraction. Unlike discretionary
    // line-end joining, this reproduces the exact source spelling.
    if (word(expected[sourceIndex]) && ['-', '\u2010', '\u2011'].includes(expected[sourceIndex + 1])
      && word(expected[sourceIndex + 2]) && expected[sourceIndex] + expected[sourceIndex + 2] === actual[outputIndex]) {
      edits.push({ index: outputIndex, value: expected.slice(sourceIndex, sourceIndex + 3).join('') });
      sourceIndex += 3; outputIndex++; continue;
    }
    const original = expected[sourceIndex];
    const replacement = ['\u2013', '\u2014'].includes(original) ? '-'
      : ['\u2018', '\u2019'].includes(original) ? "'"
      : ['\u201c', '\u201d'].includes(original) ? '"' : null;
    const quoteFold = ['"', '\u2018', '\u2019', '\u201c', '\u201d'].includes(original) && ['"', "'"].includes(actual[outputIndex]);
    if (quoteFold || (replacement && actual[outputIndex] === replacement)) {
      edits.push({ index: outputIndex, value: expected[sourceIndex] });
      sourceIndex++; outputIndex++; continue;
    }
    // A damaged or cross-page opening must not prevent restoration later on.
    // Resume only at a complete, unique, exact context in both streams; never
    // change the intervening words or guess between repeated passages.
    complete = false;
    let resume = null;
    for (let a = sourceIndex; a <= Math.min(expected.length - contextLength, sourceIndex + searchDistance); a++) {
      const key = JSON.stringify(expected.slice(a, a + contextLength));
      const b = outputContexts.get(key);
      if (sourceContexts.get(key) !== a || b == null || b < outputIndex || b > outputIndex + searchDistance) continue;
      if (!resume || a - sourceIndex + b - outputIndex < resume.cost) resume = { a, b, cost: a - sourceIndex + b - outputIndex };
    }
    if (!resume) return { matches: false, expected, actual, sourceIndex, outputIndex, edits };
    sourceIndex = resume.a; outputIndex = resume.b;
  }
  const matches = complete && sourceIndex === expected.length && outputIndex === actual.length;
  return { matches, expected, actual, sourceIndex, outputIndex, edits };
}
