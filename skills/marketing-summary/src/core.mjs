import { canonicalTag } from './language.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { parse, elements, first, named, has, meta, compact, textOf, remove, escape } from './dom.mjs';

export class MarketingSummaryError extends Error {}
const fail = message => { throw new MarketingSummaryError(message); };
const semanticTags = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'blockquote', 'figcaption', 'caption', 'th', 'td']);
const themeTypes = new Set(['premise', 'question', 'stakes', 'approach', 'atmosphere', 'starting-conflict', 'reader-fit']);
const revelationTypes = new Set(['answer', 'conclusion', 'solution', 'recommendation', 'twist', 'resolution', 'outcome']);
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
  if (!text(value)) fail('Source HTML needs a valid language or --language override.');
  let tag;
  try { tag = canonicalTag(value.trim()); } catch { fail(`Invalid language tag: ${value}`); }
  if (tag.toLowerCase() === 'und') fail('Source language is undetermined; use --language.');
  return tag;
}
export const factTokens = value => new Set((value.match(/https?:\/\/\S+|www\.\S+|\b[\w.+-]+@[\w.-]+\.\w+\b|\b10\.\d{4,9}\/\S+|\b\d+(?:[.,]\d+)*(?:%|‰|°|[A-Za-z]{1,5})?\b/gu) ?? []).map(item => item.replace(/[.,;:!?)"\]}]+$/gu, '').toLowerCase()));
const normalized = value => (value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).join(' ');

export function extract(sourceText) {
  const soup = parse(sourceText);
  const kind = meta(soup, 'summary-generator') === 'comprehensivesummary-skill' ? 'comprehensive-summary' : 'semantic-html';
  const root = kind === 'semantic-html' ? named(soup, 'body') ?? soup : first(soup, node => node.name === 'article' && has(node, 'data-summary-body'));
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
  const excluded = chapters.filter(chapter => !chapter.content).map(chapter => ({ chapterId: chapter.id, title: chapter.title, reason: nonContent.test(chapter.title) ? 'recognized non-content section' : 'insufficient prose' }));
  for (const chapter of chapters) { const unit = units.find(unit => unit.chapterId === chapter.id); chapter.title = ['h1', 'h2'].includes(unit.tag) ? unit.text : 'Front matter'; }
  return { excluded, kind, title: textOf(named(soup, 'title') ?? { children: [] }) || textOf(first(soup, node => ['h1', 'h2'].includes(node.name)) ?? { children: [] }) || 'Document', chapters, units };
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

export function validateAnalysis(value, batch) {
  const errors = [];
  if (!exact(value, ['batch', 'chapterId', 'segment', 'modeSignals', 'safeHooks', 'protectedRevelations', 'audit'])) return ['analysis has incorrect top-level keys'];
  if (value.batch !== batch.batch || value.chapterId !== batch.chapterId || value.segment !== batch.segment) errors.push('analysis batch identity does not match');
  if (!strings(value.modeSignals, true) || !unique(value.modeSignals) || !subset(value.modeSignals, new Set(['fiction', 'nonfiction']))) errors.push('modeSignals must contain unique fiction/nonfiction values');
  const unitIds = new Set(batch.units.map(unit => unit.id));
  const safeHooks = Array.isArray(value.safeHooks) ? value.safeHooks : [];
  if (!safeHooks.length) errors.push('analysis needs at least one safe hook');
  for (const [i, item] of safeHooks.entries()) {
    if (!exact(item, ['id', 'type', 'statement', 'sourceUnitIds'])) { errors.push('safe hook has incorrect keys'); continue; }
    if (item.id !== numbered(`${batch.batch.slice(0, -5)}-hook-`, i + 1, 3)) errors.push('safe hook IDs must be sequential and unique');
    if (!themeTypes.has(item.type) || !text(item.statement)) errors.push('safe hook type or statement is invalid');
    if (!strings(item.sourceUnitIds, true) || !subset(item.sourceUnitIds, unitIds)) errors.push('safe hook source units do not belong to the batch');
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
  if (!auditValid(value.audit, ['chapterCovered', 'questionsIdentified', 'revelationsSeparated', 'factsPreserved'])) errors.push('analysis audit is incomplete');
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
  const safeHooks = new Map(), revelations = new Map(), chapters = new Map();
  for (const analysis of analyses) {
    for (const item of analysis.safeHooks) { safeHooks.set(item.id, item); chapters.set(item.id, analysis.chapterId); }
    for (const item of analysis.protectedRevelations) revelations.set(item.id, item);
  }
  return { safeHooks, revelations, chapters };
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


export const budget = words => words <= 5000 ? [275, 250, 300] : words <= 20000 ? [425, 375, 475] : [600, 550, 650];
export async function prepareJob(input, options = {}) {
  const source = await resolve(input);
  if (!['.html', '.htm'].includes(path.extname(source).toLowerCase())) fail('Input must be an .html or .htm document.');
  if (!await exists(source)) fail(`Input does not exist: ${source}`);
  const bytes = await fs.readFile(source);
  let sourceText;
  try { sourceText = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail('Input HTML must be UTF-8 encoded.'); }
  const soup = parse(sourceText), language = normalizeLanguage(options.language || named(soup, 'html')?.attribs.lang || '');
  const { kind, title, chapters, units, excluded } = extract(sourceText);
  const contentChapterIds = chapters.filter(chapter => chapter.content).map(chapter => chapter.id);
  const sourceWords = units.filter(unit => contentChapterIds.includes(unit.chapterId)).reduce((sum, unit) => sum + wordCount(unit.text), 0);
  const [targetWords, minimumWords, maximumWords] = budget(sourceWords);
  const output = await resolve(options.output ?? path.join(path.dirname(source), `${path.parse(source).name}.marketing.html`));
  if (output === source) fail('Marketing output must be separate from the source.');
  const workspace = await resolve(options.jobDir ?? path.join(path.dirname(source), '.marketingsummary-jobs', `${path.parse(source).name}-${sha256(bytes).slice(0, 16)}`));
  if (await exists(workspace) && (await fs.readdir(workspace)).length) fail(`Job directory already exists and is not empty: ${workspace}`);
  for (const name of ['batches', 'analyses']) await fs.mkdir(path.join(workspace, name), { recursive: true });
  await fs.writeFile(path.join(workspace, 'source-original.html'), bytes);
  const batches = makeBatches(chapters, units, language);
  for (const batch of batches) await writeJson(path.join(workspace, 'batches', batch.batch), batch);
  const sourceTitle = title === 'Document' && !named(soup, 'title') && !first(soup, node => ['h1', 'h2'].includes(node.name)) ? path.parse(source).name : title;
  await writeJson(path.join(workspace, 'job.json'), { source, output, sourceSha256: sha256(bytes), sourceKind: kind, sourceTitle, language, sourceWords, targetWords, minimumWords, maximumWords, contentChapterIds, batchNames: batches.map(batch => batch.batch) });
  await writeJson(path.join(workspace, 'context.json'), { sourceTitle, language, sourceKind: kind, audience: 'general educated reader', tone: 'editorial, persuasive, restrained', outputShape: ['hero', 'stakes', 'questions', 'approach', 'reader-fit', 'open-loop'], spoilerPolicy: { nonfiction: 'withhold answers, conclusions, solutions, prescriptions, and final recommendations', fiction: 'withhold twists, revelations, relationship outcomes, character fates, and endings', hybrid: 'apply the stricter local rule' }, wordRange: [minimumWords, maximumWords], excluded });
  await writeJson(path.join(workspace, 'chapters.json'), chapters);
  return jobStatus(workspace);
}

export function validateSynthesis(value, job, analyses) {
  const errors = [];
  if (!exact(value, ['mode', 'positioning', 'selectedHooks', 'protectedRevelationIds', 'outline', 'chapterCoverage', 'audit'])) return ['synthesis has incorrect top-level keys'];
  const modes = new Set(analyses.flatMap(analysis => analysis.modeSignals)), expectedMode = modes.size === 2 ? 'hybrid' : [...modes][0];
  if (value.mode !== expectedMode) errors.push(`synthesis mode must be ${expectedMode}`);
  if (!exact(value.positioning, ['headlineAngle', 'readerPromise', 'audience', 'tone']) || !Object.values(value.positioning).every(text)) errors.push('positioning is incomplete');
  const { safeHooks: hooks, revelations } = maps(analyses), ids = value.protectedRevelationIds;
  if (!strings(ids) || !unique(ids) || !equal([...ids].sort(), [...revelations.keys()].sort())) errors.push('synthesis must register every protected revelation exactly once');
  const selected = Array.isArray(value.selectedHooks) ? value.selectedHooks : [], selectedMap = new Map();
  if (!selected.length) errors.push('synthesis needs selected hooks');
  for (const [i, item] of selected.entries()) {
    if (!exact(item, ['id', 'statement', 'hookIds', 'sourceUnitIds'])) { errors.push('selected hook has incorrect keys'); continue; }
    if (item.id !== numbered('selected-hook-', i + 1, 3) || selectedMap.has(item.id)) errors.push('selected hook IDs must be sequential and unique');
    selectedMap.set(item.id, item);
    if (!strings(item.hookIds, true) || !item.hookIds.every(id => hooks.has(id))) { errors.push('selected hook references invalid analysis hooks'); continue; }
    const allowed = new Set(item.hookIds.flatMap(id => hooks.get(id).sourceUnitIds));
    if (!strings(item.sourceUnitIds, true) || !subset(item.sourceUnitIds, allowed)) errors.push('selected hook source units are unsupported');
    if (!text(item.statement)) errors.push('selected hook statement is empty');
  }
  const outline = Array.isArray(value.outline) ? value.outline : [], outlined = [];
  if (!outline.length) errors.push('synthesis outline is empty');
  for (const [i, section] of outline.entries()) {
    if (!exact(section, ['id', 'role', 'title', 'budgetWords', 'selectedHookIds'])) { errors.push('outline section has incorrect keys'); continue; }
    if (section.id !== numbered('section-', i + 1, 2) || !['stakes', 'questions', 'approach', 'reader-fit', 'open-loop'].includes(section.role) || !text(section.title)) errors.push('outline identity, role, or title is invalid');
    if (!Number.isInteger(section.budgetWords) || section.budgetWords <= 0) errors.push('outline budget must be positive');
    if (!strings(section.selectedHookIds, true) || !section.selectedHookIds.every(id => selectedMap.has(id))) errors.push('outline references invalid selected hooks');
    if (Array.isArray(section.selectedHookIds)) outlined.push(...section.selectedHookIds);
  }
  if (!equal([...new Set(outlined)].sort(), [...selectedMap.keys()].sort())) errors.push('every selected hook must appear in the outline');
  if (!Array.isArray(value.chapterCoverage) || !equal(value.chapterCoverage.filter(item => item && typeof item === 'object').map(item => item.chapterId), job.contentChapterIds)) errors.push('chapterCoverage must list every content chapter once in source order');
  else if (value.chapterCoverage.some(item => !exact(item, ['chapterId', 'hookIds']) || !strings(item.hookIds) || !item.hookIds.every(id => hooks.has(id)))) errors.push('chapterCoverage contains invalid hooks');
  if (!auditValid(value.audit, ['allAnalysesUsed', 'spoilerBoundaryDefined', 'noAnswersSelected'])) errors.push('synthesis audit is incomplete');
  return errors;
}
export function draftText(draft) {
  return [draft.title, draft.dek, ...draft.sections.flatMap(section => [section.heading, ...section.paragraphs.map(paragraph => paragraph.text)]), draft.closing.text].join('\n');
}
const paragraphLocations = draft => ['hero:title', 'hero:dek', ...draft.sections.flatMap(section => section.paragraphs.map((_, i) => `${section.id}:${numbered('p', i + 1, 3)}`)), 'closing:p001'];
export function validateDraft(value, job, synthesis) {
  const errors = [];
  if (!exact(value, ['title', 'dek', 'sections', 'closing', 'audit'])) return ['draft has incorrect top-level keys'];
  if (!text(value.title) || !text(value.dek)) errors.push('draft title and dek are required');
  const selected = new Map(synthesis.selectedHooks.map(item => [item.id, item]));
  let sections = value.sections;
  if (!Array.isArray(sections) || sections.length !== synthesis.outline.length) { errors.push('draft sections must match the synthesis outline'); sections = []; }
  function checkParagraph(paragraph, allowed) {
    if (!exact(paragraph, ['text', 'selectedHookIds', 'sourceUnitIds', 'audit'])) { errors.push('draft paragraph has incorrect keys'); return; }
    if (!text(paragraph.text)) errors.push('draft paragraph text is empty');
    if (!strings(paragraph.selectedHookIds, true) || !subset(paragraph.selectedHookIds, allowed)) { errors.push('draft paragraph references hooks outside its section'); return; }
    const sources = new Set(paragraph.selectedHookIds.flatMap(id => selected.get(id).sourceUnitIds));
    if (!strings(paragraph.sourceUnitIds, true) || !subset(paragraph.sourceUnitIds, sources)) errors.push('draft paragraph source units are unsupported');
    const keys = ['factsPreserved', 'noUnsupportedPromise', 'noSpoiler'];
    if (!exact(paragraph.audit, keys) || !keys.every(key => paragraph.audit[key] === true)) errors.push('draft paragraph audit is incomplete');
  }
  for (const [i, section] of sections.entries()) {
    const planned = synthesis.outline[i];
    if (!exact(section, ['id', 'role', 'heading', 'paragraphs'])) { errors.push('draft section has incorrect keys'); continue; }
    if (section.id !== planned.id || section.role !== planned.role || !text(section.heading)) errors.push('draft section does not match the outline');
    if (!Array.isArray(section.paragraphs) || !section.paragraphs.length) { errors.push('draft section needs paragraphs'); continue; }
    for (const paragraph of section.paragraphs) checkParagraph(paragraph, new Set(planned.selectedHookIds));
  }
  if (!value.closing || typeof value.closing !== 'object' || Array.isArray(value.closing)) errors.push('draft closing is missing'); else checkParagraph(value.closing, new Set(selected.keys()));
  if (!auditValid(value.audit, ['sameLanguage', 'salesPageShape', 'subtleClosing'])) errors.push('draft audit is incomplete');
  if (!errors.length) { const count = wordCount(draftText(value)); if (count < job.minimumWords || count > job.maximumWords) errors.push(`draft word count ${count} is outside ${job.minimumWords}..${job.maximumWords}`); }
  return errors;
}
export async function validateReview(value, draftPath, draft, revelationIds) {
  const errors = [];
  if (!exact(value, ['draftSha256', 'paragraphs', 'passed', 'answersWithheld', 'twistsWithheld', 'openLoopsPreserved', 'notes'])) return ['review has incorrect top-level keys'];
  if (value.draftSha256 !== await fileSha256(draftPath)) errors.push('review is stale because draft.json changed');
  let reviews = value.paragraphs;
  if (!Array.isArray(reviews) || !equal(reviews.filter(item => item && typeof item === 'object').map(item => item.location), paragraphLocations(draft))) { errors.push('review must cover every visible draft item exactly once'); reviews = []; }
  let risk = false;
  for (const item of reviews) {
    if (!exact(item, ['location', 'spoilerRisk', 'matchedRevelationIds', 'notes'])) { errors.push('review paragraph has incorrect keys'); continue; }
    if (typeof item.spoilerRisk !== 'boolean' || !strings(item.matchedRevelationIds) || !subset(item.matchedRevelationIds, revelationIds) || typeof item.notes !== 'string') errors.push('review paragraph values are invalid');
    if (item.spoilerRisk || item.matchedRevelationIds?.length) risk = true;
  }
  if (risk || ['passed', 'answersWithheld', 'twistsWithheld', 'openLoopsPreserved'].some(key => value[key] !== true)) errors.push('semantic spoiler review did not pass');
  if (typeof value.notes !== 'string') errors.push('review notes must be text');
  return errors;
}
export async function jobStatus(directory) {
  const workspace = await resolve(directory), job = await readJson(path.join(workspace, 'job.json'));
  const { complete: analyses, ready } = await loadAnalyses(workspace, job);
  const base = { job: workspace, source: job.source, output: job.output, language: job.language, sourceKind: job.sourceKind, wordRange: [job.minimumWords, job.maximumWords], contentChapters: job.contentChapterIds.length, batches: job.batchNames.length, completedAnalyses: analyses.length, remainingAnalyses: ready.length, readyAnalyses: ready.slice(0, 4), recommendedParallelAnalyses: Math.min(4, ready.length) };
  if (ready.length) return { status: 'analysis_required', ...base };
  const synthesisPath = path.join(workspace, 'synthesis.json'), draftPath = path.join(workspace, 'draft.json'), reviewPath = path.join(workspace, 'review.json');
  if (!await exists(synthesisPath)) return { status: 'synthesis_required', ...base, synthesisErrors: null };
  let synthesis, synthesisErrors, draft, draftErrors, reviewErrors;
  try { synthesis = await readJson(synthesisPath); synthesisErrors = validateSynthesis(synthesis, job, analyses); } catch (error) { synthesisErrors = [error.message]; }
  if (synthesisErrors.length) return { status: 'synthesis_required', ...base, synthesisErrors };
  if (!await exists(draftPath)) return { status: 'draft_required', ...base, synthesisErrors: [], draftErrors: null };
  try { draft = await readJson(draftPath); draftErrors = validateDraft(draft, job, synthesis); } catch (error) { draftErrors = [error.message]; }
  if (draftErrors.length) return { status: 'draft_required', ...base, synthesisErrors: [], draftErrors };
  if (!await exists(reviewPath)) return { status: 'review_required', ...base, draftErrors: [], reviewErrors: null };
  try { reviewErrors = await validateReview(await readJson(reviewPath), draftPath, draft, new Set(maps(analyses).revelations.keys())); } catch (error) { reviewErrors = [error.message]; }
  if (reviewErrors.length) return { status: reviewErrors.includes('semantic spoiler review did not pass') ? 'revision_required' : 'review_required', ...base, draftErrors: [], reviewErrors };
  return { status: 'ready_to_build', ...base, synthesisErrors: [], draftErrors: [], reviewErrors: [] };
}

export async function buildJob(directory, { overwrite = false } = {}) {
  const workspace = await resolve(directory), status = await jobStatus(workspace);
  if (status.status !== 'ready_to_build') fail(`Job is not ready to build: ${status.status}`);
  const job = await readJson(path.join(workspace, 'job.json'));
  if (await fileSha256(job.source) !== job.sourceSha256) fail('Source HTML changed after the job was prepared.');
  const { complete: analyses } = await loadAnalyses(workspace, job), synthesis = await readJson(path.join(workspace, 'synthesis.json')), draft = await readJson(path.join(workspace, 'draft.json'));
  const leaks = guardLeaks(draftText(draft), analyses);
  if (leaks.length) fail(`Draft contains protected spoiler guard phrases: ${leaks.join(', ')}`);
  const sourceFacts = factTokens(textOf(parse(await fs.readFile(job.source, 'utf8'))));
  const unsupported = [...factTokens(draftText(draft))].filter(item => !sourceFacts.has(item)).sort();
  if (unsupported.length) fail(`Draft contains unsupported factual tokens: ${JSON.stringify(unsupported)}`);
  if (await exists(job.output) && (!overwrite || meta(parse(await fs.readFile(job.output, 'utf8')), 'marketing-summary-generator') !== 'marketingsummary-skill')) fail('Output exists; --overwrite is allowed only for skill-owned output.');
  const { render } = await import('./render.mjs'), candidate = path.join(workspace, 'candidate.html');
  await fs.writeFile(candidate, render(job, synthesis, draft));
  const { validateMarketingSummary } = await import('./validation.mjs'), validation = await validateMarketingSummary(job.source, candidate, { expectedLanguage: job.language });
  if (validation.status !== 'passed') { await writeJson(path.join(workspace, 'report.json'), validation); fail(`Candidate validation failed: ${validation.findings.map(item => item.message).join('; ')}`); }
  await fs.mkdir(path.dirname(job.output), { recursive: true });
  const stage = path.join(path.dirname(job.output), `.${path.basename(job.output)}.${randomUUID()}.marketingsummary.tmp`);
  try { await fs.copyFile(candidate, stage); await fs.rename(stage, job.output); } finally { await fs.rm(stage, { force: true }); }
  const report = { ...validation, artifact: job.output, source: job.source };
  await writeJson(path.join(workspace, 'report.json'), report);
  return { status: 'passed', artifact: job.output, job: workspace, report: path.join(workspace, 'report.json'), findings: [], metrics: report.metrics };
}
