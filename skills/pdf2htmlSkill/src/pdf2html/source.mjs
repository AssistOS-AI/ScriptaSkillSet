import { readFile, mkdir, writeFile, realpath } from 'node:fs/promises';
import { resolve, basename, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { run } from './process.mjs';
import { tokens, median, dominant, round, expandLigatures } from './common.mjs';

const identity = [1, 0, 0, 1, 0, 0];
let pdfjs;
const multiply = (left, right) => pdfjs.Util.transform(left, right);
const point = (matrix, x, y) => [matrix[0] * x + matrix[2] * y + matrix[4], matrix[1] * x + matrix[3] * y + matrix[5]];
function bounds(matrix, x0, y0, x1, y1) {
  const points = [point(matrix, x0, y0), point(matrix, x1, y0), point(matrix, x1, y1), point(matrix, x0, y1)];
  return { x0: Math.min(...points.map(p => p[0])), x1: Math.max(...points.map(p => p[0])), top: Math.min(...points.map(p => p[1])), bottom: Math.max(...points.map(p => p[1])) };
}
export const fontFamily = name => /courier|mono|code/i.test(name) ? 'monospace' : /times|serif|garamond|georgia/i.test(name) ? 'serif' : 'sans-serif';
export function emphasis(name, matrix = identity) {
  return { bold: /bold|black|heavy|semibold|demi/i.test(name), italic: /italic|oblique/i.test(name) || (Math.abs(matrix[0]) > 1e-6 && Math.abs(matrix[2] / matrix[0]) >= 0.12) || (Math.abs(matrix[3]) > 1e-6 && Math.abs(matrix[1] / matrix[3]) >= 0.12) };
}
function characterLines(characters, tolerance = 3) {
  const lines = [];
  for (const character of [...characters].sort((a, b) => a.top - b.top || a.x0 - b.x0)) {
    if (!lines.length || character.top - lines.at(-1).at(-1).top > tolerance) lines.push([character]);
    else lines.at(-1).push(character);
  }
  return lines.map(line => line.sort((a, b) => a.x0 - b.x0));
}
function wordGroups(characters, styled, gap = 3) {
  const words = [];
  for (const line of characterLines(characters)) {
    let current = [];
    const flush = () => { if (current.length) words.push(current); current = []; };
    for (const character of line) {
      if (!character.text.trim()) { flush(); continue; }
      const previous = current.at(-1);
      if (previous && (character.x0 - previous.x1 > gap || (styled && (character.font_name !== previous.font_name || Math.abs(character.size_pt - previous.size_pt) > 0.001 || character.color !== previous.color)))) flush();
      current.push(character);
    }
    flush();
  }
  return words;
}
function union(items) {
  return { x0: Math.min(...items.map(item => item.x0)), x1: Math.max(...items.map(item => item.x1)), top: Math.min(...items.map(item => item.top)), bottom: Math.max(...items.map(item => item.bottom)) };
}

function pageOperators(page, operators, styles, viewport) {
  const characters = [], rectangles = [], strokes = [], images = [], stack = [];
  let state = { ctm: identity, text: identity, x: 0, y: 0, lineX: 0, lineY: 0, font: null, size: 0, horizontal: 1, rise: 0, leading: 0, spacing: 0, wordSpacing: 0, fill: '#000000', stroke: '#000000', width: 1 };
  const ops = pdfjs.OPS;
  const image = () => {
    const box = bounds(multiply(viewport.transform, state.ctm), 0, 0, 1, 1);
    if (box.x1 - box.x0 >= 8 && box.bottom - box.top >= 8) images.push(box);
  };
  for (let index = 0; index < operators.fnArray.length; index += 1) {
    const operation = operators.fnArray[index], args = operators.argsArray[index] ?? [];
    if (operation === ops.save) stack.push({ ...state });
    else if (operation === ops.restore) state = stack.pop() ?? state;
    else if (operation === ops.transform) state.ctm = multiply(state.ctm, args);
    else if (operation === ops.paintFormXObjectBegin) { stack.push({ ...state }); if (args[0]) state.ctm = multiply(state.ctm, args[0]); }
    else if (operation === ops.paintFormXObjectEnd) state = stack.pop() ?? state;
    else if (operation === ops.setFillRGBColor) state.fill = args[0];
    else if (operation === ops.setStrokeRGBColor) state.stroke = args[0];
    else if (operation === ops.setLineWidth) state.width = args[0];
    else if (operation === ops.setGState) {
      for (const [key, value] of args[0]) {
        if (key === 'LW') state.width = value;
        if (key === 'Font') { state.font = value[0]; state.size = value[1]; }
      }
    }
    else if (operation === ops.setFont) { state.font = args[0]; state.size = args[1]; }
    else if (operation === ops.beginText) { state.text = identity; state.x = state.y = state.lineX = state.lineY = 0; }
    else if (operation === ops.setTextMatrix) { state.text = args.length === 1 ? args[0] : args; state.x = state.y = state.lineX = state.lineY = 0; }
    else if (operation === ops.setCharSpacing) state.spacing = args[0];
    else if (operation === ops.setWordSpacing) state.wordSpacing = args[0];
    else if (operation === ops.setHScale) state.horizontal = args[0] / 100;
    else if (operation === ops.setTextRise) state.rise = args[0];
    else if (operation === ops.setLeading) state.leading = args[0];
    else if (operation === ops.moveText || operation === ops.setLeadingMoveText) {
      if (operation === ops.setLeadingMoveText) state.leading = -args[1];
      state.lineX += args[0]; state.lineY += args[1]; state.x = state.lineX; state.y = state.lineY;
    } else if (operation === ops.nextLine) { state.lineY -= state.leading; state.x = state.lineX; state.y = state.lineY; }
    else if (operation === ops.showText) {
      const font = page.commonObjs.get(state.font), name = font.name ?? '', size = Math.abs(state.size);
      const matrix = multiply(viewport.transform, multiply(state.ctm, state.text));
      const descent = styles[state.font]?.descent ?? -0.2;
      for (const glyph of args[0]) {
        if (typeof glyph === 'number') { state.x -= glyph * size * 0.001 * state.horizontal; continue; }
        const advance = glyph.width * size * 0.001;
        const box = bounds(matrix, state.x, state.y + descent * size + state.rise, state.x + advance * state.horizontal, state.y + (1 + descent) * size + state.rise);
        const flags = emphasis(name, multiply(state.ctm, state.text));
        characters.push({ ...box, ...flags, text: glyph.unicode, size_pt: box.bottom - box.top, font_name: name, font_family: fontFamily(name), color: state.fill });
        state.x += (advance + state.spacing + (glyph.isSpace ? state.wordSpacing : 0)) * state.horizontal;
      }
    } else if ([ops.paintImageXObject, ops.paintInlineImageXObject, ops.paintImageMaskXObject].includes(operation)) image();
    else if (operation === ops.constructPath && args[1]?.[0]) {
      const path = Array.from(args[1][0]), matrix = multiply(viewport.transform, state.ctm);
      const points = []; let previous = null, first = null;
      const segments = [];
      for (let cursor = 0; cursor < path.length;) {
        const code = path[cursor++];
        if (code === 0 || code === 1) {
          const next = point(matrix, path[cursor++], path[cursor++]); points.push(next);
          if (code === 0) first = next;
          else if (previous) segments.push([previous, next]);
          previous = next;
        } else if (code === 2) { cursor += 4; previous = point(matrix, path[cursor++], path[cursor++]); points.push(previous); }
        else if (code === 3) { cursor += 2; previous = point(matrix, path[cursor++], path[cursor++]); points.push(previous); }
        else if (code === 4 && first && previous) { segments.push([previous, first]); previous = first; }
        else break;
      }
      const painted = args[0], fills = [ops.fill, ops.eoFill, ops.fillStroke, ops.eoFillStroke].includes(painted), stroked = [ops.stroke, ops.closeStroke, ops.fillStroke, ops.eoFillStroke].includes(painted);
      if (fills && points.length >= 4 && points.length <= 5) {
        const box = { x0: Math.min(...points.map(p => p[0])), x1: Math.max(...points.map(p => p[0])), top: Math.min(...points.map(p => p[1])), bottom: Math.max(...points.map(p => p[1])) };
        if (box.x1 - box.x0 > 1 && box.bottom - box.top > 1 && box.x1 - box.x0 < viewport.width * 0.98 && box.bottom - box.top < viewport.height * 0.98) rectangles.push({ ...box, fill_color: state.fill });
      }
      if (stroked) for (const [a, b] of segments) strokes.push({ x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), top: Math.min(a[1], b[1]), bottom: Math.max(a[1], b[1]), color: state.stroke, width: Math.max(0.5, state.width * Math.hypot(state.ctm[0], state.ctm[1])) });
    }
  }
  return { characters, rectangles, strokes, images };
}

