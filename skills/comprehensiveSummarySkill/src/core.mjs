import fs from 'node:fs/promises';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import {
  parse,
  elements,
  first,
  named,
  has,
  textOf,
  compact,
  meta
} from './dom.mjs';
import { normalizeLanguage } from './language.mjs';
export { normalizeLanguage };
export const C = JSON.parse(
  readFileSync(new URL('../assets/contract.json', import.meta.url), 'utf8')
);
export const readJson = async p => JSON.parse(await fs.readFile(p, 'utf8'));
export const writeJson = async (p, v) =>
  fs.writeFile(p, JSON.stringify(v, null, 2) + '\n');
export const hash = value =>
  createHash('sha256')
    .update(value)
    .digest('hex');
export const fileSha256 = async p => hash(await fs.readFile(p));
export const exists = async p => {
  try {
    return (await fs.stat(p)).isFile();
  } catch {
    return false;
  }
};
export function resolve(p) {
  let current = path.resolve(
    p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p
  );
  const suffix = [];
  for (;;) {
    try {
      return path.join(realpathSync(current), ...suffix.reverse());
    } catch (error) {
      if (
        !['ENOENT', 'ENOTDIR'].includes(error.code) ||
        path.dirname(current) === current
      )
        throw error;
      suffix.push(path.basename(current));
      current = path.dirname(current);
    }
  }
}
export const wordCount = s =>
  (s.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) ?? []).length;
const lower = s =>
  s
    .toLowerCase()
    .replaceAll('ß', 'ss')
    .replaceAll('ς', 'σ');
const heading = s => compact(lower(s).replace(/^[ .:;—–-]+|[ .:;—–-]+$/gu, ''));
const legal = new RegExp(C.LEGAL_RE, 'iu');
export const factTokens = s =>
  new Set(
    [
      ...s.matchAll(
        /(?:https?:\/\/|mailto:|www\.)[^\s<>()]+|\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b|\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+|(?<![\p{L}\p{N}_])[+-]?\d+(?:[.,:/-]\d+)*(?:\s?%|[A-Za-z]{1,4})?(?![\p{L}\p{N}_])/giu
      )
    ].map(m => lower(m[0]).replace(/[.,;:]+$/u, ''))
  );
