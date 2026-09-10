import fs from 'node:fs/promises';
import { parse, elements, first, named, has, meta, textOf } from './dom.mjs';
import { fileSha256, factTokens, normalizeLanguage, wordCount } from './core.mjs';
export async function validateMarketingSummary(sourcePath, targetPath, { expectedLanguage } = {}) {
  const source = parse(await fs.readFile(sourcePath, 'utf8')), target = parse(await fs.readFile(targetPath, 'utf8')), findings = [];
  const finding = (code, message, details) => findings.push({ severity: 'error', code, message, ...(details === undefined ? {} : { details }) });
  if (meta(target, 'marketing-summary-generator') !== 'marketingsummary-skill') finding('ownership-marker', 'Marketing summary ownership metadata is missing.');
  if (meta(target, 'marketing-summary-source-sha256') !== await fileSha256(sourcePath)) finding('source-hash', 'Marketing summary does not identify this source revision.');
  try { if (normalizeLanguage(expectedLanguage || named(source, 'html')?.attribs.lang || '') !== normalizeLanguage(named(target, 'html')?.attribs.lang || '')) finding('language', 'Output language metadata differs from the source.'); }
  catch { finding('language', 'Source or output has invalid language metadata.'); }
  const article = first(target, node => node.name === 'article' && has(node, 'data-marketing-summary'));
  let mainText = '', actualWords = 0;
  if (!article) finding('marketing-body', 'The reader-facing marketing article is missing.');
  else {
    mainText = textOf(article); actualWords = wordCount(mainText);
    const paragraphs = elements(article, node => node.name === 'p');
    if (!named(article, 'h1') || !named(article, 'h2') || paragraphs.length < 3) finding('semantic-shape', 'The sales page needs a headline, sections, and prose.');
    for (const paragraph of paragraphs) if (!textOf(paragraph)) finding('empty-paragraph', 'The sales page contains an empty paragraph.');
  }
  const metaInt = name => { const value = meta(target, name); return typeof value === 'string' && /^[+-]?\d+$/.test(value.trim()) ? Number(value) : null; };
  const minimum = metaInt('marketing-summary-minimum-words'), maximum = metaInt('marketing-summary-maximum-words'), declared = metaInt('marketing-summary-actual-words');
  if ([minimum, maximum, declared].includes(null)) finding('word-metadata', 'Adaptive word-budget metadata is incomplete.');
  else {
    if (actualWords !== declared) finding('word-count', 'Declared and actual word counts differ.', { declared, actual: actualWords });
    if (actualWords < minimum || actualWords > maximum) finding('word-budget', 'Sales copy is outside its adaptive word range.', { minimum, maximum, actual: actualWords });
  }
  const sourceFacts = factTokens(textOf(source)), unsupported = [...factTokens(mainText)].filter(item => !sourceFacts.has(item)).sort();
  if (unsupported.length) finding('unsupported-factual-token', 'Sales copy contains factual tokens absent from the source.', unsupported);
  if (first(target, node => has(node, 'data-source-units') || has(node, 'data-hook-ids') || (node.name === 'details' && has(node, 'data-source-map')) || (node.attribs.class ?? '').split(/\s+/u).includes('reading-time'))) finding('internal-data-visible', 'Reader-facing output exposes internal metrics or traceability data.');
  if (first(target, node => ['script', 'button', 'form'].includes(node.name))) finding('interactive-or-scripted', 'Sales output must remain a text-first page without scripts, forms, or CTA buttons.');
  if (first(target, node => node.name === 'a' && has(node, 'href'))) finding('direct-link', 'Sales output must not add direct promotional links.');
  const counts = new Map();
  for (const node of elements(target, node => has(node, 'id'))) counts.set(node.attribs.id, (counts.get(node.attribs.id) ?? 0) + 1);
  const duplicates = [...counts].filter(([, count]) => count > 1).map(([value]) => value);
  if (duplicates.length) finding('duplicate-ids', 'Output contains duplicate IDs.', duplicates);
  return { status: findings.length ? 'failed' : 'passed', findings, metrics: { actualWords, minimumWords: minimum, maximumWords: maximum, unsupportedFactualTokens: unsupported.length }, limitations: "Deterministic checks supplement but cannot replace the active LLM's semantic spoiler review." };
}
