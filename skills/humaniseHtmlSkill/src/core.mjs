import fs from 'node:fs/promises';
import path from 'node:path';
import * as D from './document.mjs';
import { normalizeLanguage } from './language.mjs';
export * from './document.mjs';
export { normalizeLanguage };
const {
  C,
  resolve,
  exists,
  readJson,
  writeJson,
  hash,
  fileSha256,
  elements,
  named,
  textOf,
  extractUnits,
  annotateMemory,
  requiresModel,
  length
} = D;
export const defaultOutputPath = source =>
  path.join(
    path.dirname(source),
    path.basename(source, path.extname(source)) +
      '.humanised' +
      path.extname(source)
  );
export function batchUnits(units, maximumChars = 32000) {
  const grouped = new Map();
  for (const u of units) {
    if (!grouped.has(u.chapterId)) grouped.set(u.chapterId, []);
    grouped.get(u.chapterId).push(u);
  }
  const chunks = [];
  for (const units of grouped.values()) {
    let chunk = [],
      size = 0;
    for (const u of units) {
      const n = requiresModel(u) ? length(u.source) : 0;
      if (chunk.length && size + n > maximumChars) {
        chunks.push(chunk);
        chunk = [];
        size = 0;
      }
      chunk.push(u);
      size += n;
    }
    if (chunk.length) chunks.push(chunk);
  }
  const batches = [];
  let current = [],
    size = 0;
  for (const chunk of chunks) {
    const n = chunk
      .filter(requiresModel)
      .reduce((v, u) => v + length(u.source), 0);
    if (current.length && size + n > maximumChars) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(...chunk);
    size += n;
  }
  if (current.length) batches.push(current);
  return batches;
}
export async function prepareJob(
  input,
  { language, output, jobDir, inPlace = false } = {}
) {
  const source = resolve(input);
  if (!(await exists(source)))
    throw Error(`HTML input does not exist: ${source}`);
  if (inPlace && output !== undefined)
    throw Error('Use either --output or --in-place, not both.');
  const original = await fs.readFile(source),
    doc = D.parse(original.toString('utf8'));
  if (!named(doc, 'html'))
    throw Error('Input must be a complete HTML document.');
  const detected = language || named(doc, 'html').attribs.lang;
  if (!detected)
    throw Error(
      'Document language is missing. Add <html lang> or pass --language.'
    );
  language = normalizeLanguage(detected);
  const target = inPlace
    ? source
    : output
    ? resolve(output)
    : defaultOutputPath(source);
  if (target === source && !inPlace)
    throw Error('Replacing the source requires explicit --in-place.');
  const sourceHash = hash(original);
  if (!jobDir) {
    const identity = hash(
      `${source}\0${sourceHash}\0${target}\0${language}\0${
        inPlace ? 'True' : 'False'
      }`
    ).slice(0, 16);
    jobDir = path.join(
      path.dirname(source),
      '.humanisehtml-jobs',
      `${path.basename(source, path.extname(source))}-${identity}`
    );
    if (await exists(path.join(jobDir, 'job.json'))) {
      const saved = await readJson(path.join(jobDir, 'job.json'));
      if (saved.sourceSha256 === sourceHash && saved.output === target)
        return { ...(await jobStatus(jobDir)), resumed: true };
      throw Error(`Existing job identity mismatch: ${jobDir}`);
    }
  }
  jobDir = resolve(jobDir);
  await fs.mkdir(path.dirname(jobDir), { recursive: true });
  await fs.mkdir(jobDir);
  for (const n of ['batches', 'rewrites']) await fs.mkdir(path.join(jobDir, n));
  await fs.writeFile(path.join(jobDir, 'source-original.html'), original);
  const template = D.parse(original.toString('utf8')),
    { units, chapters } = extractUnits(template),
    memory = annotateMemory(units),
    batches = batchUnits(units),
    names = [];
  for (const [i, b] of batches.entries()) {
    const name = `batch-${String(i + 1).padStart(4, '0')}.json`;
    names.push(name);
    await writeJson(path.join(jobDir, 'batches', name), {
      batch: i + 1,
      language,
      chapterIds: [...new Set(b.map(u => u.chapterId))],
      rubric: C.RUBRIC,
      units: b
    });
  }
  const job = {
    source,
    sourceSha256: sourceHash,
    output: target,
    inPlace,
    language,
    batches: names,
    unitCount: units.length,
    modelUnitCount: units.filter(requiresModel).length,
    chapterCount: chapters.length,
    batchMaximumChars: 32000,
    memory,
    parallel: { enabledAfterProfile: true, maxBatches: 4 },
    elementCounts: D.count(elements(doc).map(n => n.name))
  };
  await writeJson(path.join(jobDir, 'job.json'), job);
  await fs.writeFile(path.join(jobDir, 'template.html'), D.serialize(template));
  let samples = units
    .filter(u => u.kind === 'p' && u.plainText.trim().split(/\s+/).length >= 30)
    .map(u => [...u.plainText].slice(0, 1600).join(''));
  if (samples.length)
    samples = [
      ...new Set([0, Math.floor(samples.length / 2), samples.length - 1])
    ]
      .sort((a, b) => a - b)
      .map(i => samples[i]);
  await writeJson(path.join(jobDir, 'bootstrap.json'), {
    title: named(doc, 'title') ? textOf(named(doc, 'title')) : '',
    chapters,
    headings: elements(doc, n => /^h[1-6]$/.test(n.name)).map(textOf),
    representativeSamples: samples.slice(0, 3),
    rubric: C.RUBRIC,
    instructions:
      'Infer a compact same-language voice and register profile. Fill context.json and set profileReviewed=true before any batch is edited.'
  });
  await writeJson(path.join(jobDir, 'context.json'), {
    profileReviewed: false,
    documentProfile: '',
    preserveTerms: [],
    avoidPatterns: [],
    notes: ''
  });
  return {
    status: 'prepared',
    job: jobDir,
    source,
    output: target,
    inPlace,
    language,
    chapters: chapters.length,
    units: units.length,
    modelUnits: job.modelUnitCount,
    batches: names.length,
    batchMaximumChars: 32000,
    memory,
    completedBatches: 0,
    remainingBatches: names.length,
    readyBatches: [],
    recommendedParallelBatches: 0
  };
}
export async function readContext(dir) {
  const context = await readJson(path.join(dir, 'context.json')),
    ready = Boolean(
      context.profileReviewed &&
        String(context.documentProfile ?? '').trim() &&
        ['preserveTerms', 'avoidPatterns'].every(k => Array.isArray(context[k]))
    );
  if (ready) {
    const frozen = Object.fromEntries(
        ['documentProfile', 'preserveTerms', 'avoidPatterns', 'notes'].map(
          k => [k, context[k] ?? null]
        )
      ),
      digest = hash(D.sortedJson(frozen)),
      lock = path.join(dir, 'context.sha256');
    if (await exists(lock)) {
      if ((await fs.readFile(lock, 'utf8')).trim() !== digest)
        throw Error(
          'The document profile changed after it was frozen. Restore context.json or prepare a new job.'
        );
    } else await fs.writeFile(lock, digest + '\n');
  }
  return { context, ready };
}
const exact = (v, keys) =>
  v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.keys(v)
    .sort()
    .join('|') === [...keys].sort().join('|');
