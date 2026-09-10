import fs from 'node:fs/promises';
import path from 'node:path';
import * as D from './document.mjs';
import { normalizeLanguage } from './language.mjs';
export * from './document.mjs';
export { normalizeLanguage };
const {
  parse,
  elements,
  named,
  has,
  textOf,
  excluded,
  words,
  length,
  readJson,
  writeJson,
  resolve,
  exists,
  hash,
  fileSha256,
  extractUnits,
  annotateMemory,
  requiresModel,
  C
} = D;
export function defaultOutputPath(source, from, to) {
  if (
    ![from.toLowerCase(), from.split('-')[0].toLowerCase()].includes(
      path.basename(path.dirname(source)).toLowerCase()
    )
  )
    throw Error(
      'Default output requires the source HTML to live in a language directory. Pass --output explicitly.'
    );
  return path.join(
    path.dirname(path.dirname(source)),
    to.toLowerCase(),
    path.basename(source)
  );
}
export function bootstrapPages(doc) {
  const qualified = [],
    fallback = [];
  for (const section of elements(
    doc,
    n => n.name === 'section' && has(n, 'data-source-page')
  )) {
    const page = section.attribs['data-source-page'],
      ps = elements(section, n => n.name === 'p' && !excluded(n)),
      prose = ps.reduce((v, p) => v + words(textOf(p)).length, 0),
      total = words(textOf(section)).length,
      tables = elements(section, n => n.name === 'table').reduce(
        (v, t) => v + words(textOf(t)).length,
        0
      );
    fallback.push([prose, page]);
    if (
      ps.length >= 2 &&
      prose >= 150 &&
      total > 0 &&
      prose / total >= 0.65 &&
      tables / total < 0.35 &&
      !(section.attribs.class ?? '')
        .split(/\s+/)
        .includes('source-page-full-image')
    )
      qualified.push(page);
    if (qualified.length === 2) break;
  }
  return qualified.length
    ? qualified.slice(0, 2)
    : fallback
        .sort((a, b) => b[0] - a[0] || (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0))
        .slice(0, 2)
        .map(x => x[1]);
}
export function batchUnits(units, bootstrapIds, maximumChars = 32000) {
  const bootstrap = units.filter(u => bootstrapIds.has(u.id)),
    remaining = units.filter(u => !bootstrapIds.has(u.id)),
    batches = bootstrap.length ? [bootstrap] : [];
  let current = [],
    size = 0,
    currentPage = null;
  for (const u of remaining) {
    const unitSize = requiresModel(u) ? length(u.source) : 0,
      changed = currentPage !== null && u.page !== currentPage;
    if (current.length && size + unitSize > maximumChars && changed) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(u);
    size += unitSize;
    currentPage = u.page;
  }
  if (current.length) batches.push(current);
  return batches;
}
export async function prepareJob(
  input,
  { targetLanguage, sourceLanguage, output, jobDir } = {}
) {
  const source = resolve(input);
  if (!(await exists(source)))
    throw Error(`HTML input does not exist: ${source}`);
  const doc = parse(await fs.readFile(source, 'utf8'));
  if (!named(doc, 'html'))
    throw Error('Input must be a complete HTML document.');
  const from = sourceLanguage || named(doc, 'html').attribs.lang;
  if (!from)
    throw Error('Source language is missing. Add <html lang> or pass --from.');
  sourceLanguage = normalizeLanguage(from);
  targetLanguage = normalizeLanguage(targetLanguage);
  if (sourceLanguage.toLowerCase() === targetLanguage.toLowerCase())
    throw Error('Source and target languages must differ.');
  const explicit = Boolean(output);
  output = output
    ? resolve(output)
    : defaultOutputPath(source, sourceLanguage, targetLanguage);
  if (output === source)
    throw Error('Output must not overwrite the source HTML.');
  const sourceHash = await fileSha256(source);
  if (!jobDir) {
    const identity = hash(
        `${source}\0${sourceHash}\0${targetLanguage}\0${output}\0${32000}\0${4}`
      ).slice(0, 16),
      root = explicit
        ? path.dirname(source)
        : path.dirname(path.dirname(source));
    jobDir = path.join(
      root,
      '.translatehtml-jobs',
      `${path.basename(
        source,
        path.extname(source)
      )}-${targetLanguage.toLowerCase()}-${identity}`
    );
    if (await exists(path.join(jobDir, 'job.json'))) {
      const saved = await readJson(path.join(jobDir, 'job.json'));
      if (saved.sourceSha256 === sourceHash && saved.output === output)
        return { ...(await jobStatus(jobDir)), resumed: true };
      throw Error(`Existing job identity mismatch: ${jobDir}`);
    }
  }
  jobDir = resolve(jobDir);
  await fs.mkdir(path.dirname(jobDir), { recursive: true });
  await fs.mkdir(jobDir);
  for (const n of ['batches', 'translations'])
    await fs.mkdir(path.join(jobDir, n));
  const outline = parse(D.serialize(doc)),
    pages = bootstrapPages(outline),
    { units } = extractUnits(doc),
    memory = annotateMemory(units),
    bootstrapIds = new Set(
      units.filter(u => pages.includes(u.page)).map(u => u.id)
    ),
    batches = batchUnits(units, bootstrapIds),
    names = [];
  for (const [i, b] of batches.entries()) {
    const name = `batch-${String(i + 1).padStart(4, '0')}.json`;
    names.push(name);
    await writeJson(path.join(jobDir, 'batches', name), {
      batch: i + 1,
      bootstrap: i === 0,
      sourceLanguage,
      targetLanguage,
      units: b
    });
  }
  const job = {
    source,
    sourceSha256: sourceHash,
    output,
    sourceLanguage,
    targetLanguage,
    bootstrapPages: pages,
    bootstrapUnitIds: [...bootstrapIds].sort(),
    batches: names,
    unitCount: units.length,
    modelUnitCount: units.filter(requiresModel).length,
    batchMaximumChars: 32000,
    translationMemory: memory,
    parallelTranslation: { enabledAfterBootstrap: true, maxBatches: 4 },
    elementCounts: D.count(elements(outline).map(n => n.name))
  };
  await writeJson(path.join(jobDir, 'job.json'), job);
  await fs.writeFile(path.join(jobDir, 'template.html'), D.serialize(doc));
  const other = elements(
      outline,
      n =>
        n.name === 'section' &&
        has(n, 'data-source-page') &&
        !pages.includes(n.attribs['data-source-page'])
    ),
    indexes = [
      ...new Set([
        Math.floor(other.length / 4),
        Math.floor(other.length / 2),
        Math.max(0, other.length - 2)
      ])
    ].sort((a, b) => a - b),
    samples = other.length
      ? indexes
          .map(i => named(other[i], 'p'))
          .filter(Boolean)
          .map(p => [...textOf(p)].slice(0, 1200).join(''))
          .slice(0, 3)
      : [];
  await writeJson(path.join(jobDir, 'bootstrap.json'), {
    title: named(outline, 'title') ? textOf(named(outline, 'title')) : '',
    headings: elements(outline, n => /^h[1-6]$/.test(n.name)).map(textOf),
    captions: elements(outline, n =>
      ['caption', 'figcaption'].includes(n.name)
    ).map(textOf),
    bootstrapPages: pages,
    representativeSamples: samples,
    instructions:
      'Create a compact translation profile, translate and review the bootstrap units first, then set bootstrapReviewed to true in context.json.'
  });
  await writeJson(path.join(jobDir, 'context.json'), {
    bootstrapReviewed: false,
    documentProfile: '',
    glossary: [],
    previousBatchSummary: '',
    previousPairs: []
  });
  return {
    status: 'prepared',
    job: jobDir,
    source,
    output,
    sourceLanguage,
    targetLanguage,
    units: units.length,
    modelUnits: job.modelUnitCount,
    batches: names.length,
    batchMaximumChars: 32000,
    translationMemory: memory,
    parallelTranslation: true,
    bootstrapPages: pages,
    completedBatches: 0,
    remainingBatches: names.length,
    nextBatch: names[0] ?? null
  };
}
export async function jobStatus(input) {
  const dir = resolve(input);
  if (!(await exists(path.join(dir, 'job.json'))))
    throw Error(`Translation job does not exist: ${dir}`);
  const job = await readJson(path.join(dir, 'job.json')),
    incomplete = [],
    bootstrapNames = [];
  let completedBatches = 0,
    completedUnits = 0,
    bootstrapComplete = true;
  for (const name of job.batches) {
    const b = await readJson(path.join(dir, 'batches', name)),
      expected = b.units.filter(requiresModel).map(u => u.id);
    let valid = !expected.length;
    try {
      if (expected.length) {
        const entries =
          (await readJson(path.join(dir, 'translations', name))).units ?? [];
        valid =
          Array.isArray(entries) &&
          entries.length === expected.length &&
          new Set(entries.map(e => String(e.id ?? ''))).size ===
            expected.length &&
          entries.every(e => expected.includes(String(e.id ?? '')));
      }
    } catch {}
    if (valid) {
      completedBatches++;
      completedUnits += b.units.length;
    } else incomplete.push(name);
    if (b.bootstrap) {
      bootstrapComplete = valid;
      bootstrapNames.push(name);
    }
  }
  let contextReady = false;
  try {
    const c = await readJson(path.join(dir, 'context.json'));
    contextReady = Boolean(
      c.bootstrapReviewed && String(c.documentProfile ?? '').trim()
    );
  } catch {}
  const ready = !bootstrapComplete
      ? incomplete.filter(n => bootstrapNames.includes(n))
      : contextReady
      ? incomplete
      : [],
    remaining = job.batches.length - completedBatches;
  return {
    status: remaining === 0 ? 'ready_to_build' : 'in_progress',
    job: dir,
    source: job.source,
    output: job.output,
    sourceLanguage: job.sourceLanguage,
    targetLanguage: job.targetLanguage,
    units: job.unitCount,
    modelUnits: job.modelUnitCount,
    completedUnits,
    batches: job.batches.length,
    completedBatches,
    remainingBatches: remaining,
    nextBatch: ready[0] ?? incomplete[0] ?? null,
    readyBatches: ready,
    recommendedParallelBatches: Math.min(
      job.parallelTranslation.maxBatches,
      ready.length
    )
  };
}
export async function loadTranslations(dir, job) {
  const translated = {};
  for (const name of job.batches) {
    const b = await readJson(path.join(dir, 'batches', name)),
      required = b.units.filter(requiresModel).map(u => u.id);
    if (!required.length) continue;
    const p = path.join(dir, 'translations', name);
    if (!(await exists(p))) throw Error(`Missing translated batch: ${p}`);
    const payload = await readJson(p);
    if (!payload || Array.isArray(payload) || typeof payload !== 'object')
      throw Error(`Translated batch must be a JSON object: ${p}`);
    if (!Array.isArray(payload.units))
      throw Error(`Translated batch must contain a units list: ${p}`);
    for (const e of payload.units) {
      const id = String(e.id ?? '');
      if (!id || Object.hasOwn(translated, id))
        throw Error(`Duplicate or missing unit ID in ${p}`);
      if (typeof e.translation !== 'string' || !e.translation.trim())
        throw Error(`Unit ${id} has an empty translation.`);
      translated[id] = e.translation;
    }
    if (
      payload.units.length !== required.length ||
      payload.units.some(e => !required.includes(String(e.id ?? '')))
    )
      throw Error(`Translated batch unit mismatch in ${p}`);
  }
  for (const u of await D.allUnits(dir, job)) {
    if (Object.hasOwn(translated, u.id)) continue;
    const canonical = u.reuseOf || u.reuseTemplateOf;
    if (!canonical || !Object.hasOwn(translated, canonical))
      throw Error(
        `Unit ${u.id} cannot resolve translation memory source ${canonical}.`
      );
    let value = translated[canonical];
    if (u.reuseTemplateOf) {
      const re = new RegExp(`(?<!\\d)${u.templateNumber}(?!\\d)`, 'g');
      if ([...value.matchAll(re)].length !== 1)
        throw Error(
          `Template translation ${canonical} must preserve numeric token ${u.templateNumber} exactly once.`
        );
      value = value.replace(re, u.sourceNumber);
    }
    translated[u.id] = value;
  }
  return translated;
}
export async function buildJob(input, { overwrite = false } = {}) {
  const dir = resolve(input),
    job = await readJson(path.join(dir, 'job.json'));
  if ((await fileSha256(job.source)) !== job.sourceSha256)
    throw Error('Source HTML changed after the translation job was prepared.');
  const context = await readJson(path.join(dir, 'context.json'));
  if (
    !context.bootstrapReviewed ||
    !String(context.documentProfile ?? '').trim()
  )
    throw Error(
      'context.json must contain a documentProfile and bootstrapReviewed=true.'
    );
  const units = await D.allUnits(dir, job),
    translations = await loadTranslations(dir, job);
  if (
    Object.keys(translations).length !== units.length ||
    units.some(u => !Object.hasOwn(translations, u.id))
  )
    throw Error('Translation unit mismatch.');
  const doc = parse(await fs.readFile(path.join(dir, 'template.html'), 'utf8'));
  D.applyUnits(doc, units, translations);
  named(doc, 'html').attribs.lang = job.targetLanguage;
  if (C.RTL_LANGUAGES.includes(job.targetLanguage.split('-')[0].toLowerCase()))
    named(doc, 'html').attribs.dir = 'rtl';
  else delete named(doc, 'html').attribs.dir;
  D.rewriteLocalReferences(doc, job.source, job.output);
  D.addMetadata(doc, {
    'translation-generator': 'translatehtml-skill',
    'translation-source-language': job.sourceLanguage,
    'translation-target-language': job.targetLanguage,
    'translation-source-sha256': job.sourceSha256
  });
  const candidate = path.join(dir, 'candidate.html');
  await fs.writeFile(candidate, '<!doctype html>\n' + D.serialize(doc));
  const { validateTranslation } = await import('./validation.mjs');
  const report = await validateTranslation(job.source, candidate, {
    targetLanguage: job.targetLanguage,
    intendedTarget: job.output,
    units,
    translations
  });
  if (report.status === 'failed')
    throw Error(
      `Translation validation failed; candidate retained at ${candidate}. Findings: ${JSON.stringify(
        report.findings
      )}`
    );
  if (
    (await exists(job.output)) &&
    (!overwrite ||
      !elements(
        parse(await fs.readFile(job.output, 'utf8')),
        n =>
          n.name === 'meta' &&
          n.attribs.name === 'translation-generator' &&
          n.attribs.content === 'translatehtml-skill'
      ).length)
  )
    throw Error(
      `Refusing to replace ${job.output}; use --overwrite on translatehtml-owned output.`
    );
  await fs.mkdir(path.dirname(job.output), { recursive: true });
  const stage = path.join(
    path.dirname(job.output),
    `.${path.basename(job.output)}.translatehtml-stage`
  );
  await fs.copyFile(candidate, stage);
  await fs.rename(stage, job.output);
  await writeJson(path.join(dir, 'report.json'), report);
  return {
    status: report.status,
    artifact: job.output,
    job: dir,
    validation: report
  };
}
