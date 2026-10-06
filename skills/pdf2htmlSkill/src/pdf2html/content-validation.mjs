import { expandLigatures, tokens } from './common.mjs';
import { sourceTables } from './source-tables.mjs';
import { sourceLists } from './lists.mjs';

// Inline markup must not introduce spaces inside a word. Semantic block
// boundaries do separate text, unlike raw DOM textContent for adjacent cells.
export function contentText(node) {
  if (!node || ['script','style'].includes(node.name)) return '';
  if (node.type === 'text') return node.data;
  const value = (node.children ?? []).map(contentText).join('');
  return /^(?:p|h[1-6]|section|div|li|table|tr|td|th|caption|figcaption|br|hr)$/.test(node.name) ? ` ${value} ` : value;
}
const text = node => contentText(node).trim();

// Keep case and punctuation. Normalize only Unicode composition, presentation
// ligatures, soft hyphens and whitespace. Never discard source words or folios.
export const fidelityTokens = value => expandLigatures(value).normalize('NFC')
  .replaceAll('\u00ad', '').match(/[\p{L}\p{M}\p{N}_]+|[^\s]/gu) ?? [];
const equal = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);
const issue = (code, message, details) => ({ severity: 'error', code, message, details });

export function compareText(source, output, details = {}) {
  const expected = fidelityTokens(source), actual = fidelityTokens(output);
  if (equal(expected, actual)) return [];
  let index = 0;
  while (index < Math.min(expected.length, actual.length) && expected[index] === actual[index]) index++;
  return [issue('source-text-mismatch', 'Source text, punctuation or reading order differs from HTML.', {
    ...details, tokenIndex: index, expectedCount: expected.length, actualCount: actual.length,
    expected: expected.slice(Math.max(0, index - 8), index + 16).join(' '),
    actual: actual.slice(Math.max(0, index - 8), index + 16).join(' '),
  })];
}

function htmlCells($, table) {
  const cells = [], occupied = new Set();
  $(table).find('tr').filter((_, row) => $(row).closest('table')[0] === table).each((row, element) => {
    let col = 0;
    $(element).children('th,td').each((_, cell) => {
      while (occupied.has(`${row}:${col}`)) col++;
      const rowspan = Number(cell.attribs.rowspan ?? 1), colspan = Number(cell.attribs.colspan ?? 1);
      if (!Number.isSafeInteger(rowspan) || !Number.isSafeInteger(colspan) || rowspan < 1 || colspan < 1 || rowspan > 1000 || colspan > 1000) {
        cells.push({ invalidSpan: true }); return;
      }
      cells.push({ row, col, rowspan, colspan, text: tokens(text(cell)).join(' ') });
      for (let y = row; y < row + rowspan; y++) for (let x = col; x < col + colspan; x++) occupied.add(`${y}:${x}`);
      col += colspan;
    });
  });
  return cells;
}

export function validateContent(profile, $, evidence) {
  const findings = [];
  if ($('body').length !== 1) return [issue('html-document', 'Exactly one HTML body is required.', {})];
  const sections = $('section[data-source-page]').toArray();
  if (sections.length !== profile.pages || sections.some((section, index) => section.attribs['data-source-page'] !== String(index + 1) || section.attribs.id !== `page_${index + 1}`)) {
    findings.push(issue('source-page-structure', 'Source page sections must occur exactly once in PDF order with matching anchors.', {}));
  }
  if (!Array.isArray(profile.page_text) || profile.page_text.length !== profile.pages) {
    findings.push(issue('source-page-evidence', 'Independent text evidence is required for every PDF page.', {}));
    return findings;
  }
  for (let index = 0; index < profile.pages; index++) {
    const section = $(`section[data-source-page="${index + 1}"]`).first();
    if (section.length) findings.push(...compareText(profile.page_text[index], text(section[0]), { page: index + 1, selector: `#page_${index + 1}` }));
  }
  const outside = $('body').clone();
  outside.find('section[data-source-page],script,style').remove();
  if (text(outside[0])) findings.push(issue('text-outside-source-pages', 'HTML contains text outside the source page sections.', {}));
  if (evidence) {
    const usedTables = new Set(), usedLists = new Set();
    for (const expected of sourceTables(evidence)) {
      const candidates = $(`section[data-source-page="${expected.page}"] table`).toArray();
      const wanted = expected.cells.map(({ row, col, rowspan, colspan, text: value }) => ({ row, col, rowspan, colspan, text: tokens(value).join(' ') }));
      const signature = JSON.stringify(wanted);
      const match = candidates.find(table => !usedTables.has(table) && JSON.stringify(htmlCells($, table)) === signature);
      if (match) usedTables.add(match);
      else {
        findings.push(issue('source-table-mismatch', 'No HTML table preserves the independently recognized PDF cells and spans.', { page: expected.page, topPt: expected.topPt, rows: expected.rows, columns: expected.columns }));
      }
    }
    for (const group of sourceLists(evidence)) {
      const wanted = group.items.map(item => fidelityTokens(item.text));
      const candidates = $(`section[data-source-page="${group.page}"] ${group.kind}`).toArray();
      const match = candidates.find(list => {
        if (usedLists.has(list)) return false;
        const items = $(list).children('li').toArray();
        return items.length === wanted.length && items.every((item, index) => equal(fidelityTokens(text(item)), wanted[index]));
      });
      if (match) usedLists.add(match);
      else findings.push(issue('source-list-mismatch', 'HTML does not preserve the independently recognized source list items.', { page: group.page, kind: group.kind, items: wanted.length }));
    }
    for (const page of evidence.pages) {
      const blocks = $(`section[data-source-page="${page.page_number}"] p,section[data-source-page="${page.page_number}"] h1,section[data-source-page="${page.page_number}"] h2,section[data-source-page="${page.page_number}"] h3`).toArray()
        .filter(block => !$(block).closest('td,th,li,figcaption').length);
      for (let index = 1; index < page.lines.length; index++) {
        const before = page.lines[index - 1], after = page.lines[index];
        const size = Math.max(before.size_pt, after.size_pt);
        // Only certify a separation when source lines share a column and have
        // a clear vertical gap. Ambiguous paragraph geometry is not guessed.
        if (!(after.top - before.bottom > size * 0.8 && Math.abs(after.x0 - before.x0) < size)) continue;
        const boundary = fidelityTokens(`${before.text} ${after.text}`);
        if (!boundary.length) continue;
        for (const block of blocks) {
          const actual = fidelityTokens(text(block));
          if (actual.some((_, start) => start + boundary.length <= actual.length && boundary.every((token, offset) => token === actual[start + offset]))) {
            findings.push(issue('source-block-merged', 'An HTML text block merges source lines separated by a clear paragraph gap.', { page: page.page_number, sourceLine: index + 1, tag: block.name }));
            break;
          }
        }
      }
      const count = $(`section[data-source-page="${page.page_number}"] img`).length;
      if (count < page.images.length) findings.push(issue('source-image-missing', 'HTML page has fewer images than independently extracted PDF image regions.', { page: page.page_number, expected: page.images.length, actual: count }));
    }
  }
  return findings;
}
