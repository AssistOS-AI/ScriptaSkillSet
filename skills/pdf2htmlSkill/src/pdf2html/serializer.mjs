import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { escapeHtml } from './common.mjs';
import { renderPage, crop, PNG } from './raster.mjs';
function listNumber(item) {
  if (item?.enumerated === false) return undefined;
  const match = String(item?.marker ?? '').match(/^\s*(\d+)[.)]?\s*$/);
  const number = match ? Number(match[1]) : NaN;
  return Number.isSafeInteger(number) ? number : undefined;
}
export async function serializeDocument(document, source, staging, imageScale) {
  const dereference = reference => reference?.$ref?.split('/').slice(1).reduce((value, key) => value?.[key], document);
  const used = new Set(), pages = new Set(), renderedPages = new Map();
  let tables = 0, pictures = 0;
  await mkdir(join(staging, 'assets/images'), { recursive: true });
  async function children(item) { const parts = []; for (const reference of item.children ?? []) parts.push(await serialize(dereference(reference))); return parts.join('\n'); }
  function captions(item) {
    return (item.captions ?? []).map(reference => { const value = dereference(reference); if (!value) return ''; used.add(value.self_ref); return escapeHtml(value.text ?? ''); }).join(' ');
  }
  async function serialize(item) {
    if (!item || used.has(item.self_ref) || (item.content_layer && item.content_layer !== 'body')) return '';
    used.add(item.self_ref);
    if (item.prov?.[0]?.page_no) pages.add(item.prov[0].page_no);
    const label = item.label, value = escapeHtml(item.text ?? '');
    if (label === 'table') {
      tables += 1;
      const caption = captions(item), rows = [];
      for (let row = 0; row < item.data.num_rows; row += 1) {
        const cells = item.data.table_cells.filter(cell => cell.start_row_offset_idx === row).sort((a,b) => a.start_col_offset_idx - b.start_col_offset_idx);
        rows.push(`<tr>${cells.map(cell => {
          const tag = cell.column_header || cell.row_header || cell.row_section ? 'th' : 'td';
          return `<${tag}${cell.row_span > 1 ? ` rowspan="${cell.row_span}"` : ''}${cell.col_span > 1 ? ` colspan="${cell.col_span}"` : ''}>${escapeHtml(cell.text ?? '')}</${tag}>`;
        }).join('')}</tr>`);
      }
      return `<table>${caption ? `<caption>${caption}</caption>` : ''}<tbody>${rows.join('')}</tbody></table>`;
    }
    if (label === 'picture') {
      pictures += 1;
      const caption = captions(item), provenance = item.prov?.[0];
      if (!provenance) throw new Error('A picture has no source-page location.');
      const page = source.evidence.pages[provenance.page_no - 1], box = provenance.bbox;
      if (!renderedPages.has(provenance.page_no)) renderedPages.set(provenance.page_no, renderPage(source.profile.path, provenance.page_no, imageScale));
      const region = { x0: box.l, x1: box.r, top: box.coord_origin === 'BOTTOMLEFT' ? page.height_pt - box.t : box.t, bottom: box.coord_origin === 'BOTTOMLEFT' ? page.height_pt - box.b : box.b };
      const image = crop(await renderedPages.get(provenance.page_no), region, page), name = `picture-${pictures}.png`;
      await writeFile(join(staging, 'assets/images', name), PNG.sync.write(image));
      return `<figure><img src="assets/images/${name}">${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;
    }
    if (label === 'list' || label === 'ordered_list') {
      const items = (item.children ?? []).map(dereference).filter(child => child?.label === 'list_item' && (!child.content_layer || child.content_layer === 'body'));
      const ordered = label === 'ordered_list' || items.some(child => child.enumerated === true || listNumber(child) !== undefined);
      const tag = ordered ? 'ol' : 'ul', start = ordered ? listNumber(items[0]) : undefined;
      return `<${tag}${start !== undefined ? ` start="${start}"` : ''}>${await children(item)}</${tag}>`;
    }
    if (label === 'list_item') {
      const number = listNumber(item);
      return `<li${number !== undefined ? ` value="${number}"` : ''}>${value}${await children(item)}</li>`;
    }
    if (label === 'title' || label === 'section_header') { const level = label === 'title' ? 1 : Math.min(6, Math.max(1, item.level ?? 1)); return `<h${level}>${value}</h${level}>${await children(item)}`; }
    if (label === 'code') return `<pre><code>${value}</code></pre>`;
    if (!item.text && item.children?.length) return children(item);
    return value ? `<p>${value}</p>${await children(item)}` : children(item);
  }
  // Serialize in document order so caption references and image numbering remain deterministic.
  const parts = [];
  for (const reference of document.body.children ?? []) parts.push(await serialize(dereference(reference)));
  return { html: `<!doctype html><html><head><meta charset="utf-8"></head><body><div class="page">${parts.join('\n')}</div></body></html>`, tables, pictures, content_pages: [...pages].sort((a,b) => a-b) };
}
