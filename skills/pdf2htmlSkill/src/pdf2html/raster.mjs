import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from './process.mjs';
export const { PNG } = createRequire(new URL('../../external/runtime/package.json', import.meta.url))('pngjs');
export async function renderPage(path, page, scale = 2) {
  const temporary = await mkdtemp(join(tmpdir(), 'pdf2html-render-'));
  try {
    const prefix = join(temporary, 'page');
    await run('pdftoppm', ['-f', String(page), '-l', String(page), '-singlefile', '-r', String(scale * 72), '-png', path, prefix]);
    return PNG.sync.read(await readFile(`${prefix}.png`));
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
export function crop(image, box, page) {
  const sx = image.width / page.width_pt, sy = image.height / page.height_pt;
  const left = Math.max(0, Math.floor(box.x0 * sx)), top = Math.max(0, Math.floor(box.top * sy));
  const right = Math.min(image.width, Math.ceil(box.x1 * sx)), bottom = Math.min(image.height, Math.ceil(box.bottom * sy));
  if (right <= left || bottom <= top) throw new Error('Image region is outside its source page.');
  const output = new PNG({ width: right - left, height: bottom - top });
  PNG.bitblt(image, output, left, top, output.width, output.height, 0, 0);
  return output;
}
export function imageHash(image) {
  const values = [];
  for (let y = 0; y < 16; y += 1) for (let x = 0; x < 16; x += 1) {
    const index = (Math.min(image.height - 1, Math.floor((y + 0.5) * image.height / 16)) * image.width + Math.min(image.width - 1, Math.floor((x + 0.5) * image.width / 16))) * 4;
    values.push(0.299 * image.data[index] + 0.587 * image.data[index + 1] + 0.114 * image.data[index + 2]);
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.map(value => value >= mean);
}