export const auditValid = e =>
  exact(e.audit, [
    'meaningPreserved',
    'factsPreserved',
    'natural',
    'noSlop',
    'notes'
  ]) &&
  ['meaningPreserved', 'factsPreserved', 'natural', 'noSlop'].every(
    k => e.audit[k] === true
  ) &&
  typeof e.audit.notes === 'string';
async function rewriteFileComplete(file, expected) {
  if (!expected.length) return true;
  try {
    const p = await readJson(file);
    if (
      !exact(p, ['units']) ||
      !Array.isArray(p.units) ||
      p.units.length !== expected.length
    )
      return false;
    const ids = p.units.map(e => String(e?.id ?? ''));
    return (
      new Set(ids).size === ids.length &&
      ids.every(id => expected.includes(id)) &&
      p.units.every(
        e =>
          exact(e, ['id', 'action', 'text', 'audit']) &&
          ['keep', 'rewrite'].includes(e.action) &&
          typeof e.text === 'string' &&
          e.text.trim() &&
          auditValid(e)
      )
    );
  } catch {
    return false;
  }
}
export async function jobStatus(input) {
  const dir = resolve(input);
  if (!(await exists(path.join(dir, 'job.json'))))
    throw Error(`Humanisation job does not exist: ${dir}`);
  const job = await readJson(path.join(dir, 'job.json')),
    { ready: profileReady } = await readContext(dir),
    complete = [],
    incomplete = [];
  let completedUnits = 0;
  for (const n of job.batches) {
    const b = await readJson(path.join(dir, 'batches', n));
    if (
      await rewriteFileComplete(
        path.join(dir, 'rewrites', n),
        b.units.filter(requiresModel).map(u => u.id)
      )
    ) {
      complete.push(n);
      completedUnits += b.units.length;
    } else incomplete.push(n);
  }
  const ready = profileReady ? incomplete : [];
  return {
    status: !incomplete.length
      ? 'ready_to_build'
      : profileReady
      ? 'in_progress'
      : 'profile_required',
    job: dir,
    source: job.source,
    output: job.output,
    inPlace: job.inPlace,
    language: job.language,
    chapters: job.chapterCount,
    units: job.unitCount,
    modelUnits: job.modelUnitCount,
    completedUnits,
    batches: job.batches.length,
    completedBatches: complete.length,
    remainingBatches: incomplete.length,
    nextBatch: ready[0] ?? null,
    readyBatches: ready,
    recommendedParallelBatches: Math.min(job.parallel.maxBatches, ready.length)
  };
}
function validateTokenized(text, u) {
  const tokens = (s, re) => (s.match(re) ?? []).sort();
  if (
    JSON.stringify(tokens(text, D.tokenRE)) !==
    JSON.stringify(tokens(u.source, D.tokenRE))
  )
    throw Error(`Unit ${u.id} changed its HTML placeholder set.`);
  if (
    JSON.stringify(tokens(text, D.protectionRE)) !==
    JSON.stringify(tokens(u.source, D.protectionRE))
  )
    throw Error(`Unit ${u.id} changed its protected token set.`);
}
export async function loadRewrites(dir, job) {
  const results = {},
    units = await D.allUnits(dir, job),
    byId = new Map(units.map(u => [u.id, u]));
  for (const n of job.batches) {
    const b = await readJson(path.join(dir, 'batches', n)),
      required = b.units.filter(requiresModel).map(u => u.id),
      file = path.join(dir, 'rewrites', n);
    let entries = [];
    if (required.length) {
      if (!(await exists(file)))
        throw Error(`Missing rewritten batch: ${file}`);
      const p = await readJson(file);
      if (!exact(p, ['units']))
        throw Error(`Rewritten batch has an invalid root schema: ${file}`);
      entries = p.units;
    }
    if (!Array.isArray(entries))
      throw Error(`Rewritten batch must contain a units list: ${file}`);
    const actual = entries
      .filter(e => e && typeof e === 'object')
      .map(e => String(e.id ?? ''));
    if (
      actual.length !== required.length ||
      new Set(actual).size !== required.length ||
      actual.some(id => !required.includes(id))
    )
      throw Error(`Rewrite unit mismatch in ${file}`);
    for (const e of entries) {
      if (!exact(e, ['id', 'action', 'text', 'audit']))
        throw Error(`Rewritten unit has an invalid schema in ${file}.`);
      const id = String(e.id ?? '');
      if (Object.hasOwn(results, id)) throw Error(`Duplicate unit ID: ${id}`);
      const u = byId.get(id);
      if (
        !['keep', 'rewrite'].includes(e.action) ||
        typeof e.text !== 'string' ||
        !e.text.trim()
      )
        throw Error(`Unit ${id} has an invalid action or empty text.`);
      if (!auditValid(e))
        throw Error(
          `Unit ${id} does not contain a complete affirmative audit.`
        );
      if (e.action === 'keep' && e.text !== u.source)
        throw Error(`Unit ${id} uses keep but changed its text.`);
      if (
        u.policy === 'verify-only' &&
        (e.action !== 'keep' || e.text !== u.source)
      )
        throw Error(`Verify-only unit ${id} must be kept exactly.`);
      validateTokenized(e.text, u);
      results[id] = structuredClone(e);
    }
  }
  for (const u of units) {
    if (Object.hasOwn(results, u.id)) continue;
    if (!u.reuseOf || !Object.hasOwn(results, u.reuseOf))
      throw Error(`Unit ${u.id} cannot resolve memory source ${u.reuseOf}.`);
    results[u.id] = { ...structuredClone(results[u.reuseOf]), id: u.id };
  }
  return results;
}
export async function buildJob(input, { overwrite = false } = {}) {
  const dir = resolve(input);
  if (!(await exists(path.join(dir, 'job.json'))))
    throw Error(`Humanisation job does not exist: ${dir}`);
  const job = await readJson(path.join(dir, 'job.json'));
  if ((await fileSha256(job.source)) !== job.sourceSha256)
    throw Error('Source HTML changed after the humanisation job was prepared.');
  if (!(await readContext(dir)).ready)
    throw Error(
      'context.json requires a documentProfile and profileReviewed=true.'
    );
  const units = await D.allUnits(dir, job),
    results = await loadRewrites(dir, job);
  if (
    Object.keys(results).length !== units.length ||
    units.some(u => !Object.hasOwn(results, u.id))
  )
    throw Error('Humanisation result coverage is incomplete.');
  const doc = D.parse(
    await fs.readFile(path.join(dir, 'template.html'), 'utf8')
  );
  D.applyUnits(
    doc,
    units,
    Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v.text]))
  );
  D.rewriteLocalReferences(doc, job.source, job.output);
  if (!named(doc, 'head'))
    D.DomUtils.prependChild(named(doc, 'html'), new D.Element('head', {}));
  D.addMetadata(doc, {
    'humanisation-generator': 'humanisehtml-skill',
    'humanisation-source-sha256': job.sourceSha256,
    'humanisation-language': job.language
  });
  const candidate = path.join(dir, 'candidate.html');
  await fs.writeFile(candidate, '<!doctype html>\n' + D.serialize(doc));
  const { validateHumanisation } = await import('./validation.mjs'),
    report = await validateHumanisation(
      path.join(dir, 'source-original.html'),
      candidate,
      { intendedSource: job.source, intendedTarget: job.output, units, results }
    );
  if (report.status === 'failed') {
    await writeJson(path.join(dir, 'report.json'), report);
    throw Error(
      `Humanisation validation failed; candidate retained at ${candidate}. Findings: ${JSON.stringify(
        report.findings
      )}`
    );
  }
  if (
    (await exists(job.output)) &&
    !job.inPlace &&
    (!overwrite ||
      !elements(
        D.parse(await fs.readFile(job.output, 'utf8')),
        n =>
          n.name === 'meta' &&
          n.attribs.name === 'humanisation-generator' &&
          n.attribs.content === 'humanisehtml-skill'
      ).length)
  )
    throw Error(
      `Refusing to replace ${job.output}; use --overwrite only for skill-owned output.`
    );
  await fs.mkdir(path.dirname(job.output), { recursive: true });
  const stage = path.join(
    path.dirname(job.output),
    `.${path.basename(job.output)}.humanisehtml-stage`
  );
  await fs.copyFile(candidate, stage);
  await fs.rename(stage, job.output);
  await writeJson(path.join(dir, 'report.json'), report);
  return {
    status: report.status,
    artifact: job.output,
    job: dir,
    inPlace: job.inPlace,
    report: path.join(dir, 'report.json'),
    findings: report.findings,
    metrics: report.metrics
  };
}
