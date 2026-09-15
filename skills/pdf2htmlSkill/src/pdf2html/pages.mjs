import { tokens, matchingBlocks, counter } from './common.mjs';
import { text, addClass, setStyle } from './dom.mjs';

function selectedPage(pages) {
  return [...counter(pages)].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
}
function resolvePages(start, end, votes) {
  const pages = Array.from({ length: end - start }, (_, index) => votes.get(start + index) ?? null);
  let next = null, previous = null;
  for (let index = pages.length - 1; index >= 0; index -= 1) {
    if (pages[index] !== null) next = pages[index];
    else if (next !== null) pages[index] = next;
  }
  for (let index = 0; index < pages.length; index += 1) {
    if (pages[index] === null || (previous !== null && pages[index] < previous)) pages[index] = previous;
    previous = pages[index];
  }
  return pages;
}
function splitText($, element, pages) {
  const value = text(element), matches = [...value.matchAll(/[\p{L}\p{N}_]+/gu)];
  const assigned = pages.filter(page => page !== null);
  if (!matches.length || matches.length !== pages.length || new Set(assigned).size <= 1) return [];
  const result = [];
  let start = 0, current = assigned[0];
  for (let index = 1; index <= matches.length; index += 1) {
    const next = index < matches.length ? pages[index] : null;
    if (index < matches.length && next === current) continue;
    const fragment = value.slice(start === 0 ? 0 : matches[start].index, index === matches.length ? value.length : matches[index].index).trim();
    if (fragment) {
      const node = $(`<${element.name}></${element.name}>`).attr({ ...element.attribs }).text(fragment)[0];
      result.push([current, node]);
    }
    start = index;
    if (next !== null) current = next;
  }
  return result;
}
function splitList($, element, pages) {
  const results = [], containers = new Map();
  let offset = 0;
  for (const item of $(element).children('li').toArray()) {
    const count = tokens(text(item)).length, itemPages = pages.slice(offset, offset + count);
    offset += count;
    const assigned = itemPages.filter(page => page !== null);
    if (!assigned.length) continue;
    let pieces = splitText($, item, itemPages);
    if (!pieces.length) pieces = [[selectedPage(assigned), $('<li></li>').attr({ ...item.attribs }).text(text(item))[0]]];
    for (const [page, piece] of pieces) {
      if (!containers.has(page)) {
        const container = $(`<${element.name}></${element.name}>`).attr({ ...element.attribs })[0];
        containers.set(page, container); results.push([page, container]);
      }
      $(containers.get(page)).append(piece);
    }
  }
  return results;
}

