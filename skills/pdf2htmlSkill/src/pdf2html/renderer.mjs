import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { parseHtml, alignment, text } from './dom.mjs';
import { normalizePages, markImagePages, readerBridge } from './pages.mjs';
import { documentGeometry, repairParagraphs } from './paragraphs.mjs';
import { formatBlocks, alignBlocks, indentParagraphs, displayRhythm, headingRules } from './formatting.mjs';
import { repairSingleColumnTables, repairContinuedHeaders, tableGeometry } from './tables.mjs';
import { rebuildContents, rebuildPlainContents, normalizeContents } from './contents.mjs';
import { applyInline, mergeLinks } from './inline.mjs';
import { buildStyles } from './styles.mjs';
import { recoverSourceHeading, sourceDisplayGeometry } from './source-headings.mjs';
import { applyParagraphBorders } from './decorations.mjs';
import { sourceLists, recoverSourceLists } from './lists.mjs';

export function renderHtml(input, evidence, { title, language, content_pages = [], originalRoot = '.' }) {
  let $ = parseHtml(input);
  if (!$('html').length) $ = parseHtml(`<!doctype html><html><head></head><body>${input}</body></html>`);
  if (!$('head').length) $('html').prepend('<head></head>');
  if (!$('body').length) $('html').append('<body></body>');
  $('html').attr('lang', language);
  $('head style').remove();
  if (!$('head title').length) $('head').append('<title></title>');
  $('head title').first().text(title);
  if (!$('head meta[name="viewport"]').length) $('head').append('<meta name="viewport" content="width=device-width, initial-scale=1">');
  $('head meta[name="generator"]').remove(); $('head').append('<meta name="generator" content="pdf2html-skill">');
  const main = normalizePages($, evidence, content_pages);
  $('img[src]').each((_, image) => {
    const source = image.attribs.src;
    if (!isAbsolute(source)) return;
    const path = relative(resolve(originalRoot), resolve(source));
    if (path !== '..' && !path.startsWith('../') && !isAbsolute(path)) $(image).attr('src', path.split('\\').join('/'));
  });
  markImagePages($, main, evidence);
  readerBridge($, main, evidence.typography.body_size_pt);
  const geometry = documentGeometry(evidence);
  for (const page of evidence.pages) {
    const section = $(main).find(`section[data-source-page="${page.page_number}"]`).first()[0];
    if (!section) continue;
    recoverSourceHeading($, section, page, evidence);
    $(section).find('strong,b,em,i').each((_, node) => $(node).replaceWith($(node).contents()));
    repairSingleColumnTables($, section, page);
    rebuildContents($, section, page, evidence.typography.body_size_pt);
    rebuildPlainContents($, section, page);
    recoverSourceLists($, section, sourceLists({pages:[page]}), evidence.typography.body_size_pt);
    repairParagraphs($, section, page, geometry.right);
    const aligned = alignment(page, section);
    formatBlocks($, section, page, aligned, evidence.typography, evidence.fonts);
    tableGeometry($, section, page, aligned);
    alignBlocks($, section, page, aligned);
    indentParagraphs($, section, page, aligned, geometry.left, geometry.indent, evidence.typography.body_size_pt);
    displayRhythm($, section, page, aligned); headingRules($, section, page, aligned);
    sourceDisplayGeometry($, section, page, aligned, evidence.typography.body_size_pt);
    applyInline($, page, aligned);
    applyParagraphBorders($, section, page, aligned);
  }
  repairContinuedHeaders($, main); mergeLinks($); normalizeContents($);
  $('head').append('<link rel="stylesheet" href="assets/styles.css">');
  $('table').each((_, table) => { if (!$(table.parent).hasClass('table-scroll')) $(table).wrap('<div class="table-scroll"></div>'); });
  $('img').each((_, image) => {
    const caption = $(image).closest('figure').find('figcaption').first()[0];
    if (caption) $(image).attr('alt', text(caption));
    else if (image.attribs.alt === undefined) $(image).attr('alt', '');
    $(image).attr({ loading: 'lazy', decoding: 'async' });
  });
  $('a[href]').each((_, anchor) => { if (/^https?:\/\//u.test(anchor.attribs.href)) $(anchor).attr('rel', 'noopener noreferrer'); });
  return { html: `<!doctype html>\n${$.html().replace(/<!doctype[^>]*>\s*/ig, '')}`, css: buildStyles(evidence) };
}

export async function enhanceHtml(htmlPath, stylesheetPath, evidence, options) {
  const output = renderHtml(await readFile(htmlPath, 'utf8'), evidence, { ...options, originalRoot: dirname(htmlPath) });
  await mkdir(dirname(stylesheetPath), { recursive: true });
  await writeFile(stylesheetPath, output.css); await writeFile(htmlPath, output.html);
}
