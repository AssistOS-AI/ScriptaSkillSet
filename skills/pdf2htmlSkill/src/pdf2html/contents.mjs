import { median, clamp } from './common.mjs';
import { text, setStyle, relativeSize, addClass } from './dom.mjs';
const dotted = /^(.*?)(?:\.{3,})\s*(\d+)\s*$/u;
const numbered = /^(\d+\.\s+.*?)\s+(\d+)\s*$/u;
const part = /^PART\s+[IVXLCDM]+(?:\s*[:.-]\s*|\s+).+/iu;
const plain = /^(?:methodological\s+note\b|introduction\b|chapter\s+\d+\s*[.:]|conclusion\b|appendix\b|references\b)/iu;
const isContents = value => ['contents', 'table of contents'].includes(value.toLowerCase());
const normalized = value => value.trim().replace(/\s+/gu, ' ');

function entry($, title, page, isPart = false, href = null) {
  const wrapper = href ? $('<a></a>').attr('href', href) : $('<div></div>');
  wrapper.addClass('toc-entry').append($('<span></span>').addClass(isPart ? 'toc-part-title' : 'toc-title').text(title));
  if (page) wrapper.append($('<span class="toc-leader" aria-hidden="true"></span>'), $('<span class="toc-page"></span>').text(page));
  return wrapper;
}

export function rebuildContents($, section, page, bodySize) {
  const heading = $(section).find('h1,h2,h3,h4,h5,h6').first()[0], table = $(section).find('table').first()[0];
  if (!table) return;
  const dottedLines = page.lines.filter(line => dotted.test(normalized(line.text)));
  if (!isContents(heading ? text(heading) : '') && (dottedLines.length < 2 || !page.links.length)) return;
  const items = [];
  let current = null, currentPage = null, currentLeft = 0, started = false;
  function flush() { if (current) items.push({ kind: 'entry', title: current.join(' '), page: currentPage, left: currentLeft }); current = null; }
  for (const line of page.lines) {
    const value = normalized(line.text);
    if (!value || isContents(value)) continue;
    const match = value.match(dotted);
    if (match) { flush(); items.push({ kind: part.test(match[1].trimEnd()) ? 'part' : 'entry', title: match[1].trimEnd(), page: match[2], left: line.x0 }); started = true; continue; }
    if (part.test(value)) { flush(); items.push({ kind: 'part', title: value, page: null, left: line.x0 }); started = true; continue; }
    const numberedMatch = value.match(numbered);
    if (numberedMatch) { flush(); current = [numberedMatch[1]]; currentPage = numberedMatch[2]; currentLeft = line.x0; started = true; continue; }
    if (started && current && line.top < page.height_pt * 0.83) current.push(value);
  }
  flush();
  if (items.filter(item => item.kind === 'entry').length < 2) return;
  const baseline = Math.min(...items.map(item => item.left));
  $(table).empty(); addClass(table, 'toc-table');
  if (dottedLines.length) {
    const size = median(dottedLines.map(line => line.size_pt).filter(size => size > 0));
    setStyle(table, 'font-size', relativeSize(size, bodySize));
    if (dottedLines.length > 1 && size > 0) {
      const span = Math.max(...dottedLines.map(line => line.bottom)) - Math.min(...dottedLines.map(line => line.top));
      setStyle(table, 'line-height', clamp(span / dottedLines.length / size, 1, 2.2).toFixed(3));
    }
  }
  const body = $('<tbody></tbody>');
  for (const item of items) {
    const row = $('<tr></tr>').addClass(item.kind === 'part' ? 'toc-part-row' : 'toc-entry-row');
    const indent = Math.max(0, item.left - baseline);
    if (indent >= 0.5) row.attr('style', `--toc-indent: ${indent.toFixed(2)}pt`);
    row.append($('<td></td>').append(entry($, item.title, item.page, item.kind === 'part'))); body.append(row);
  }
  $(table).append(body);
  $(table.parent).children('p').each((_, paragraph) => { if (/^\d+$/u.test(text(paragraph))) $(paragraph).remove(); });
}

export function rebuildPlainContents($, section, page) {
  const heading = $(section).find('h1,h2,h3,h4,h5,h6').first()[0], table = $(section).find('table').first()[0];
  if (!heading || !table || !isContents(text(heading)) || page.lines.some(line => dotted.test(normalized(line.text)))) return;
  const items = []; let count = 0;
  for (const line of page.lines) {
    const value = normalized(line.text);
    if (!value || isContents(value)) continue;
    if (plain.test(value)) { items.push(value); count += 1; }
    else if (items.length) items[items.length - 1] += ` ${value}`;
  }
  if (count < 3) return;
  const contents = $('<nav class="contents-list"></nav>').attr('aria-label', text(heading));
  for (const item of items) contents.append($('<p class="contents-list-entry"></p>').text(item));
  ($(table.parent).hasClass('table-scroll') ? $(table.parent) : $(table)).replaceWith(contents);
}

export function normalizeContents($) {
  for (const table of $('table').toArray()) {
    const entries = [];
    for (const row of $(table).find('tr').toArray()) {
      const cells = $(row).children('th,td').toArray();
      if (cells.length !== 1) { entries.length = 0; break; }
      const anchors = $(cells[0]).find('a').toArray(), match = text(cells[0]).match(dotted);
      if (anchors.length !== 1 || !match) { entries.length = 0; break; }
      entries.push([cells[0], anchors[0], match]);
    }
    if (!entries.length) continue;
    addClass(table, 'toc-table');
    for (const [cell, anchor, match] of entries) $(cell).empty().append(entry($, match[1].trimEnd(), match[2], false, anchor.attribs.href ?? ''));
  }
}
