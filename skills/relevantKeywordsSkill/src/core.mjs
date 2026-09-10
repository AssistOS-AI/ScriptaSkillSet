import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { parse, first, named, has, textOf, remove } from './dom.mjs';
export const hash = value => createHash('sha256').update(value).digest('hex');
export const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const writeJson = (file, value) => fs.writeFile(file, JSON.stringify(value, null, 2) + '\n');
const key = text => text.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase();
function language(value) {
  if (!value || value === 'auto') return null;
  try { return new Intl.Locale(value.trim()).toString(); }
  catch { throw new Error(`Invalid language tag: ${value}`); }
}
export function synonyms(value = { groups: [] }) {
  if (!value || !Array.isArray(value.groups)) throw new Error('Synonyms need a groups array.');
  const seen = new Set();
  for (const group of value.groups) {
    if (!group || typeof group.canonical !== 'string' || !group.canonical.trim() || !Array.isArray(group.variants)) throw new Error('Invalid synonym group.');
    for (const term of [group.canonical, ...group.variants]) {
      if (typeof term !== 'string' || !term.trim() || /[,\r\n]/u.test(term) || seen.has(key(term))) throw new Error('Invalid or overlapping synonym group.');
      seen.add(key(term));
    }
  }
  return { language: language(value.language), groups: value.groups };
}
export function extract(html) {
  const doc = parse(html);
  const lang = language(named(doc, 'html')?.attribs.lang);
  const root = first(doc, n => n.name === 'main' && has(n, 'data-reader-content')) || named(doc, 'main') || named(doc, 'article') || named(doc, 'body');
  if (!root) throw new Error('HTML has no content root.');
  remove(root, n => ['script', 'style', 'nav', 'noscript', 'template'].includes(n.name) || has(n, 'hidden') || n.attribs['aria-hidden'] === 'true' || /display\s*:\s*none|visibility\s*:\s*hidden/i.test(n.attribs.style || '') || /(?:^|\s)(?:toc-table|contents-list|bibliography|references)(?:\s|$)/i.test(n.attribs.class || '') || ['doc-bibliography','doc-toc'].includes(n.attribs.role));
  const units = [];
  let skipReferences = false;
  const visit = node => {
    if (/^h[1-6]$/.test(node.name || '')) {
      skipReferences = /^(?:selected )?(?:bibliography|references|bibliografie|referințe|cuprins|contents|table of contents)$/iu.test(textOf(node).trim());
    }
    if (skipReferences && node.type === 'text') return;
    if (node.type === 'text' && node.data.trim()) {
      const source = node.data.trim().replace(/\s+/gu, ' ');
      // A single large text node is split at whitespace while retaining every word.
      const words = source.split(' '); let text = '';
      for (const word of words) {
        if (text && text.length + word.length > 16000) { units.push({ id: `u${String(units.length + 1).padStart(6, '0')}`, text }); text = ''; }
        text += (text ? ' ' : '') + word;
      }
      if (text) units.push({ id: `u${String(units.length + 1).padStart(6, '0')}`, text });
    }
    for (const child of node.children || []) visit(child);
  };
  visit(root);
  if (!units.length) throw new Error('HTML has no usable prose.');
  return { language: lang, units };
}
export async function analyze(input, options = {}) {
  const source = await fs.realpath(input);
  if (!/\.html?$/i.test(source)) throw new Error('Input must have an .html or .htm extension.');
  const count = options.count ?? 20;
  if (!Number.isInteger(count) || count < 1 || count > 1000) throw new Error('Count must be an integer from 1 to 1000.');
  const bytes = await fs.readFile(source), html = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const content = extract(html), lang = language(options.language) || content.language;
  const dictionary = synonyms(options.synonyms ? await readJson(options.synonyms) : undefined);
  const identity = hash(JSON.stringify([source, hash(bytes), hash(JSON.stringify(content.units)), count, lang, dictionary]));
  const jobDir = path.resolve(options.jobDir || path.join(path.dirname(source), '.relevantkeywords-jobs', identity.slice(0, 20)));
  const job = { source, sourceHash: hash(bytes), count, language: lang, synonyms: dictionary, output: path.join(path.dirname(source), 'relevantKeywords.txt'), units: content.units, batches: [] };
  const batches = []; let batch = [], size = 0;
  for (const unit of content.units) {
    if (batch.length && size + unit.text.length > 32000) { batches.push(batch); batch = []; size = 0; }
    batch.push(unit); size += unit.text.length;
  }
  if (batch.length) batches.push(batch);
  job.batches = batches.map((_, i) => `batch-${String(i + 1).padStart(4, '0')}.json`);
  try {
    const existing = await readJson(path.join(jobDir, 'job.json'));
    if (JSON.stringify(existing) !== JSON.stringify(job)) throw new Error('Job directory belongs to another input or configuration.');
    return status(jobDir);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await fs.mkdir(path.join(jobDir, 'batches'), { recursive: true });
  await fs.mkdir(path.join(jobDir, 'analyses'), { recursive: true });
  await writeJson(path.join(jobDir, 'job.json'), job);
  await fs.writeFile(path.join(jobDir, 'source-original.html'), bytes);
  await writeJson(path.join(jobDir, 'context.json'), { language: lang, notes: '' });
  for (let i = 0; i < batches.length; i++) await writeJson(path.join(jobDir, 'batches', job.batches[i]), { units: batches[i] });
  return { status: 'prepared', job: jobDir, language: lang, batches: batches.length, count, output: job.output };
}
function checkTerms(terms, allowed, name) {
  if (!Array.isArray(terms)) throw new Error(`${name}: keywords must be an array.`);
  const seen = new Set();
  for (const term of terms) {
    if (!term || typeof term.keyword !== 'string' || !term.keyword.trim() || /[,\r\n]/u.test(term.keyword) || seen.has(key(term.keyword))) throw new Error(`${name}: invalid or duplicate keyword.`);
    if (!Array.isArray(term.unitIds) || !term.unitIds.length || term.unitIds.some(id => !allowed.has(id))) throw new Error(`${name}: keywords must cite valid source unit IDs.`);
    seen.add(key(term.keyword));
  }
}
async function load(jobDir) {
  const job = await readJson(path.join(jobDir, 'job.json'));
  if (hash(await fs.readFile(job.source)) !== job.sourceHash) throw new Error('Source changed after analysis preparation.');
  if (hash(await fs.readFile(path.join(jobDir, 'source-original.html'))) !== job.sourceHash) throw new Error('Source snapshot changed.');
  return job;
}
export async function status(jobDir) {
  jobDir = path.resolve(jobDir); const job = await load(jobDir), remaining = [];
  for (const batch of job.batches) {
    try {
      const result = await readJson(path.join(jobDir, 'analyses', batch));
      const source = await readJson(path.join(jobDir, 'batches', batch));
      checkTerms(result.keywords, new Set(source.units.map(u => u.id)), batch);
      if (result.reviewed !== true) throw new Error(`${batch}: review is incomplete.`);
    } catch (error) { if (error.code === 'ENOENT') remaining.push(batch); else throw error; }
  }
  return { status: remaining.length ? 'analyzing' : 'ready_to_build', job: jobDir, remainingBatches: remaining.length, readyBatches: remaining, output: job.output };
}
export async function build(jobDir) {
  jobDir = path.resolve(jobDir); const job = await load(jobDir), state = await status(jobDir);
  if (state.remainingBatches) throw new Error('Complete every batch before consolidation.');
  const context = await readJson(path.join(jobDir, 'context.json'));
  if (!language(context.language)) throw new Error('Set the source language in context.json.');
  if (job.language && language(context.language) !== job.language) throw new Error('Context language differs from the source configuration.');
  const final = await readJson(path.join(jobDir, 'selection.json'));
  if (final.reviewed !== true) throw new Error('Final selection requires review.');
  checkTerms(final.keywords, new Set(job.units.map(u => u.id)), 'selection');
  if (!final.keywords.length || final.keywords.length > job.count) throw new Error('Selection must contain between one and the requested number of keywords.');
  const dict = !job.synonyms.language || new Intl.Locale(context.language).language === new Intl.Locale(job.synonyms.language).language ? job.synonyms.groups : [];
  const aliases = new Map(dict.flatMap(g => [g.canonical, ...g.variants].map(v => [key(v), g.canonical])));
  const keywords = [...new Map(final.keywords.map(t => { const v = aliases.get(key(t.keyword)) || t.keyword.trim().replace(/\s+/gu, ' '); return [key(v), v]; })).values()];
  const temporary = `${job.output}.${randomUUID()}.tmp`;
  try { await fs.writeFile(temporary, keywords.join(', ') + '\n', { flag: 'wx' }); await load(jobDir); await fs.rename(temporary, job.output); }
  finally { await fs.rm(temporary, { force: true }); }
  return { output: job.output, count: keywords.length, keywords };
}
