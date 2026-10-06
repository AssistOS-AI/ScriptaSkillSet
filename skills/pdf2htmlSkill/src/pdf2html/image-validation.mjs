import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { PNG, renderPage, crop } from './raster.mjs';

// Compare color samples as well as aspect ratio; a monochrome perceptual hash
// alone cannot distinguish a blank replacement from a uniform source image.
export function imageDifference(a, b) {
  if (Math.abs((a.width / a.height) / (b.width / b.height) - 1) > 0.03) return 1;
  let sum = 0;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const ai = (Math.min(a.height - 1, Math.floor((y + .5) * a.height / 64)) * a.width + Math.min(a.width - 1, Math.floor((x + .5) * a.width / 64))) * 4;
    const bi = (Math.min(b.height - 1, Math.floor((y + .5) * b.height / 64)) * b.width + Math.min(b.width - 1, Math.floor((x + .5) * b.width / 64))) * 4;
    for (let c = 0; c < 3; c++) {
      const left = a.data[ai + c] * a.data[ai + 3] / 255 + 255 - a.data[ai + 3];
      const right = b.data[bi + c] * b.data[bi + 3] / 255 + 255 - b.data[bi + 3];
      sum += (left - right) ** 2;
    }
  }
  return Math.sqrt(sum / (64 * 64 * 3)) / 255;
}

export async function validateSourceImages(profile, evidence, $, htmlPath) {
  const findings = [];
  for (const page of evidence?.pages ?? []) {
    if (!page.images.length) continue;
    const candidates = [];
    for (const node of $(`section[data-source-page="${page.page_number}"] img[src]`).toArray()) {
      try {
        const src = node.attribs.src;
        const bytes = /^data:image\/png;base64,/i.test(src) ? Buffer.from(src.split(',')[1], 'base64')
          : await readFile(resolve(dirname(htmlPath), src));
        candidates.push(PNG.sync.read(bytes));
      } catch { /* Asset validation reports invalid files; unsupported formats remain unverified here. */ }
    }
    const rendered = await renderPage(profile.path, page.page_number, 2);
    for (const [index, region] of page.images.entries()) {
      const expected = crop(rendered, region, page);
      const match = candidates.findIndex(image => imageDifference(expected, image) <= 0.05);
      if (match >= 0) candidates.splice(match, 1);
      else findings.push({ severity: 'error', code: 'source-image-unverified', message: 'No unused local PNG on this HTML page matches the PDF image region.', details: { page: page.page_number, image: index + 1, region } });
    }
  }
  return findings;
}