function excluded(n) {
  for (let p = n; p; p = p.parent)
    if (
      C.SKIP_TAGS.includes(p.name) ||
      lower(p.attribs?.translate ?? '') === 'no' ||
      p.attribs?.['aria-hidden'] === 'true' ||
      has(p, 'hidden')
    )
      return true;
  return false;
}
export function extractDocument(doc) {
  if (!named(doc, 'html') || !named(doc, 'body'))
    throw Error('Input must be a complete HTML document with html and body.');
  const scope =
    first(doc, n => n.name === 'main' && has(n, 'data-reader-content')) ??
    named(doc, 'main') ??
    named(doc, 'body');
  const candidates = elements(
    scope,
    n => C.TEXT_TAGS.includes(n.name) && !excluded(n) && wordCount(textOf(n))
  );
  const roots = candidates.filter(
    n => !elements(n).some(c => candidates.includes(c))
  );
  let chapters = [],
    mapping = new Map();
  const h1s = elements(
    scope,
    n => n.name === 'h1' && !excluded(n) && wordCount(textOf(n))
  );
  if (h1s.length) {
    chapters.push({ id: 'front-matter', title: 'Front matter', anchor: null });
    let current = 'front-matter',
      number = 0;
    for (const root of roots) {
      if (h1s.includes(root)) {
        current = `chapter-${String(++number).padStart(4, '0')}`;
        chapters.push({
          id: current,
          title: compact(textOf(root)),
          anchor: root.attribs.id || null
        });
      }
      mapping.set(root, current);
    }
    chapters = chapters.filter(c => [...mapping.values()].includes(c.id));
  } else {
    const boundaries = (scope.children ?? []).filter(n =>
      ['article', 'section'].includes(n.name)
    );
    if (boundaries.length) {
      boundaries.forEach((b, i) => {
        const id = `chapter-${String(i + 1).padStart(4, '0')}`,
          h = first(b, n => /^h[1-6]$/.test(n.name));
        chapters.push({
          id,
          title: h ? compact(textOf(h)) : `Section ${i + 1}`,
          anchor: h?.attribs.id || null
        });
        const descendants = elements(b);
        for (const r of roots)
          if (r === b || descendants.includes(r)) mapping.set(r, id);
      });
      const unmapped = roots.filter(r => !mapping.has(r));
      if (unmapped.length) {
        chapters.unshift({
          id: 'front-matter',
          title: 'Front matter',
          anchor: null
        });
        unmapped.forEach(r => mapping.set(r, 'front-matter'));
      }
    } else {
      const h = first(scope, n => /^h[1-6]$/.test(n.name));
      chapters = [
        {
          id: 'document',
          title: h ? compact(textOf(h)) : 'Document',
          anchor: null
        }
      ];
      roots.forEach(r => mapping.set(r, 'document'));
    }
  }
  const units = roots.map((r, i) => ({
    id: `u${String(i + 1).padStart(6, '0')}`,
    chapterId: mapping.get(r),
    kind: r.name,
    text: compact(textOf(r)),
    sourceAnchor: r.attribs.id || null,
    wordCount: wordCount(compact(textOf(r)))
  }));
  for (const c of chapters) {
    const cu = units.filter(u => u.chapterId === c.id),
      h = heading(c.title),
      prose = cu
        .filter(u => u.kind === 'p')
        .map(u => u.text)
        .join(' '),
      total = cu.reduce((n, u) => n + u.wordCount, 0);
    let reason = null;
    if (C.CONTENTS_HEADINGS.includes(h)) reason = 'contents';
    else if (
      C.BIBLIOGRAPHY_PREFIXES.some(
        p => h === p || h.startsWith(p + ' ') || h.endsWith(' ' + p)
      )
    )
      reason = 'bibliography';
    else if (c.id !== 'front-matter' && wordCount(prose) < 40 && total < 80)
      reason = 'structural-or-title-page';
    else if (c.id === 'front-matter' && wordCount(prose) < 80)
      reason = 'structural-front-matter';
    else if (cu.length && cu.every(u => legal.test(u.text)))
      reason = 'legal-or-metadata';
    Object.assign(c, {
      included: reason === null,
      exclusionReason: reason,
      unitIds: cu.map(u => u.id),
      wordCount: total,
      batches: []
    });
  }
  return { units, chapters };
}
export function chapterBatches(units, chapters, maximumChars = 32000) {
  const batches = [];
  for (const ch of chapters.filter(c => c.included)) {
    let segment = [],
      chars = 0,
      number = 1;
    const flush = () => {
      batches.push({ chapterId: ch.id, segment: number++, units: segment });
      segment = [];
      chars = 0;
    };
    for (const u of units.filter(u => u.chapterId === ch.id)) {
      const size = [...u.text].length;
      if (segment.length && chars + size > maximumChars && size <= maximumChars)
        flush();
      segment.push(u);
      chars += size;
      if (chars > maximumChars) flush();
    }
    if (segment.length) flush();
  }
  return batches;
}
const roundEven = n =>
  n % 1 === 0.5 ? Math.floor(n) + (Math.floor(n) % 2) : Math.round(n);
