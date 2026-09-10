import fs from 'node:fs/promises';
import { parse, elements, first, named, has, meta, textOf } from './dom.mjs';
import { fileSha256, factTokens, normalizeLanguage, splitSentences } from './core.mjs';

export async function validateShortDescription(sourcePath, targetPath, { expectedLanguage } = {}) {
  const source = parse(await fs.readFile(sourcePath, 'utf8')), target = parse(await fs.readFile(targetPath, 'utf8'));
  const findings = [];
  const finding = (code, message, details) => findings.push({ severity: 'error', code, message, ...(details === undefined ? {} : { details }) });
  if (meta(target, 'short-description-generator') !== 'shortdescription-skill') finding('ownership-marker', 'Short-description ownership metadata is missing.');
  if (meta(target, 'short-description-source-sha256') !== await fileSha256(sourcePath)) finding('source-hash', 'Short description does not identify this source revision.');
  try {
    if (normalizeLanguage(expectedLanguage || named(source, 'html')?.attribs.lang || '') !== normalizeLanguage(named(target, 'html')?.attribs.lang || '')) finding('language', 'Output language differs from the source.');
  } catch { finding('language', 'Source or output has invalid language metadata.'); }
  const article = first(target, node => node.name === 'article' && has(node, 'data-short-description'));
  let description = '', sentenceCount = 0;
  if (!article) finding('description-body', 'The short-description article is missing.');
  else {
    const paragraphs = elements(article, node => node.name === 'p');
    if (paragraphs.length !== 1 || first(article, node => /^h[1-6]$/.test(node.name))) finding('visible-shape', 'Output must contain one paragraph and no visible heading.');
    if (paragraphs.length) {
      description = textOf(paragraphs[0]); sentenceCount = splitSentences(description).length;
      if (sentenceCount < 4 || sentenceCount > 6) finding('sentence-count', 'Description must contain 4 to 6 sentences.', { actual: sentenceCount });
    }
  }
  const sourceFacts = factTokens(textOf(source)), unsupported = [...factTokens(description)].filter(value => !sourceFacts.has(value)).sort();
  if (unsupported.length) finding('unsupported-factual-token', 'Description contains factual tokens absent from the source.', unsupported);
  if (first(target, node => ['script', 'button', 'form', 'a'].includes(node.name))) finding('interactive-or-promotional', 'Output must not contain scripts, links, forms, or calls to action.');
  if (first(target, node => node.name === 'details' || has(node, 'data-source-units') || has(node, 'data-theme-ids') || (node.attribs.class ?? '').split(/\s+/u).includes('reading-time'))) finding('internal-data-visible', 'Output exposes internal workflow data.');
  const counts = new Map();
  for (const node of elements(target, node => has(node, 'id'))) counts.set(node.attribs.id, (counts.get(node.attribs.id) ?? 0) + 1);
  const duplicates = [...counts].filter(([, count]) => count > 1).map(([value]) => value);
  if (duplicates.length) finding('duplicate-ids', 'Output contains duplicate IDs.', duplicates);
  return { status: findings.length ? 'failed' : 'passed', findings, metrics: { sentences: sentenceCount, unsupportedFactualTokens: unsupported.length }, limitations: 'Deterministic checks supplement but cannot replace the active LLM semantic revelation review.' };
}
