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
const normalized = s => D.compact(D.casefold(s));
function visible(doc) {
  const clone = D.parse(D.serialize(doc));
  for (const n of D.elements(clone, n => D.C.SKIP_TAGS.includes(n.name)))
    D.DomUtils.removeElement(n);
  return D.textOf(clone);
}
function ngrams(s) {
  const words = D.words(s)
      .filter(w => D.length(w) > 2)
      .map(D.casefold),
    set = new Set();
  for (let i = 0; i <= words.length - 5; i++)
    set.add(words.slice(i, i + 5).join('\0'));
  return set;
}
export async function validateTranslation(
  sourcePath,
  targetPath,
  { targetLanguage, intendedTarget, units, translations } = {}
) {
  sourcePath = D.resolve(sourcePath);
  targetPath = D.resolve(targetPath);
  const reference = intendedTarget ? D.resolve(intendedTarget) : targetPath,
    source = D.parse(await fs.readFile(sourcePath, 'utf8')),
    target = D.parse(await fs.readFile(targetPath, 'utf8')),
    findings = structureFindings(source, target, sourcePath, reference);
  findings.push(...(await assetFindings(target, reference)));
  const add = (severity, code, message, details) =>
    findings.push({
      severity,
      code,
      message,
      ...(details === undefined ? {} : { details })
    });
  const blocks = d => D.elements(d, n => V.BLOCK_TAGS.includes(n.name)),
    sourceBlocks = blocks(source),
    targetBlocks = blocks(target),
    countsSource = D.count(sourceBlocks.map(n => n.name)),
    countsTarget = D.count(targetBlocks.map(n => n.name));
  if (D.sortedJson(countsSource) !== D.sortedJson(countsTarget))
    add('error', 'block-count', 'Paragraph or semantic block counts changed.', {
      source: countsSource,
      target: countsTarget
    });
  const sourceText = visible(source),
    targetText = visible(target);
  let script =
      V.LANGUAGE_SCRIPTS[targetLanguage.split('-')[0].toLowerCase()] ?? null,
    scriptRatio = null;
  const targetLetters = D.letters(targetText).length;
  if (script && targetLetters >= 100)
    scriptRatio =
      (targetText.match(new RegExp(V.SCRIPT_PATTERNS[script], 'gu')) ?? [])
        .length / targetLetters;
  else script = null;
  if (script !== null && scriptRatio < 0.2)
    add(
      'error',
      'target-script',
      `Too little text uses the expected ${script} script.`,
      { ratio: round4(scriptRatio) }
    );
  let unchanged = 0,
    eligible = 0;
  const pairs =
    units && translations
      ? units.map(u => [
          u.source.replace(D.tokenRE, ''),
          translations[u.id].replace(D.tokenRE, '')
        ])
      : sourceBlocks
          .slice(0, targetBlocks.length)
          .map((n, i) => [D.textOf(n), D.textOf(targetBlocks[i])]);
  for (const [a, b] of pairs)
    if (D.words(a).length >= 4) {
      eligible++;
      if (normalized(a) === normalized(b)) unchanged++;
    }
  const unchangedRatio = eligible ? unchanged / eligible : 0;
  if (unchanged >= 5 && unchangedRatio > 0.1)
    add(
      'error',
      'untranslated-content',
      'Too many substantial blocks appear untranslated.',
      { count: unchanged, ratio: round4(unchangedRatio) }
    );
  else if (unchanged >= 2 || unchangedRatio > 0.02)
    add(
      'warning',
      'possibly-untranslated-content',
      'Some substantial blocks may be untranslated.',
      { count: unchanged, ratio: round4(unchangedRatio) }
    );
  const sn = ngrams(sourceText),
    tn = ngrams(targetText),
    overlap = sn.size ? [...sn].filter(n => tn.has(n)).length / sn.size : 0;
  if (overlap > 0.2)
    add(
      'error',
      'source-text-overlap',
      'The translation retains too many source-language word sequences.',
      { ratio: round4(overlap) }
    );
  else if (overlap > 0.08)
    add(
      'warning',
      'source-text-overlap',
      'The translation retains a notable amount of source text.',
      { ratio: round4(overlap) }
    );
  let duplicateRatio = 0;
  if (translations && Object.keys(translations).length) {
    const ids = new Set(
      units
        ? units.filter(D.requiresModel).map(u => u.id)
        : Object.keys(translations)
    );
    const substantial = Object.entries(translations)
        .filter(([id, v]) => ids.has(id) && D.letters(v).length >= 30)
        .map(([, v]) => normalized(v)),
      duplicates = substantial.length - new Set(substantial).size;
    duplicateRatio = substantial.length ? duplicates / substantial.length : 0;
    if (duplicateRatio > 0.15)
      add(
        'error',
        'duplicate-translations',
        'Too many distinct units have identical translations.',
        { ratio: round4(duplicateRatio) }
      );
    else if (duplicateRatio > 0.05)
      add(
        'warning',
        'duplicate-translations',
        'Several distinct units have identical translations.',
        { ratio: round4(duplicateRatio) }
      );
  }
  const sourceLetters = D.letters(sourceText).length,
    lengthRatio = sourceLetters ? targetLetters / sourceLetters : 1;
  if (lengthRatio < 0.45 || lengthRatio > 2.2)
    add(
      'warning',
      'translation-length',
      'Translation length is outside the expected heuristic range.',
      { ratio: round4(lengthRatio) }
    );
  return {
    status: status(findings),
    findings,
    metrics: {
      sourceBlocks: countsSource,
      targetBlocks: countsTarget,
      sourceElements: relevantElements(source).length,
      targetElements: relevantElements(target).length,
      expectedScript: script,
      expectedScriptRatio: scriptRatio === null ? null : round4(scriptRatio),
      eligibleTranslationUnits: eligible,
      unchangedUnits: unchanged,
      unchangedRatio: round4(unchangedRatio),
      sourceNgramOverlap: round4(overlap),
      duplicateTranslationRatio: round4(duplicateRatio),
      lengthRatio: round4(lengthRatio)
    }
  };
}