export async function prepareJob(
  input,
  { minutes, wordsPerMinute = 200, language, output, jobDir } = {}
) {
  const source = resolve(input);
  if (!(await exists(source)))
    throw Error(`HTML input does not exist: ${source}`);
  if (!(minutes > 0 && Number.isFinite(minutes)))
    throw Error('--minutes must be a positive finite number.');
  if (wordsPerMinute < 50 || wordsPerMinute > 500)
    throw Error('--wpm must be between 50 and 500.');
  const original = await fs.readFile(source),
    doc = parse(original.toString('utf8')),
    detected = language || named(doc, 'html')?.attribs.lang;
  if (!detected)
    throw Error(
      'Document language is missing; add html lang or pass --language.'
    );
  const lang = normalizeLanguage(detected),
    { units, chapters } = extractDocument(doc),
    ui = C.UI_STRINGS[lang.split('-')[0].toLowerCase()] ?? C.UI_STRINGS.en;
  for (const c of chapters) if (c.id === 'front-matter') c.title = ui.front;
  const included = chapters.filter(c => c.included),
    sourceWords = included.reduce((n, c) => n + c.wordCount, 0),
    targetWords = roundEven(minutes * wordsPerMinute),
    minimumWords = Math.floor((targetWords * 90) / 100),
    maximumWords = Math.floor((targetWords * 110 + 99) / 100);
  if (minimumWords >= sourceWords)
    throw Error(
      `Requested summary lower bound (${minimumWords} words) is not shorter than the content source (${sourceWords} words).`
    );
  const stem = path.basename(source, path.extname(source)),
    label = String(minutes),
    target = output
      ? resolve(output)
      : path.join(
          path.dirname(source),
          `${stem}.summary-${label}min${path.extname(source)}`
        );
  if (target === source)
    throw Error('Summary output must not replace the source HTML.');
  const sourceHash = hash(original);
  if (!jobDir) {
    const float = Number.isInteger(minutes) ? `${minutes}.0` : String(minutes);
    const identity = hash(
      `${source}\0${sourceHash}\0${target}\0${float}\0${wordsPerMinute}`
    ).slice(0, 16);
    jobDir = path.join(
      path.dirname(source),
      '.comprehensivesummary-jobs',
      `${stem}-${label}min-${identity}`
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
  await fs.mkdir(path.join(jobDir, 'batches'));
  await fs.mkdir(path.join(jobDir, 'analyses'));
  await fs.writeFile(path.join(jobDir, 'source-original.html'), original);
  const batches = chapterBatches(units, chapters),
    names = [];
  for (const [i, b] of batches.entries()) {
    const name = `batch-${String(i + 1).padStart(4, '0')}.json`;
    names.push(name);
    const chapter = chapters.find(c => c.id === b.chapterId);
    chapter.batches.push(name);
    await writeJson(path.join(jobDir, 'batches', name), {
      batch: name,
      language: lang,
      audience: 'educated general reader',
      chapterId: b.chapterId,
      chapterTitle: chapter.title,
      segment: b.segment,
      selectionWeights: {
        centrality: 0.5,
        recurrence: 0.25,
        originality: 0.25
      },
      instructions:
        'Analyze this chapter segment faithfully. Capture its thesis, role, ideas, representative evidence, objections, and qualifications. Cite source unit IDs.',
      units: b.units
    });
  }
  await writeJson(path.join(jobDir, 'chapters.json'), { chapters });
  const title = named(doc, 'title')
    ? compact(textOf(named(doc, 'title')))
    : stem;
  await writeJson(path.join(jobDir, 'context.json'), {
    language: lang,
    sourceTitle: title,
    audience: 'educated general reader',
    format: 'unified thematic essay',
    traceability: 'collapsible source map excluded from reading time',
    shortDurationPolicy:
      'prioritize the central message and highest-ranked ideas',
    selectionWeights: { centrality: 0.5, recurrence: 0.25, originality: 0.25 },
    instructions:
      'Stay in the source language. Preserve uncertainty and disagreement. Never invent facts, examples, quotations, citations, names, dates, or numbers.'
  });
  const job = {
    source,
    sourceSha256: sourceHash,
    output: target,
    language: lang,
    sourceTitle: title,
    minutes,
    wordsPerMinute,
    targetWords,
    minimumWords,
    maximumWords,
    sourceWords,
    batches: names,
    contentChapterIds: included.map(c => c.id),
    excludedChapters: chapters
      .filter(c => !c.included)
      .map(c => ({ chapterId: c.id, reason: c.exclusionReason })),
    unitCount: units.length,
    batchMaximumChars: 32000,
    parallelAnalyses: 4
  };
  await writeJson(path.join(jobDir, 'job.json'), job);
  return {
    status: 'prepared',
    job: jobDir,
    source,
    output: target,
    language: lang,
    minutes,
    targetWords,
    wordRange: [minimumWords, maximumWords],
    sourceWords,
    contentChapters: included.length,
    excludedChapters: job.excludedChapters,
    batches: names.length,
    readyAnalyses: names,
    recommendedParallelAnalyses: Math.min(4, names.length)
  };
}
const exact = (v, keys) =>
  v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.keys(v)
    .sort()
    .join('\0') === [...keys].sort().join('\0');
const audit = (v, keys) =>
  exact(v, keys) &&
  keys.every(k => (k === 'notes' ? typeof v[k] === 'string' : v[k] === true));
const text = v => typeof v === 'string' && v.trim().length > 0;
const subset = (v, set, nonempty = false) =>
  Array.isArray(v) && (!nonempty || v.length > 0) && v.every(x => set.has(x));
const unique = v => new Set(v).size === v.length;
const score = v => typeof v === 'number' && v >= 0 && v <= 1;
export function validateAnalysis(p, b) {
  const e = [];
  if (!exact(p, C.ANALYSIS_KEYS)) return ['analysis root schema is invalid'];
  if (
    p.batch !== b.batch ||
    p.chapterId !== b.chapterId ||
    p.segment !== b.segment
  )
    e.push('analysis identity does not match its batch');
  if (!text(p.thesis) || !text(p.role))
    e.push('analysis thesis and role must be non-empty strings');
  const units = new Set(b.units.map(u => u.id));
  if (!Array.isArray(p.ideas) || !p.ideas.length)
    e.push('analysis ideas must be a non-empty list');
  else {
    const ids = [];
    for (const i of p.ideas) {
      if (!exact(i, C.IDEA_KEYS)) {
        e.push('idea schema is invalid');
        continue;
      }
      ids.push(String(i.id));
      if (!String(i.id).startsWith(b.batch.replace(/\.json$/, '') + '-idea-'))
        e.push(`idea ID ${i.id} has the wrong namespace`);
      if (!text(i.statement) || !text(i.recurrenceCandidate))
        e.push(`idea ${i.id} has empty text`);
      for (const k of ['centrality', 'originality'])
        if (!score(i[k])) e.push(`idea ${i.id} has invalid ${k}`);
      if (!subset(i.sourceUnitIds, units, true))
        e.push(`idea ${i.id} has invalid source units`);
    }
    if (!unique(ids)) e.push('idea IDs are duplicated');
  }
  for (const k of ['evidenceAndExamples', 'objectionsAndQualifications']) {
    if (!Array.isArray(p[k])) {
      e.push(`${k} must be a list`);
      continue;
    }
    for (const i of p[k])
      if (!exact(i, C.EVIDENCE_KEYS) || !text(i.statement))
        e.push(`${k} entry schema is invalid`);
      else if (!subset(i.sourceUnitIds, units, true))
        e.push(`${k} contains invalid source units`);
  }
  if (!audit(p.audit, C.ANALYSIS_AUDIT_KEYS))
    e.push('analysis audit is incomplete');
  return e;
}
export async function loadAnalyses(dir, job, requireAll = true) {
  const analyses = [],
    incomplete = [];
  for (const name of job.batches) {
    try {
      const b = await readJson(path.join(dir, 'batches', name)),
        a = await readJson(path.join(dir, 'analyses', name));
      if (validateAnalysis(a, b).length) incomplete.push(name);
      else analyses.push(a);
    } catch {
      incomplete.push(name);
    }
  }
  if (requireAll && incomplete.length)
    throw Error(
      `Missing or invalid chapter analyses: ${JSON.stringify(incomplete)}`
    );
  return { analyses, incomplete };
}
export function validateSynthesis(p, job, analyses) {
  const e = [];
  if (!exact(p, C.SYNTHESIS_KEYS)) return ['synthesis root schema is invalid'];
  if (!text(p.centralMessage)) e.push('centralMessage is empty');
  const ideas = new Set(analyses.flatMap(a => a.ideas.map(i => i.id))),
    units = new Set(
      analyses.flatMap(a =>
        [
          ...a.ideas,
          ...a.evidenceAndExamples,
          ...a.objectionsAndQualifications
        ].flatMap(i => i.sourceUnitIds)
      )
    ),
    chapters = new Set(job.contentChapterIds),
    ids = [],
    selected = new Set();
  const clusters = Array.isArray(p.clusters) ? p.clusters : [];
  if (!clusters.length) e.push('clusters must be a non-empty list');
  for (const c of clusters) {
    if (!exact(c, C.CLUSTER_KEYS)) {
      e.push('cluster schema is invalid');
      continue;
    }
    const id = String(c.id);
    ids.push(id);
    if (!/^cluster-\d{3,}$/.test(id)) e.push(`invalid cluster ID ${id}`);
    if (!text(c.label) || !text(c.synthesis))
      e.push(`cluster ${id} has empty text`);
    let ok = true;
    for (const k of ['centrality', 'recurrence', 'originality', 'score'])
      if (!score(c[k])) {
        e.push(`cluster ${id} has invalid ${k}`);
        ok = false;
      }
    if (
      ok &&
      Math.abs(
        c.score -
          (0.5 * c.centrality + 0.25 * c.recurrence + 0.25 * c.originality)
      ) > 0.011
    )
      e.push(`cluster ${id} has an incorrect weighted score`);
    if (typeof c.selected !== 'boolean')
      e.push(`cluster ${id} selected must be boolean`);
    else if (c.selected) selected.add(id);
    for (const [k, set, label] of [
      ['chapterIds', chapters, 'chapters'],
      ['sourceUnitIds', units, 'source units'],
      ['ideaIds', ideas, 'idea IDs']
    ])
      if (!subset(c[k], set, true))
        e.push(`cluster ${id} has invalid ${label}`);
  }
  if (!unique(ids)) e.push('cluster IDs are duplicated');
  const outline = Array.isArray(p.outline) ? p.outline : [];
  if (!outline.length) e.push('outline must be a non-empty list');
  const outlineIds = [],
    used = new Set();
  for (const s of outline) {
    if (!exact(s, C.OUTLINE_KEYS)) {
      e.push('outline section schema is invalid');
      continue;
    }
    outlineIds.push(String(s.id));
    if (!text(s.title) || !text(s.purpose))
      e.push(`outline section ${s.id} has empty text`);
    if (!Number.isInteger(s.budgetWords) || s.budgetWords <= 0)
      e.push(`outline section ${s.id} has invalid budget`);
    if (!subset(s.clusterIds, selected, true))
      e.push(`outline section ${s.id} must use selected clusters`);
    if (Array.isArray(s.clusterIds)) s.clusterIds.forEach(id => used.add(id));
  }
  if (!unique(outlineIds)) e.push('outline section IDs are duplicated');
  if (used.size !== selected.size || [...used].some(id => !selected.has(id)))
    e.push('selected clusters and outline coverage differ');
  if (
    !Array.isArray(p.chapterCoverage) ||
    p.chapterCoverage.some(i => !exact(i, C.COVERAGE_KEYS))
  )
    e.push('chapterCoverage schema is invalid');
  else {
    const coverage = p.chapterCoverage.map(i => i.chapterId);
    if (
      !unique(coverage) ||
      coverage.length !== chapters.size ||
      !subset(coverage, chapters)
    )
      e.push('chapterCoverage must contain every content chapter exactly once');
    if (p.chapterCoverage.some(i => !subset(i.clusterIds, new Set(ids))))
      e.push('chapterCoverage contains invalid cluster IDs');
  }
  if (!audit(p.audit, C.SYNTHESIS_AUDIT_KEYS))
    e.push('synthesis audit is incomplete');
  return e;
}
export const draftText = p =>
  [
    p.title,
    p.dek,
    ...p.sections.flatMap(s => [s.heading, ...s.paragraphs.map(p => p.text)]),
    ...p.conclusion.map(p => p.text)
  ].join('\n');
export function validateDraft(p, job, synthesis) {
  const e = [];
  if (!exact(p, C.DRAFT_KEYS)) return ['draft root schema is invalid'];
  if (!text(p.title) || !text(p.dek))
    e.push('draft title and dek must be non-empty strings');
  const selected = new Set(
      synthesis.clusters.filter(c => c.selected).map(c => c.id)
    ),
    allUnits = new Set(synthesis.clusters.flatMap(c => c.sourceUnitIds));
  function paragraph(p) {
    if (!exact(p, C.PARAGRAPH_KEYS)) {
      e.push('paragraph schema is invalid');
      return;
    }
    if (!text(p.text)) e.push('paragraph text is empty');
    if (!subset(p.clusterIds, selected, true))
      e.push('paragraph contains invalid cluster IDs');
    if (!subset(p.sourceUnitIds, allUnits, true))
      e.push('paragraph contains invalid source unit IDs');
    else {
      const supported = new Set(
        synthesis.clusters
          .filter(c => p.clusterIds?.includes(c.id))
          .flatMap(c => c.sourceUnitIds)
      );
      if (!subset(p.sourceUnitIds, supported))
        e.push('paragraph source units are not supported by its clusters');
    }
    if (!audit(p.audit, C.PARAGRAPH_AUDIT_KEYS))
      e.push('paragraph audit is incomplete');
  }
  let sections = p.sections;
  if (
    !Array.isArray(sections) ||
    sections.some(s => !exact(s, C.SECTION_KEYS))
  ) {
    e.push('draft section schema is invalid');
    sections = [];
  }
  if (
    JSON.stringify(sections.map(s => s.id)) !==
    JSON.stringify(synthesis.outline.map(s => s.id))
  )
    e.push('draft sections must match synthesis outline order');
  for (const s of sections) {
    if (!text(s.heading)) e.push(`section ${s.id} has an empty heading`);
    if (!Array.isArray(s.paragraphs) || !s.paragraphs.length) {
      e.push(`section ${s.id} has no paragraphs`);
      continue;
    }
    const allowed = new Set(
      synthesis.outline.find(o => o.id === s.id)?.clusterIds ?? []
    );
    for (const p of s.paragraphs) {
      paragraph(p);
      if (p && Array.isArray(p.clusterIds) && !subset(p.clusterIds, allowed))
        e.push(`section ${s.id} uses a cluster outside its outline`);
    }
  }
  if (!Array.isArray(p.conclusion) || !p.conclusion.length)
    e.push('draft conclusion must contain paragraphs');
  else p.conclusion.forEach(paragraph);
  if (!audit(p.audit, C.DRAFT_AUDIT_KEYS)) e.push('draft audit is incomplete');
  if (!e.some(v => v.includes('schema'))) {
    try {
      const n = wordCount(draftText(p));
      if (n && (n < job.minimumWords || n > job.maximumWords))
        e.push(
          `draft word count ${n} is outside ${job.minimumWords}..${job.maximumWords}`
        );
    } catch {
      e.push('draft is unreadable');
    }
  }
  return e;
}
export async function jobStatus(input) {
  const dir = resolve(input);
  if (!(await exists(path.join(dir, 'job.json'))))
    throw Error(`Summary job does not exist: ${dir}`);
  const job = await readJson(path.join(dir, 'job.json')),
    { analyses, incomplete } = await loadAnalyses(dir, job, false);
  let status = 'chapter_analysis',
    synthesisErrors = null,
    draftErrors = null;
  if (!incomplete.length) {
    status = 'synthesis_required';
    if (await exists(path.join(dir, 'synthesis.json'))) {
      let synthesis;
      try {
        synthesis = await readJson(path.join(dir, 'synthesis.json'));
        synthesisErrors = validateSynthesis(synthesis, job, analyses);
      } catch {
        synthesisErrors = ['synthesis is unreadable'];
      }
      if (!synthesisErrors.length) {
        status = 'draft_required';
        if (await exists(path.join(dir, 'draft.json'))) {
          try {
            draftErrors = validateDraft(
              await readJson(path.join(dir, 'draft.json')),
              job,
              synthesis
            );
          } catch {
            draftErrors = ['draft is unreadable'];
          }
          if (!draftErrors.length) status = 'ready_to_build';
        }
      }
    }
  }
  return {
    status,
    job: dir,
    source: job.source,
    output: job.output,
    language: job.language,
    minutes: job.minutes,
    targetWords: job.targetWords,
    wordRange: [job.minimumWords, job.maximumWords],
    contentChapters: job.contentChapterIds.length,
    batches: job.batches.length,
    completedAnalyses: analyses.length,
    remainingAnalyses: incomplete.length,
    readyAnalyses: incomplete,
    recommendedParallelAnalyses: Math.min(
      job.parallelAnalyses,
      incomplete.length
    ),
    synthesisErrors,
    draftErrors
  };
}
export async function buildJob(input, { overwrite = false } = {}) {
  const dir = resolve(input),
    job = await readJson(path.join(dir, 'job.json'));
  if ((await fileSha256(job.source)) !== job.sourceSha256)
    throw Error('Source HTML changed after the summary job was prepared.');
  const { analyses } = await loadAnalyses(dir, job),
    synthesis = await readJson(path.join(dir, 'synthesis.json')),
    se = validateSynthesis(synthesis, job, analyses);
  if (se.length)
    throw Error(`Synthesis validation failed: ${JSON.stringify(se)}`);
  const draft = await readJson(path.join(dir, 'draft.json')),
    de = validateDraft(draft, job, synthesis);
  if (de.length) throw Error(`Draft validation failed: ${JSON.stringify(de)}`);
  const batches = await Promise.all(
      job.batches.map(n => readJson(path.join(dir, 'batches', n)))
    ),
    facts = factTokens(
      batches.flatMap(b => b.units.map(u => u.text)).join('\n')
    ),
    unsupported = [...factTokens(draftText(draft))]
      .filter(t => !facts.has(t))
      .sort();
  if (unsupported.length)
    throw Error(
      `Draft contains unsupported factual tokens: ${JSON.stringify(
        unsupported
      )}`
    );
  const { renderSummary } = await import('./render.mjs'),
    candidate = path.join(dir, 'candidate.html');
  await fs.writeFile(
    candidate,
    renderSummary(
      job,
      (await readJson(path.join(dir, 'chapters.json'))).chapters,
      synthesis,
      draft
    )
  );
  const { validateSummary } = await import('./validation.mjs');
  const report = await validateSummary(
    path.join(dir, 'source-original.html'),
    candidate,
    { intendedSource: job.source, expectedLanguage: job.language }
  );
  await writeJson(path.join(dir, 'report.json'), report);
  if (report.status === 'failed')
    throw Error(
      `Summary validation failed; candidate retained at ${candidate}. Findings: ${JSON.stringify(
        report.findings
      )}`
    );
  if (
    (await exists(job.output)) &&
    (!overwrite ||
      meta(
        parse(await fs.readFile(job.output, 'utf8')),
        'summary-generator'
      ) !== 'comprehensivesummary-skill')
  )
    throw Error(
      `Refusing to replace ${job.output}; use --overwrite only for skill-owned output.`
    );
  await fs.mkdir(path.dirname(job.output), { recursive: true });
  const stage = path.join(
    path.dirname(job.output),
    `.${path.basename(job.output)}.comprehensivesummary-stage`
  );
  await fs.writeFile(stage, await fs.readFile(candidate));
  await fs.rename(stage, job.output);
  return {
    status: report.status,
    artifact: job.output,
    job: dir,
    report: path.join(dir, 'report.json'),
    findings: report.findings,
    metrics: report.metrics
  };
}