export async function inspectSource(input) {
  if (!pdfjs) {
    try {
      await import('../../external/runtime/node_modules/@napi-rs/canvas/index.js');
      pdfjs = await import('../../external/runtime/node_modules/pdfjs-dist/legacy/build/pdf.mjs');
    } catch (error) { throw new Error(`PDF.js and its platform canvas package are required. Run scripts/setup.mjs. ${error.message}`); }
  }
  const path = await realpath(resolve(input)), data = await readFile(path);
  if (extname(path).toLowerCase() !== '.pdf' || data.subarray(0, 5).toString() !== '%PDF-') throw new Error(`Input is not a valid PDF file: ${path}`);
  const qpdf = JSON.parse((await run('qpdf', ['--json', '--json-stream-data=none', path])).stdout);
  if (qpdf.encrypt.encrypted) throw new Error('Encrypted or password-protected PDFs are not supported.');
  const document = await pdfjs.getDocument({ data: new Uint8Array(data), fontExtraProperties: true, disableFontFace: false, standardFontDataUrl: new URL('../../external/runtime/node_modules/pdfjs-dist/standard_fonts/', import.meta.url).pathname, cMapUrl: new URL('../../external/runtime/node_modules/pdfjs-dist/cmaps/', import.meta.url).pathname, cMapPacked: true, useSystemFonts: false, verbosity: 0 }).promise;
  const pages = [], sizes = [], families = [], names = [], colors = [], pageText = [];
  try {
    for (let number = 1; number <= document.numPages; number += 1) {
      const page = await document.getPage(number), viewport = page.getViewport({ scale: 1 });
      const [operators, content, annotations] = await Promise.all([page.getOperatorList(), page.getTextContent({ disableNormalization: true }), page.getAnnotations()]);
      const extracted = pageOperators(page, operators, content.styles, viewport), words = [];
      for (const character of extracted.characters.filter(character => character.text.trim())) {
        if (character.size_pt > 0) sizes.push(character.size_pt);
        families.push(character.font_family); names.push(character.font_name); colors.push(character.color);
      }
      for (const group of wordGroups(extracted.characters, true)) {
        const value = expandLigatures(group.map(character => character.text).join('')), box = union(group);
        for (const token of value.match(/[\p{L}\p{N}_]+/gu) ?? []) words.push({ ...group[0], ...box, text: token, token: tokens(token)[0], italic: group.filter(character => character.italic).length / group.length >= 0.6 });
      }
      const makeLines = gap => characterLines(wordGroups(extracted.characters, false, gap).map(group => ({ ...union(group), text: expandLigatures(group.map(character => character.text).join('')), characters: group }))).map(words => ({ ...union(words), size_pt: round(median(words.flatMap(word => word.characters.map(character => character.size_pt))), 2), text: words.map(word => word.text).join(' ') }));
      const lines = makeLines(3);
      const links = [];
      for (const annotation of annotations) {
        if (annotation.subtype !== 'Link' || !annotation.rect) continue;
        let href = annotation.url;
        if (!href && annotation.dest) {
          const destination = typeof annotation.dest === 'string' ? await document.getDestination(annotation.dest) : annotation.dest;
          if (destination?.length) {
            const index = typeof destination[0] === 'number' ? destination[0] : await document.getPageIndex(destination[0]);
            href = `#page_${index + 1}`;
          }
        }
        if (!href) continue;
        const box = bounds(viewport.transform, ...annotation.rect);
        const indexes = words.flatMap((word, index) => word.x1 > box.x0 && word.x0 < box.x1 && word.bottom > box.top && word.top < box.bottom ? [index] : []);
        if (indexes.length) links.push({ word_indexes: indexes, href });
      }
      pages.push({ page_number: number, width_pt: viewport.width, height_pt: viewport.height, words, lines, links, rectangles: extracted.rectangles, strokes: extracted.strokes, images: extracted.images });
      pageText.push(makeLines(2).map(line => line.text).join('\n'));
      page.cleanup();
    }
    const metadata = await document.getMetadata();
    const size = sizes.length ? round(median(sizes), 2) : 11;
    const larger = [...new Set(sizes.filter(value => value >= size * 1.15).map(value => round(value, 6)))].sort((a, b) => b - a).slice(0, 3).map(value => round(value / size, 2));
    const typography = { body_size_pt: size, body_family: dominant(families)?.[0] ?? 'sans-serif', text_color: dominant(colors)?.[0] ?? '#111827', heading_scale: [...larger, ...[2, 1.55, 1.25].slice(larger.length)], body_font_name: dominant(names)?.[0] ?? '' };
    return { profile: { path, sha256: createHash('sha256').update(data).digest('hex'), pages: pages.length, title: metadata.info?.Title || null, author: metadata.info?.Author || null, page_sizes: pages.map(page => [page.width_pt, page.height_pt]), page_text: pageText, text: pageText.join('\n\f\n') }, evidence: { typography, pages, fonts: [] }, qpdf };
  } finally { await document.destroy(); }
}