export function normalizePages($, evidence, contentPages) {
  const extracted = new Map();
  const put = (page, children) => extracted.set(page, [...(extracted.get(page) ?? []), ...children]);
  const splitTable = $('body').children('table').toArray().find(table => $(table).find('td').length && $(table).find('div.page').length);
  if (splitTable) {
    const normalized = contentPages.length && Math.min(...contentPages) === 0 ? contentPages.map(page => page + 1) : contentPages;
    $(splitTable).find('tr').toArray().slice(0, normalized.length).forEach((row, index) => {
      const page = $(row).children('td').last().find('div.page').first();
      put(normalized[index], page.contents().toArray());
    });
  } else {
    const page = $('body div.page').first();
    if (page.length) {
      const children = page.contents().toArray().filter(child => child.type !== 'text' || child.data.trim());
      const source = [], sourcePages = [], output = [], ranges = [];
      for (const page of evidence.pages) for (const word of page.words) { source.push(word.token); sourcePages.push(page.page_number); }
      for (const child of children) { const start = output.length; output.push(...tokens(text(child))); ranges.push([start, output.length]); }
      const votes = new Map();
      for (const [a, b, length] of matchingBlocks(source, output, { autojunk: true })) for (let offset = 0; offset < length; offset += 1) votes.set(b + offset, sourcePages[a + offset]);
      let previous = contentPages[0] ?? 1;
      children.forEach((child, index) => {
        const pages = resolvePages(...ranges[index], votes);
        const pieces = /^(p|h[1-6])$/.test(child.name) ? splitText($, child, pages) : ['ul', 'ol'].includes(child.name) ? splitList($, child, pages) : [];
        if (pieces.length) for (const [page, piece] of pieces) { previous = Math.max(previous, page); put(previous, [piece]); }
        else {
          const assigned = pages.filter(page => page !== null);
          if (assigned.length) previous = Math.max(previous, selectedPage(assigned));
          put(previous, [child]);
        }
      });
    } else put(contentPages[0] ?? 1, $('body').contents().toArray());
  }
  const main = $('<main class="pdf-document"></main>');
  for (const page of evidence.pages) {
    const section = $('<section class="source-page"></section>').attr({ id: `page_${page.page_number}`, 'data-source-page': String(page.page_number), 'aria-label': `PDF page ${page.page_number}` });
    let labels = page.words.filter(word => /^\d+$/.test(word.text) && word.top >= page.height_pt * 0.93);
    if (!labels.length) labels = page.words.filter(word => /^\d+$/.test(word.text) && word.top >= page.height_pt * 0.9 && Math.abs((word.x0 + word.x1) / 2 - page.width_pt / 2) <= page.width_pt * 0.08);
    const label = labels.sort((a, b) => b.top - a.top)[0];
    section.attr('data-page-label', label?.text ?? '');
    if (page.words.length) {
      const words = page.words.filter(word => word !== label);
      const content = [...(words.length ? words : page.words), ...page.images];
      const top = Math.min(...content.map(word => word.top)) / page.width_pt * 100;
      const left = Math.min(...content.map(word => word.x0)) / page.width_pt * 100;
      const right = (page.width_pt - Math.max(...content.map(word => word.x1))) / page.width_pt * 100;
      const bottom = (page.height_pt - Math.max(...content.map(word => word.bottom))) / page.width_pt * 100;
      section.attr('style', `--pdf-page-top: ${top.toFixed(2)}%; --pdf-page-left: ${left.toFixed(2)}%; --pdf-page-right: ${right.toFixed(2)}%; --pdf-page-bottom: ${bottom.toFixed(2)}%`);
    }
    for (const child of extracted.get(page.page_number) ?? []) section.append(child);
    main.append(section);
  }
  $('body').empty().append(main);
  return main[0];
}

export function markImagePages($, main, evidence) {
  for (const page of evidence.pages) {
    if (page.words.length) continue;
    const section = $(main).find(`section[data-source-page="${page.page_number}"]`).first();
    const children = section.contents().toArray().filter(child => child.type !== 'text' || child.data.trim());
    if (children.length !== 1 || children[0].name !== 'figure' || !$(children[0]).find('img').length) continue;
    $(children[0]).find('img').first().attr('alt', '');
    addClass(section[0], 'source-page-full-image');
    section.attr('style', '--pdf-page-top: 0%; --pdf-page-left: 0%; --pdf-page-right: 0%; --pdf-page-bottom: 0%');
  }
}

export function readerBridge($, main, bodySize) {
  $(main).attr('data-reader-content', '');
  $(main).children('section.source-page').each((_, page) => {
    setStyle(page, '--pdf-reader-size', `var(--reader-font-size, var(--standalone-size, ${bodySize.toFixed(2)}pt))`);
    setStyle(page, 'font-size', 'var(--pdf-reader-size)');
  });
  $('#pdf2html-reader-bridge').remove();
  const script = $('<script id="pdf2html-reader-bridge"></script>').text(`(() => {
  window.addEventListener("message", (event) => {
    if (event.data?.type !== "axiologic-reader-settings") return;
    const size = Number(event.data.fontSize);
    if (Number.isFinite(size) && size > 0) {
      document.documentElement.style.setProperty("--standalone-size", \`\${size}rem\`);
    }
    if (event.data.theme) document.documentElement.dataset.theme = event.data.theme;
  });
})();`);
  $('body').append(script);
}
