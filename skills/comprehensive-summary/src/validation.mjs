import fs from 'node:fs/promises';
import path from 'node:path';
import {
  parse,
  elements,
  first,
  named,
  has,
  meta,
  textOf,
  compact
} from './dom.mjs';
import {
  normalizeLanguage,
  wordCount,
  factTokens,
  exists,
  resolve
} from './core.mjs';
export async function validateSummary(
  sourcePath,
  targetPath,
  { intendedSource, expectedLanguage } = {}
) {
  sourcePath = resolve(sourcePath);
  targetPath = resolve(targetPath);
  const source = parse(await fs.readFile(sourcePath, 'utf8')),
    target = parse(await fs.readFile(targetPath, 'utf8')),
    findings = [];
  const finding = (code, message, details) =>
    findings.push({
      severity: 'error',
      code,
      message,
      ...(details === undefined ? {} : { details })
    });
  if (meta(target, 'summary-generator') !== 'comprehensivesummary-skill')
    finding('ownership-marker', 'Summary ownership metadata is missing.');
  try {
    if (
      normalizeLanguage(
        expectedLanguage || named(source, 'html')?.attribs.lang || ''
      ) !== normalizeLanguage(named(target, 'html')?.attribs.lang || '')
    )
      finding('language', 'Summary language metadata differs from the source.');
  } catch {
    finding('language', 'Source or summary has invalid language metadata.');
  }
  const article = first(
    target,
    n => n.name === 'article' && has(n, 'data-summary-body')
  );
  let mainText = '',
    actualWords = 0;
  if (!article) finding('summary-body', 'The main summary article is missing.');
  else {
    mainText = textOf(article);
    actualWords = wordCount(mainText);
    if (!named(article, 'h1') || !named(article, 'h2') || !named(article, 'p'))
      finding(
        'semantic-shape',
        'Summary requires a title, thematic headings, and paragraphs.'
      );
    for (const p of elements(article, n => n.name === 'p')) {
      if (!textOf(p))
        finding('empty-paragraph', 'Summary contains an empty paragraph.');
      if (
        !(p.attribs.class ?? '').split(/\s+/).includes('dek') &&
        (!(p.attribs['data-clusters'] ?? '').trim() ||
          !(p.attribs['data-source-units'] ?? '').trim())
      )
        finding(
          'paragraph-traceability',
          'A summary paragraph lacks source tracing.'
        );
    }
  }
  const integer = name => {
    const v = meta(target, name);
    return typeof v === 'string' && /^[+-]?\d+$/.test(v.trim())
      ? Number(v)
      : null;
  };
  const minimum = integer('summary-minimum-words'),
    maximum = integer('summary-maximum-words'),
    declared = integer('summary-actual-words'),
    wpm = integer('summary-words-per-minute');
  if ([minimum, maximum, declared, wpm].includes(null))
    finding('word-metadata', 'Word-budget metadata is incomplete.');
  else {
    if (declared !== actualWords)
      finding('word-count', 'Declared and actual summary word counts differ.', {
        declared,
        actual: actualWords
      });
    if (actualWords < minimum || actualWords > maximum)
      finding(
        'word-budget',
        'Summary is outside the requested reading-time range.',
        { minimum, maximum, actual: actualWords }
      );
  }
  const sourceFacts = factTokens(textOf(source)),
    unsupported = [...factTokens(mainText)]
      .filter(t => !sourceFacts.has(t))
      .sort();
  if (unsupported.length)
    finding(
      'unsupported-factual-token',
      'Summary contains numbers, dates, URLs, emails, or DOI values absent from the source.',
      unsupported
    );
  const map = first(
    target,
    n => n.name === 'details' && has(n, 'data-source-map')
  );
  if (!map || !named(map, 'table'))
    finding('source-map', 'The collapsible source map is missing.');
  else
    for (const a of elements(map, n => n.name === 'a' && has(n, 'href'))) {
      const href = a.attribs.href;
      if (/^[A-Za-z][A-Za-z0-9+.-]*:|^[#/]/.test(href)) continue;
      const part = href.split('#')[0].split('?')[0];
      let local = path.resolve(path.dirname(targetPath), part);
      if (
        intendedSource &&
        path.basename(part) === path.basename(intendedSource)
      )
        local = intendedSource;
      if (!(await exists(local)))
        finding('source-link', `Source-map link does not resolve: ${href}`);
    }
  const ids = elements(target, n => has(n, 'id')).map(n => n.attribs.id),
    duplicates = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  if (duplicates.length)
    finding(
      'duplicate-ids',
      'Summary contains duplicate element IDs.',
      duplicates
    );
  if (named(target, 'script'))
    finding('script', 'Standalone summaries must not contain scripts.');
  const paragraphs = article
    ? elements(
        article,
        n =>
          n.name === 'p' &&
          !(n.attribs.class ?? '').split(/\s+/).includes('dek') &&
          wordCount(textOf(n)) >= 8
      ).map(n =>
        compact(
          textOf(n)
            .toLowerCase()
            .replaceAll('ß', 'ss')
        )
      )
    : [];
  const repeated = paragraphs.length - new Set(paragraphs).size;
  if (repeated)
    finding(
      'duplicate-paragraphs',
      'Summary contains duplicate substantial paragraphs.',
      { count: repeated }
    );
  return {
    status: findings.length ? 'failed' : 'passed',
    findings,
    metrics: {
      actualWords,
      minimumWords: minimum,
      maximumWords: maximum,
      wordsPerMinute: wpm,
      estimatedMinutes: wpm
        ? Math.round((actualWords / wpm) * 100) / 100
        : null,
      sourceMapRows: map ? elements(map, n => n.name === 'tr').length - 1 : 0,
      unsupportedFactualTokens: unsupported.length,
      duplicateParagraphs: repeated
    },
    limitations:
      'Source tracing and deterministic checks cannot guarantee perfect factual or interpretive accuracy; semantic fidelity still depends partly on LLM review.'
  };
}