export async function extractFonts(path, qpdf, destination) {
  const objects = qpdf.qpdf[1], fonts = new Map();
  const dereference = value => typeof value === 'string' && /^\d+ \d+ R$/.test(value) ? objects[`obj:${value}`]?.value ?? objects[`obj:${value}`]?.stream?.dict : value;
  await mkdir(destination, { recursive: true });
  for (const object of Object.values(objects)) {
    const font = object.value;
    if (!font?.['/BaseFont']) continue;
    const name = font['/BaseFont'].replace(/^\//, '');
    if (fonts.has(name)) continue;
    const descendant = dereference(font['/DescendantFonts']?.[0]) ?? font;
    const descriptor = dereference(descendant['/FontDescriptor'] ?? font['/FontDescriptor']);
    const stream = descriptor?.['/FontFile2'] ?? descriptor?.['/FontFile3'];
    if (!stream) continue;
    const extension = descriptor['/FontFile2'] ? 'ttf' : 'otf';
    const bytes = (await run('qpdf', [`--show-object=${stream.split(' ')[0]}`, '--filtered-stream-data', path], { encoding: 'buffer' })).stdout;
    const digest = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
    const familyName = name.split('+').at(-1).replace(/[-_ ]?(?:regular|roman|bold|semibold|demibold|italic|oblique)$/i, '').toLowerCase();
    const familyDigest = createHash('sha256').update(familyName).digest('hex').slice(0, 12), flags = emphasis(name);
    await writeFile(resolve(destination, `font-${digest}.${extension}`), bytes);
    fonts.set(name, { source_name: name, css_family: `pdf-font-${familyDigest}`, href: `fonts/font-${digest}.${extension}`, weight: flags.bold ? 700 : 400, style: flags.italic ? 'italic' : 'normal' });
  }
  return [...fonts.values()];
}
