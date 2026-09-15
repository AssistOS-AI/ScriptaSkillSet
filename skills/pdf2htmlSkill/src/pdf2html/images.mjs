import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve, relative } from 'node:path';
import { parseHtml, text } from './dom.mjs';
import { tokens } from './common.mjs';
import { PNG, renderPage, crop, imageHash } from './raster.mjs';
export function captionIsBelow(lines, caption, top, bottom) {
  const prefix = tokens(caption).slice(0, 4);
  if (!prefix.length) return null;
  for (const line of lines) {
    if (tokens(line.text).slice(0, prefix.length).join(' ') !== prefix.join(' ')) continue;
    if (line.top >= bottom - 2) return true;
    if (line.top <= top + 2) return false;
  }
  return null;
}
export async function preserveImages(source, htmlPath, imageScale = 2) {
  const $ = parseHtml(await readFile(htmlPath, 'utf8')), known = [], additions = [];
  const directory = join(dirname(htmlPath), 'assets/images');
  await mkdir(directory, { recursive: true });
  for (const image of $('img[src]').toArray()) {
    const asset = resolve(dirname(htmlPath), image.attribs.src);
    if (relative(dirname(htmlPath), asset).startsWith('..')) continue;
    try { known.push(imageHash(PNG.sync.read(await readFile(asset)))); } catch { /* Only locally generated PNGs participate in matching. */ }
  }
  let changed = false;
  for (const page of source.evidence.pages) {
    if (!page.images.length) continue;
    const rendered = await renderPage(source.profile.path, page.page_number, imageScale);
    const section = $(`section[data-source-page="${page.page_number}"]`).first(), existing = section.find('img').toArray();
    for (let index = 0; index < page.images.length; index += 1) {
      const region = page.images[index], cropped = crop(rendered, region, page);
      const name = `source-page-${String(page.page_number).padStart(4, '0')}-image-${String(index + 1).padStart(2, '0')}.png`, href = `assets/images/${name}`;
      if (existing.length >= page.images.length) {
        await writeFile(join(directory, name), PNG.sync.write(cropped));
        const image = $(existing[index]).attr('src', href), caption = image.closest('figure').find('figcaption').first();
        if (caption.length) {
          const below = captionIsBelow(page.lines, text(caption[0]), region.top, region.bottom);
          if (below === true) caption.before(image);
          else if (below === false) caption.after(image);
        }
        changed = true; continue;
      }
      const hash = imageHash(cropped), match = known.findIndex(value => value.filter((bit, n) => bit === hash[n]).length / value.length >= 0.93);
      if (match >= 0) { known.splice(match, 1); continue; }
      await writeFile(join(directory, name), PNG.sync.write(cropped));
      additions.push({ page: page.page_number, top: region.top, href });
      if (region.x1 - region.x0 >= page.width_pt * 0.9 && region.bottom - region.top >= page.height_pt * 0.9) section.addClass('source-page-full-image').attr('style', '--pdf-page-top: 0%; --pdf-page-left: 0%; --pdf-page-right: 0%; --pdf-page-bottom: 0%');
    }
  }
  for (const addition of additions.sort((a,b) => a.page - b.page || a.top - b.top)) {
    const section = $(`section[data-source-page="${addition.page}"]`).first();
    (section.length ? section : $('main,body').first()).append(`<figure class="source-picture" data-source-page="${addition.page}" data-source-top="${addition.top.toFixed(2)}"><img src="${addition.href}" alt="" loading="lazy" decoding="async"></figure>`);
  }
  if (changed || additions.length) await writeFile(htmlPath, $.html());
  return additions.length;
}
