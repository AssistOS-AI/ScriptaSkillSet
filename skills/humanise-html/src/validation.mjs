import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import * as D from './document.mjs';
import {
  structureFindings,
  assetFindings,
  relevantElements,
  round4,
  status
} from './structure.mjs';
const V = JSON.parse(
  readFileSync(new URL('../assets/validation.json', import.meta.url), 'utf8')
);
const wordRE = /(?<![\p{L}\p{N}_])[\p{L}]+(?:['’\-][\p{L}]+)*(?![\p{L}\p{N}_])/gu;
const words = s => s.match(wordRE) ?? [];
const patterns = V.CANNED_PATTERNS.map(
  p =>
    new RegExp(
      p.replaceAll(
        '\\b',
        '(?:(?<![\\p{L}\\p{N}_])(?=[\\p{L}\\p{N}_])|(?<=[\\p{L}\\p{N}_])(?![\\p{L}\\p{N}_]))'
      ),
      'giu'
    )
);
const sentences = s =>
  s
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => words(s).length >= 3);
export function stylePenalty(text) {
  let score = patterns.reduce((n, p) => n + [...text.matchAll(p)].length, 0);
  const ws = words(text);
  if (ws.length)
    for (const p of ['—', ':', ';']) {
      const n = text.split(p).length - 1;
      if (n >= 3 && n / ws.length > 0.025) score += n - 2;
    }
  const starts = D.count(
    sentences(text).map(s =>
      D.casefold(
        words(s)
          .slice(0, 2)
          .join(' ')
      )
    )
  );
  return (
    score +
    Object.entries(starts)
      .filter(([s, n]) => s && n > 2)
      .reduce((v, [, n]) => v + n - 2, 0)
  );
}
export function styleMetrics(blocks) {
  const ss = blocks.flatMap(sentences),
    starts = D.count(
      ss.map(s =>
        D.casefold(
          words(s)
            .slice(0, 2)
            .join(' ')
        )
      )
    ),
    lengths = ss.map(s => words(s).length),
    mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  let cv = null;
  if (lengths.length >= 8 && mean > 0)
    cv =
      Math.sqrt(
        lengths.reduce((n, l) => n + (l - mean) ** 2, 0) / lengths.length
      ) / mean;
  const normalized = blocks
    .filter(b => words(b).length >= 6)
    .map(b => D.compact(D.casefold(b)));
  return {
    stylePenalty: blocks.reduce((n, b) => n + stylePenalty(b), 0),
    sentences: ss.length,
    repeatedSentenceBeginnings: Object.entries(starts)
      .filter(([s, n]) => s && n > 2)
      .reduce((v, [, n]) => v + n - 2, 0),
    sentenceLengthCoefficientOfVariation: cv === null ? null : round4(cv),
    duplicateBlocks: normalized.length - new Set(normalized).size
  };
}
export async function validateHumanisation(
  sourcePath,
  targetPath,
  { intendedSource, intendedTarget, units, results } = {}
) {
  sourcePath = D.resolve(sourcePath);
  targetPath = D.resolve(targetPath);
  const refSource = intendedSource ? D.resolve(intendedSource) : sourcePath,
    refTarget = intendedTarget ? D.resolve(intendedTarget) : targetPath,
    source = D.parse(await fs.readFile(sourcePath, 'utf8')),
    target = D.parse(await fs.readFile(targetPath, 'utf8')),
    findings = structureFindings(source, target, refSource, refTarget);
  findings.push(...(await assetFindings(target, refTarget)));
  const add = (severity, code, message, details) =>
    findings.push({
      severity,
      code,
      message,
      ...(details === undefined ? {} : { details })
    });
  const blocks = d => D.elements(d, n => D.C.BLOCK_TAGS.includes(n.name)),
    sb = blocks(source),
    tb = blocks(target),
    sc = D.count(sb.map(n => n.name)),
    tc = D.count(tb.map(n => n.name));
  if (D.sortedJson(sc) !== D.sortedJson(tc))
    add('error', 'block-count', 'Paragraph or semantic block counts changed.', {
      source: sc,
      target: tc
    });
  const empty = tb.flatMap((n, i) => (D.textOf(n).trim() ? [] : [i + 1]));
  if (empty.length)
    add(
      'error',
      'empty-blocks',
      'Humanisation created empty semantic blocks.',
      { indexes: empty.slice(0, 30) }
    );
  const sourceStyle = styleMetrics(sb.map(D.textOf)),
    targetStyle = styleMetrics(tb.map(D.textOf));
  if (targetStyle.duplicateBlocks > sourceStyle.duplicateBlocks)
    add(
      'error',
      'new-duplicate-blocks',
      'Humanisation introduced duplicate substantial blocks.'
    );
  if (
    targetStyle.repeatedSentenceBeginnings >
    sourceStyle.repeatedSentenceBeginnings + 2
  )
    add(
      'warning',
      'repeated-sentence-beginnings',
      'Repeated sentence openings increased.'
    );
  const a = sourceStyle.sentenceLengthCoefficientOfVariation,
    b = targetStyle.sentenceLengthCoefficientOfVariation;
  if (a !== null && b !== null && b < 0.18 && b < a)
    add(
      'warning',
      'uniform-sentence-length',
      'Sentence lengths became unusually uniform.'
    );
  let changed = 0,
    kept = 0;
  if (units && results) {
    for (const u of units) {
      const e = results[u.id];
      if (!e) {
        add('error', 'missing-unit-result', `Unit ${u.id} has no result.`);
        continue;
      }
      const clean = s => s.replace(D.tokenRE, '').replace(D.protectionRE, ''),
        sp = clean(u.source),
        tp = clean(String(e.text ?? ''));
      if (e.action === 'rewrite') changed++;
      if (e.action === 'keep') kept++;
      const sl = D.letters(sp).length,
        tl = D.letters(tp).length,
        ratio = sl ? tl / sl : 1;
      if (e.action === 'rewrite' && (ratio < 0.55 || ratio > 1.75))
        add(
          'error',
          'unit-length',
          `Unit ${u.id} changed length beyond conservative limits.`,
          { ratio: round4(ratio) }
        );
      if (e.action === 'rewrite' && stylePenalty(tp) > stylePenalty(sp))
        add(
          'error',
          'style-regression',
          `Unit ${u.id} added detectable canned or repetitive style signals.`
        );
    }
    if (
      sourceStyle.stylePenalty > 0 &&
      targetStyle.stylePenalty >= sourceStyle.stylePenalty
    )
      add(
        'warning',
        'style-not-improved',
        'Flagged source mannerisms did not decrease overall.'
      );
  }
  return {
    status: status(findings),
    findings,
    metrics: {
      sourceElements: relevantElements(source).length,
      targetElements: relevantElements(target).length,
      sourceBlocks: sc,
      targetBlocks: tc,
      sourceStyle,
      targetStyle,
      auditedUnits: results ? Object.keys(results).length : null,
      rewrittenUnits: results ? changed : null,
      keptUnits: results ? kept : null
    },
    limitations:
      'Deterministic checks and LLM self-audit cannot prove human authorship or guarantee factual correctness; no detector-evasion claim is made.'
  };
}
