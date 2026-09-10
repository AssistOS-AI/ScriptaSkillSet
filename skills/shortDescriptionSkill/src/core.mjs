import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { parse, elements, first, named, has, meta, compact, textOf, remove, escape } from './dom.mjs';

export class ShortDescriptionError extends Error {}
const fail = message => { throw new ShortDescriptionError(message); };
const semanticTags = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'blockquote', 'figcaption', 'caption', 'th', 'td']);
const themeTypes = new Set(['subject', 'scope', 'context', 'question', 'tension', 'premise', 'setting', 'character', 'starting-conflict']);
const revelationTypes = new Set(['answer', 'solution', 'conclusion', 'recommendation', 'verdict', 'twist', 'identity', 'resolution', 'outcome', 'fate', 'ending']);
const nonContent = /\b(contents?|cuprins|sommaire|indice|inhaltsverzeichnis|bibliograph(?:y|ie)|bibliograf(?:ie|ia)|references?|referințe|copyright|drepturi de autor|impressum)\b/iu;
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const fileSha256 = async file => sha256(await fs.readFile(file));
export const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));
export async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}
export const exists = async file => { try { await fs.access(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } };
async function resolve(file) {
  const absolute = path.resolve(file.startsWith('~/') ? path.join(os.homedir(), file.slice(2)) : file);
  try { return await fs.realpath(absolute); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return path.join(await resolve(path.dirname(absolute)), path.basename(absolute));
  }
}
const exact = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');
const text = value => typeof value === 'string' && Boolean(value.trim());
const strings = (value, nonempty = false) => Array.isArray(value) && (!nonempty || value.length > 0) && value.every(item => typeof item === 'string');
const unique = value => new Set(value).size === value.length;
const subset = (items, allowed) => items.every(item => allowed.has(item));
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const auditValid = (value, keys) => exact(value, [...keys, 'notes']) && keys.every(key => value[key] === true) && typeof value.notes === 'string';
const numbered = (prefix, index, width) => `${prefix}${String(index).padStart(width, '0')}`;
export const wordCount = value => (value.match(/(?<![\p{L}\p{N}_])[\p{L}\p{N}]+(?:[’'\-][\p{L}\p{N}]+)*(?![\p{L}\p{N}_])/gu) ?? []).length;
export const splitSentences = value => (value.trim().match(/.+?[.!?]+(?:["”’')\]]+)?(?=\s|$)/gsu) ?? []).map(item => item.trim()).filter(Boolean);
export function normalizeLanguage(value) {
  const candidate = typeof value === 'string' ? value.trim().replaceAll('_', '-') : '';
  if (!/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(candidate) || candidate.toLowerCase() === 'und') fail('Source HTML needs a valid language tag or --language override.');
  return candidate.split('-').map((part, i) => i === 0 ? part.toLowerCase() : /^[A-Za-z]{4}$/.test(part) ? part[0].toUpperCase() + part.slice(1).toLowerCase() : /^(?:[A-Za-z]{2}|[0-9]{3})$/.test(part) ? part.toUpperCase() : part.toLowerCase()).join('-');
}
export const factTokens = value => new Set((value.match(/https?:\/\/\S+|www\.\S+|\b[\w.+-]+@[\w.-]+\.\w+\b|\b10\.\d{4,9}\/\S+|\b\d+(?:[.,]\d+)*(?:%|‰|°|[A-Za-z]{1,5})?\b/gu) ?? []).map(item => item.replace(/[.,;:!?)"\]}]+$/gu, '').toLowerCase()));
const normalized = value => (value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).join(' ');

export function extract(sourceText) {
  const soup = parse(sourceText);
  const kind = meta(soup, 'marketing-summary-generator') === 'marketingsummary-skill' ? 'marketing-summary' : meta(soup, 'summary-generator') === 'comprehensivesummary-skill' ? 'comprehensive-summary' : 'semantic-html';
  const root = kind === 'semantic-html' ? first(soup, node => ['main', 'article'].includes(node.name)) ?? named(soup, 'body') : first(soup, node => node.name === 'article' && has(node, kind === 'marketing-summary' ? 'data-marketing-summary' : 'data-summary-body'));
  if (!root) fail(`${kind} input has no usable semantic content container.`);
  const content = structuredClone(root);
  const clone = { type: 'root', children: [content] };
  content.parent = clone; content.prev = null; content.next = null;
  remove(clone, node => ['script', 'style', 'noscript', 'nav', 'svg', 'template'].includes(node.name) || (node.name === 'details' && has(node, 'data-source-map')) || has(node, 'hidden') || node.attribs['aria-hidden'] === 'true');
  const leaves = elements(clone, node => semanticTags.has(node.name) && !elements(node, child => semanticTags.has(child.name)).length && compact(textOf(node)));
  if (!leaves.length) fail('No semantic reader-facing text was found in the HTML input.');
  const boundary = leaves.filter(node => node.name === 'h1').length >= 2 ? 'h1' : leaves.filter(node => node.name === 'h2').length >= 2 ? 'h2' : null;
  const chapters = [], units = [];
  let current;
  for (const node of leaves) {
    const value = compact(textOf(node));
    if (!current || node.name === boundary) {
      current = { id: numbered('chapter-', chapters.length + 1, 4), title: node.name === boundary ? value : 'Front matter', content: true, unitIds: [] };
      chapters.push(current);
    }
    const unit = { id: numbered('u', units.length + 1, 6), chapterId: current.id, tag: node.name, text: value };
    units.push(unit);
    current.unitIds.push(unit.id);
  }
  for (const chapter of chapters) {
    const proseWords = units.filter(unit => unit.chapterId === chapter.id && !unit.tag.startsWith('h')).reduce((sum, unit) => sum + wordCount(unit.text), 0);
    if (nonContent.test(chapter.title) || proseWords < 8) chapter.content = false;
  }
  if (!chapters.some(chapter => chapter.content)) fail('The HTML contains no substantial content chapters.');
  return { kind, title: textOf(named(soup, 'title') ?? { children: [] }) || textOf(first(soup, node => ['h1', 'h2'].includes(node.name)) ?? { children: [] }) || 'Document', chapters, units };
}

export function makeBatches(chapters, units, language) {
  const unitMap = new Map(units.map(unit => [unit.id, unit])), batches = [];
  for (const chapter of chapters.filter(item => item.content)) {
    const parts = [[]];
    let size = 0;
    for (const id of chapter.unitIds) {
      const unit = unitMap.get(id), length = [...unit.text].length;
      if (parts.at(-1).length && size + length > 32000) { parts.push([]); size = 0; }
      parts.at(-1).push(unit); size += length;
    }
    parts.forEach((part, i) => batches.push({ batch: `${numbered('batch-', batches.length + 1, 4)}.json`, chapterId: chapter.id, chapterTitle: chapter.title, segment: i + 1, language, characterCount: part.reduce((sum, unit) => sum + [...unit.text].length, 0), units: part.map(({ id, tag, text }) => ({ id, tag, text })) }));
  }
  return batches;
}

export async function prepareJob(input, options = {}) {
  const source = await resolve(input);
  if (!['.html', '.htm'].includes(path.extname(source).toLowerCase())) fail('Input must be an .html or .htm document.');
  if (!await exists(source)) fail(`Input does not exist: ${source}`);
  const bytes = await fs.readFile(source);
  let sourceText;
  try { sourceText = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail('Input HTML must be UTF-8 encoded.'); }
  const soup = parse(sourceText), language = normalizeLanguage(options.language || named(soup, 'html')?.attribs.lang || '');
  const { kind, title, chapters, units } = extract(sourceText);
  const output = await resolve(options.output ?? path.join(path.dirname(source), 'shortDescription.html'));
  if (output === source) fail('Short-description output must be separate from the source.');
  const workspace = await resolve(options.jobDir ?? path.join(path.dirname(source), '.shortdescription-jobs', `${path.parse(source).name}-${sha256(bytes).slice(0, 16)}`));
  if (await exists(workspace) && (await fs.readdir(workspace)).length) fail(`Job directory already exists and is not empty: ${workspace}`);
  await fs.mkdir(path.join(workspace, 'batches'), { recursive: true });
  await fs.mkdir(path.join(workspace, 'analyses'), { recursive: true });
  await fs.writeFile(path.join(workspace, 'source-original.html'), bytes);
  const batches = makeBatches(chapters, units, language);
  for (const batch of batches) await writeJson(path.join(workspace, 'batches', batch.batch), batch);
  await writeJson(path.join(workspace, 'job.json'), { source, output, sourceSha256: sha256(bytes), sourceKind: kind, sourceTitle: title, language, contentChapterIds: chapters.filter(chapter => chapter.content).map(chapter => chapter.id), batchNames: batches.map(batch => batch.batch) });
  await writeJson(path.join(workspace, 'context.json'), { sourceTitle: title, language, sourceKind: kind, audience: 'general reader', tone: 'neutral, informative, compact', sentenceRange: [4, 6], allowed: ['subject', 'scope', 'context', 'central questions', 'thematic tensions', 'premise', 'setting', 'starting conflict'], withhold: ['answers', 'solutions', 'conclusions', 'recommendations', 'verdicts', 'twists', 'identities', 'resolutions', 'outcomes', 'fates', 'ending'] });
  await writeJson(path.join(workspace, 'chapters.json'), chapters);
  return jobStatus(workspace);
}

export function validateAnalysis(value, batch) {
  const errors = [];
  if (!exact(value, ['batch', 'chapterId', 'segment', 'modeSignals', 'themes', 'protectedRevelations', 'audit'])) return ['analysis has incorrect top-level keys'];
  if (value.batch !== batch.batch || value.chapterId !== batch.chapterId || value.segment !== batch.segment) errors.push('analysis batch identity does not match');
  if (!strings(value.modeSignals, true) || !unique(value.modeSignals) || !subset(value.modeSignals, new Set(['fiction', 'nonfiction']))) errors.push('modeSignals must contain unique fiction/nonfiction values');
  const unitIds = new Set(batch.units.map(unit => unit.id));
  const themes = Array.isArray(value.themes) ? value.themes : [];
  if (!themes.length) errors.push('analysis needs at least one theme');
  for (const [i, item] of themes.entries()) {
    if (!exact(item, ['id', 'type', 'statement', 'sourceUnitIds'])) { errors.push('theme has incorrect keys'); continue; }
    if (item.id !== numbered(`${batch.batch.slice(0, -5)}-theme-`, i + 1, 3)) errors.push('theme IDs must be sequential and unique');
    if (!themeTypes.has(item.type) || !text(item.statement)) errors.push('theme type or statement is invalid');
    if (!strings(item.sourceUnitIds, true) || !subset(item.sourceUnitIds, unitIds)) errors.push('theme source units do not belong to the batch');
  }
  const revelations = Array.isArray(value.protectedRevelations) ? value.protectedRevelations : [];
  if (!Array.isArray(value.protectedRevelations)) errors.push('protectedRevelations must be a list');
  for (const [i, item] of revelations.entries()) {
    if (!exact(item, ['id', 'type', 'statement', 'guardTerms', 'sourceUnitIds'])) { errors.push('protected revelation has incorrect keys'); continue; }
    if (item.id !== numbered(`${batch.batch.slice(0, -5)}-revelation-`, i + 1, 3)) errors.push('protected revelation IDs must be sequential and unique');
    if (!revelationTypes.has(item.type) || !text(item.statement)) errors.push('protected revelation type or statement is invalid');
    if (!strings(item.guardTerms, true) || item.guardTerms.some(term => wordCount(term) < 3)) errors.push('protected revelation needs guard phrases of at least three words');
    if (!strings(item.sourceUnitIds, true) || !subset(item.sourceUnitIds, unitIds)) errors.push('protected revelation source units do not belong to the batch');
  }
  if (!auditValid(value.audit, ['chapterCovered', 'themeIdentified', 'revelationsSeparated', 'factsPreserved'])) errors.push('analysis audit is incomplete');
  return errors;
}

async function loadAnalyses(workspace, job) {
  const complete = [], ready = [];
  for (const name of job.batchNames) {
    const batchPath = path.join(workspace, 'batches', name), analysisPath = path.join(workspace, 'analyses', name);
    const batch = await readJson(batchPath);
    if (!await exists(analysisPath)) { ready.push({ batch: batchPath, analysis: analysisPath, errors: [] }); continue; }
    let analysis, errors;
    try { analysis = await readJson(analysisPath); errors = validateAnalysis(analysis, batch); } catch (error) { errors = [error.message]; }
    if (errors.length) ready.push({ batch: batchPath, analysis: analysisPath, errors }); else complete.push(analysis);
  }
  return { complete, ready };
}
function maps(analyses) {
  const themes = new Map(), revelations = new Map(), chapters = new Map();
  for (const analysis of analyses) {
    for (const item of analysis.themes) { themes.set(item.id, item); chapters.set(item.id, analysis.chapterId); }
    for (const item of analysis.protectedRevelations) revelations.set(item.id, item);
  }
  return { themes, revelations, chapters };
}
export const draftText = draft => draft.sentences.map(item => item.text.trim()).join(' ');
export function validateDraft(value, job, analyses) {
  const errors = [];
  if (!exact(value, ['mode', 'sentences', 'protectedRevelationIds', 'chapterCoverage', 'audit'])) return ['draft has incorrect top-level keys'];
  const modes = new Set(analyses.flatMap(analysis => analysis.modeSignals)), expectedMode = modes.size === 2 ? 'hybrid' : [...modes][0];
  if (value.mode !== expectedMode) errors.push(`draft mode must be ${expectedMode}`);
  const { themes, revelations, chapters } = maps(analyses), protectedIds = value.protectedRevelationIds;
  if (!strings(protectedIds) || !unique(protectedIds) || !equal([...protectedIds].sort(), [...revelations.keys()].sort())) errors.push('draft must register every protected revelation exactly once');
  const sentences = Array.isArray(value.sentences) ? value.sentences : [];
  if (sentences.length < 4 || sentences.length > 6) errors.push('draft needs 4 to 6 sentences');
  for (const [i, item] of sentences.entries()) {
    if (!exact(item, ['index', 'text', 'themeIds', 'sourceUnitIds'])) { errors.push('draft sentence has incorrect keys'); continue; }
    if (item.index !== i + 1 || !text(item.text) || splitSentences(item.text).length !== 1) errors.push('each draft item must be one numbered grammatical sentence');
    if (!strings(item.themeIds, true) || !item.themeIds.every(id => themes.has(id))) { errors.push('draft sentence references invalid themes'); continue; }
    const allowed = new Set(item.themeIds.flatMap(id => themes.get(id).sourceUnitIds));
    if (!strings(item.sourceUnitIds, true) || !subset(item.sourceUnitIds, allowed)) errors.push('draft sentence source units are unsupported');
  }
  const coverage = Array.isArray(value.chapterCoverage) ? value.chapterCoverage : [];
  if (!equal(coverage.filter(item => item && typeof item === 'object').map(item => item.chapterId), job.contentChapterIds)) errors.push('chapterCoverage must list every content chapter once and in order');
  for (const item of coverage) {
    if (!exact(item, ['chapterId', 'themeIds']) || !strings(item.themeIds)) { errors.push('chapter coverage item is invalid'); continue; }
    if (item.themeIds.some(id => !themes.has(id) || chapters.get(id) !== item.chapterId)) errors.push('chapter coverage references a theme from another chapter');
  }
  if (!auditValid(value.audit, ['sameLanguage', 'themeOnly', 'noSolutions', 'noSpoilers', 'neutralTone'])) errors.push('draft audit is incomplete');
  return errors;
}
export async function validateReview(value, draftPath, draft, revelationIds) {
  const errors = [];
  if (!exact(value, ['draftSha256', 'sentences', 'passed', 'solutionsWithheld', 'conclusionsWithheld', 'spoilersWithheld', 'notes'])) return ['review has incorrect top-level keys'];
  if (value.draftSha256 !== await fileSha256(draftPath)) errors.push('review is stale because draft.json changed');
  const reviews = Array.isArray(value.sentences) ? value.sentences : [];
  if (!equal(reviews.filter(item => item && typeof item === 'object').map(item => item.index), draft.sentences.map((_, i) => i + 1))) errors.push('review must cover every sentence exactly once and in order');
  let risk = false;
  for (const item of reviews) {
    if (!exact(item, ['index', 'solutionRisk', 'spoilerRisk', 'matchedRevelationIds', 'notes'])) { errors.push('review sentence has incorrect keys'); continue; }
    if (typeof item.solutionRisk !== 'boolean' || typeof item.spoilerRisk !== 'boolean' || !strings(item.matchedRevelationIds) || !subset(item.matchedRevelationIds, revelationIds) || typeof item.notes !== 'string') errors.push('review sentence values are invalid');
    if (item.solutionRisk || item.spoilerRisk || item.matchedRevelationIds?.length) risk = true;
  }
  if (risk || ['passed', 'solutionsWithheld', 'conclusionsWithheld', 'spoilersWithheld'].some(key => value[key] !== true)) errors.push('semantic revelation review did not pass');
  if (typeof value.notes !== 'string') errors.push('review notes must be text');
  return errors;
}

export async function jobStatus(directory) {
  const workspace = await resolve(directory);
  if (!await exists(path.join(workspace, 'job.json'))) fail(`Short-description job does not exist: ${workspace}`);
  const job = await readJson(path.join(workspace, 'job.json')), { complete: analyses, ready } = await loadAnalyses(workspace, job);
  const base = { job: workspace, source: job.source, output: job.output, language: job.language, sourceKind: job.sourceKind, contentChapters: job.contentChapterIds.length, batches: job.batchNames.length, completedAnalyses: analyses.length, remainingAnalyses: ready.length, readyAnalyses: ready.slice(0, 4), recommendedParallelAnalyses: Math.min(4, ready.length) };
  if (ready.length) return { status: 'analysis_required', ...base };
  const draftPath = path.join(workspace, 'draft.json');
  if (!await exists(draftPath)) return { status: 'draft_required', ...base, draftErrors: null };
  let draft, draftErrors;
  try { draft = await readJson(draftPath); draftErrors = validateDraft(draft, job, analyses); } catch (error) { draftErrors = [error.message]; }
  if (draftErrors.length) return { status: 'draft_required', ...base, draftErrors };
  const reviewPath = path.join(workspace, 'review.json');
  if (!await exists(reviewPath)) return { status: 'review_required', ...base, draftErrors: [], reviewErrors: null };
  let reviewErrors;
  try { reviewErrors = await validateReview(await readJson(reviewPath), draftPath, draft, new Set(maps(analyses).revelations.keys())); } catch (error) { reviewErrors = [error.message]; }
  if (reviewErrors.length) return { status: reviewErrors.includes('semantic revelation review did not pass') ? 'revision_required' : 'review_required', ...base, draftErrors: [], reviewErrors };
  return { status: 'ready_to_build', ...base, draftErrors: [], reviewErrors: [] };
}

// Ratcliff/Obershelp matching, including Python SequenceMatcher's popular-character rule.
export function similarity(left, right) {
  const a = [...left], b = [...right], positions = new Map();
  b.forEach((char, i) => { if (!positions.has(char)) positions.set(char, []); positions.get(char).push(i); });
  if (b.length >= 200) for (const [char, indices] of positions) if (indices.length > Math.floor(b.length / 100) + 1) positions.delete(char);
  const pending = [[0, a.length, 0, b.length]];
  let matched = 0;
  while (pending.length) {
    const [alo, ahi, blo, bhi] = pending.pop();
    let bestI = alo, bestJ = blo, size = 0, previous = new Map();
    for (let i = alo; i < ahi; i++) {
      const current = new Map();
      for (const j of positions.get(a[i]) ?? []) {
        if (j < blo) continue;
        if (j >= bhi) break;
        const k = (previous.get(j - 1) ?? 0) + 1;
        current.set(j, k);
        if (k > size) { bestI = i - k + 1; bestJ = j - k + 1; size = k; }
      }
      previous = current;
    }
    while (bestI > alo && bestJ > blo && a[bestI - 1] === b[bestJ - 1]) { bestI--; bestJ--; size++; }
    while (bestI + size < ahi && bestJ + size < bhi && a[bestI + size] === b[bestJ + size]) size++;
    if (size) {
      matched += size;
      if (alo < bestI && blo < bestJ) pending.push([alo, bestI, blo, bestJ]);
      if (bestI + size < ahi && bestJ + size < bhi) pending.push([bestI + size, ahi, bestJ + size, bhi]);
    }
  }
  return a.length + b.length ? 2 * matched / (a.length + b.length) : 1;
}
export function guardLeaks(value, analyses) {
  const content = normalized(value), leaks = new Set();
  for (const analysis of analyses) for (const revelation of analysis.protectedRevelations) {
    const statement = normalized(revelation.statement);
    if (revelation.guardTerms.map(normalized).some(guard => guard && content.includes(guard)) || (statement.split(' ').length >= 10 && similarity(statement, content) >= 0.72)) leaks.add(revelation.id);
  }
  return [...leaks].sort();
}

export function render(job, draft) {
  return `<!doctype html>
<html lang="${escape(job.language)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="short-description-generator" content="shortdescription-skill">
<meta name="short-description-source-sha256" content="${job.sourceSha256}">
<title>${escape(`Short description — ${job.sourceTitle}`)}</title>
<style>html{color-scheme:light dark}body{margin:0;background:#f5f3ee;color:#24211d;font:1.08rem/1.7 Georgia,serif}main{width:min(760px,calc(100% - 2rem));margin:clamp(2rem,8vw,6rem) auto}article{background:#fffdf8;padding:clamp(1.5rem,6vw,4rem);box-shadow:0 12px 40px #33251b18}p{margin:0}@media(prefers-color-scheme:dark){body{background:#181614;color:#eee8df}article{background:#24211d}}@media(max-width:600px){main{width:100%;margin:0}article{box-shadow:none}}</style>
</head>
<body><main><article data-short-description><p>${escape(draftText(draft))}</p></article></main></body>
</html>
`;
}

export async function buildJob(directory, { overwrite = false } = {}) {
  const workspace = await resolve(directory), status = await jobStatus(workspace);
  if (status.status !== 'ready_to_build') fail(`Job is not ready to build: ${status.status}`);
  const job = await readJson(path.join(workspace, 'job.json'));
  if (await fileSha256(job.source) !== job.sourceSha256) fail('Source HTML changed after the job was prepared.');
  const { complete: analyses } = await loadAnalyses(workspace, job), draft = await readJson(path.join(workspace, 'draft.json'));
  const description = draftText(draft), leaks = guardLeaks(description, analyses);
  if (leaks.length) fail(`Draft contains protected revelation guard phrases: ${leaks.join(', ')}`);
  const sourceFacts = factTokens(textOf(parse(await fs.readFile(job.source, 'utf8'))));
  const unsupported = [...factTokens(description)].filter(item => !sourceFacts.has(item)).sort();
  if (unsupported.length) fail(`Draft contains unsupported factual tokens: ${JSON.stringify(unsupported)}`);
  if (await exists(job.output) && (!overwrite || meta(parse(await fs.readFile(job.output, 'utf8')), 'short-description-generator') !== 'shortdescription-skill')) fail('Output exists; --overwrite is allowed only for skill-owned output.');
  const candidate = path.join(workspace, 'candidate.html');
  await fs.writeFile(candidate, render(job, draft));
  const { validateShortDescription } = await import('./validation.mjs');
  const report = await validateShortDescription(job.source, candidate, { expectedLanguage: job.language });
  if (report.status !== 'passed') fail(`Candidate validation failed: ${report.findings.map(item => item.message).join('; ')}`);
  await fs.mkdir(path.dirname(job.output), { recursive: true });
  const stage = path.join(path.dirname(job.output), `.${path.basename(job.output)}.${randomUUID()}.shortdescription-stage`);
  try { await fs.copyFile(candidate, stage); await fs.rename(stage, job.output); } finally { await fs.rm(stage, { force: true }); }
  const result = { status: 'passed', artifact: job.output, source: job.source, findings: [], metrics: report.metrics, jobRemoved: true };
  await fs.rm(workspace, { recursive: true });
  const parent = path.dirname(workspace);
  if (path.basename(parent) === '.shortdescription-jobs' && !(await fs.readdir(parent)).length) await fs.rmdir(parent);
  return result;
}
