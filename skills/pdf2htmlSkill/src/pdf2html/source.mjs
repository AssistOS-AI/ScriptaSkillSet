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
function textItems(content, viewport, page) {
  return content.items.flatMap(item => {
    const text = expandLigatures(item.str || '').trim();
    if (!text || !Number.isFinite(item.width) || item.width <= 0) return [];
    const matrix = multiply(viewport.transform, item.transform);
    const height = Math.abs(item.height || Math.hypot(matrix[2], matrix[3]));
    const x0 = matrix[4], bottom = matrix[5], x1 = x0 + Math.abs(item.width);
    const style = content.styles[item.fontName] || {}, font=page.commonObjs.get(item.fontName);
    return [{ x0, x1, top:bottom-height, bottom, text, token:tokens(text)[0],
      size_pt:height, font_name:font?.name || item.fontName || style.fontFamily || '',
      font_family:fontFamily(font?.name || style.fontFamily || item.fontName || ''), color:'#000000',
      bold:emphasis(font?.name || style.fontFamily || item.fontName || '').bold, italic:!!style.italic }];
  });
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
      pages.push({ page_number: number, width_pt: viewport.width, height_pt: viewport.height, words, lines, text_items:textItems(content,viewport,page), links, rectangles: extracted.rectangles, strokes: extracted.strokes, images: extracted.images });
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

function checksum(bytes) {
  const padded = bytes.length % 4 ? Buffer.concat([bytes, Buffer.alloc(4 - bytes.length % 4)]) : bytes;
  let sum = 0;
  for (let i = 0; i < padded.length; i += 4) sum = (sum + padded.readUInt32BE(i)) >>> 0;
  return sum;
}

const macRoman = [
  0x00C4,0x00C5,0x00C7,0x00C9,0x00D1,0x00D6,0x00DC,0x00E1,0x00E0,0x00E2,0x00E4,0x00E3,0x00E5,0x00E7,0x00E9,0x00E8,
  0x00EA,0x00EB,0x00ED,0x00EC,0x00EE,0x00EF,0x00F1,0x00F3,0x00F2,0x00F4,0x00F6,0x00F5,0x00FA,0x00F9,0x00FB,0x00FC,
  0x2020,0x00B0,0x00A2,0x00A3,0x00A7,0x2022,0x00B6,0x00DF,0x00AE,0x00A9,0x2122,0x00B4,0x00A8,0x2260,0x00C6,0x00D8,
  0x221E,0x00B1,0x2264,0x2265,0x00A5,0x00B5,0x2202,0x2211,0x220F,0x03C0,0x222B,0x00AA,0x00BA,0x03A9,0x00E6,0x00F8,
  0x00BF,0x00A1,0x00AC,0x221A,0x0192,0x2248,0x2206,0x00AB,0x00BB,0x2026,0x00A0,0x00C0,0x00C3,0x00D5,0x0152,0x0153,
  0x2013,0x2014,0x201C,0x201D,0x2018,0x2019,0x00F7,0x25CA,0x00FF,0x0178,0x2044,0x20AC,0x2039,0x203A,0xFB01,0xFB02,
  0x2021,0x00B7,0x201A,0x201E,0x2030,0x00C2,0x00CA,0x00C1,0x00CB,0x00C8,0x00CD,0x00CE,0x00CF,0x00CC,0x00D3,0x00D4,
  0xF8FF,0x00D2,0x00DA,0x00DB,0x00D9,0x0131,0x02C6,0x02DC,0x00AF,0x02D8,0x02D9,0x02DA,0x00B8,0x02DD,0x02DB,0x02C7
];

function os2Table(tables, { bold = false, italic = false } = {}) {
  const hhea = tables.find(t => t.tag === 'hhea')?.data;
  const ascent = hhea?.length >= 8 ? hhea.readInt16BE(4) : 800;
  const descent = hhea?.length >= 8 ? Math.abs(hhea.readInt16BE(6)) : 200;
  const lineGap = hhea?.length >= 10 ? hhea.readInt16BE(8) : 0;
  const avgWidth = hhea?.length >= 12 ? hhea.readUInt16BE(10) : 500;
  const table = Buffer.alloc(96);
  table.writeUInt16BE(3, 0);
  table.writeInt16BE(avgWidth, 2);
  table.writeUInt16BE(bold ? 700 : 400, 4);
  table.writeUInt16BE(5, 6);
  table.writeInt16BE(650, 10); table.writeInt16BE(700, 12);
  table.writeInt16BE(650, 18); table.writeInt16BE(700, 20);
  table.writeInt16BE(50, 26); table.writeInt16BE(250, 28);
  table.write('VBOK', 62, 4, 'ascii');
  table.writeUInt16BE((italic ? 1 : 0) | (bold ? 32 : 64), 66);
  table.writeUInt16BE(0x20, 68); table.writeUInt16BE(0xffff, 70);
  table.writeInt16BE(ascent, 72); table.writeInt16BE(-descent, 74); table.writeInt16BE(lineGap, 76);
  table.writeUInt16BE(ascent, 78); table.writeUInt16BE(descent, 80);
  table.writeUInt32BE(1, 82);
  table.writeUInt16BE(0x20, 94);
  return table;
}

function unicodeCmap(cmap) {
  if (!cmap || cmap.length < 4) return cmap;
  const n = cmap.readUInt16BE(2);
  let unicode = false, mac = null;
  for (let i = 0, p = 4; i < n; i++, p += 8) {
    const platform = cmap.readUInt16BE(p), encoding = cmap.readUInt16BE(p + 2), offset = cmap.readUInt32BE(p + 4);
    if (offset + 2 > cmap.length) continue;
    const format = cmap.readUInt16BE(offset);
    if (platform === 3 && (encoding === 1 || encoding === 10) || platform === 0) unicode = true;
    if (platform === 1 && encoding === 0 && format === 0 && cmap.length >= offset + 262) mac = cmap.subarray(offset + 6, offset + 262);
  }
  if (unicode || !mac) return cmap;
  const pairs = [];
  for (let code = 0; code < 256; code++) {
    const glyph = mac[code];
    if (!glyph) continue;
    pairs.push([code < 128 ? code : macRoman[code - 128], glyph]);
  }
  pairs.sort((a, b) => a[0] - b[0]);
  const segments = [];
  for (const [code, glyph] of pairs) {
    const last = segments.at(-1);
    if (last && code === last.end + 1 && glyph === last.startGlyph + (code - last.start)) { last.end = code; continue; }
    segments.push({ start: code, end: code, startGlyph: glyph });
  }
  segments.push({ start: 0xffff, end: 0xffff, startGlyph: 0 });
  const segCount = segments.length, length = 16 + segCount * 8;
  const table = Buffer.alloc(length);
  table.writeUInt16BE(4, 0); table.writeUInt16BE(length, 2);
  table.writeUInt16BE(segCount * 2, 6);
  const entrySelector = Math.floor(Math.log2(segCount));
  table.writeUInt16BE((1 << entrySelector) * 2, 8);
  table.writeUInt16BE(entrySelector, 10);
  table.writeUInt16BE(segCount * 2 - (1 << entrySelector) * 2, 12);
  segments.forEach((s, i) => {
    table.writeUInt16BE(s.end, 14 + i * 2);
    table.writeUInt16BE(s.start, 16 + segCount * 2 + i * 2);
    table.writeUInt16BE((s.startGlyph - s.start) & 0xffff, 16 + segCount * 4 + i * 2);
  });
  const header = Buffer.alloc(4 + (n + 1) * 8);
  header.writeUInt16BE(n + 1, 2);
  header.writeUInt16BE(3, 4); header.writeUInt16BE(1, 6); header.writeUInt32BE(cmap.length + 8, 8);
  for (let i = 0; i < n; i++) {
    header.writeUInt16BE(cmap.readUInt16BE(4 + i * 8), 12 + i * 8);
    header.writeUInt16BE(cmap.readUInt16BE(6 + i * 8), 14 + i * 8);
    header.writeUInt32BE(cmap.readUInt32BE(8 + i * 8) + 8, 16 + i * 8);
  }
  return Buffer.concat([header, cmap.subarray(4 + n * 8), table]);
}

function windowsNameTable(name) {
  if (!name || name.length < 6 || name.readUInt16BE(0) !== 0) return name;
  const count = name.readUInt16BE(2), stringOffset = name.readUInt16BE(4);
  const records = [];
  for (let i = 0; i < count; i++) {
    const p = 6 + i * 12;
    records.push({ platform: name.readUInt16BE(p), encoding: name.readUInt16BE(p + 2), language: name.readUInt16BE(p + 4), id: name.readUInt16BE(p + 6), length: name.readUInt16BE(p + 8), offset: name.readUInt16BE(p + 10) });
  }
  if (records.some(r => r.platform === 3 && r.encoding === 1)) return name;
  const extras = [];
  for (const record of records.filter(r => r.platform === 1 && r.encoding === 0 && r.id <= 16)) {
    const text = name.subarray(stringOffset + record.offset, stringOffset + record.offset + record.length);
    extras.push({ platform: 3, encoding: 1, language: 0x0409, id: record.id, bytes: Buffer.from(text.toString('latin1'), 'utf16le').swap16() });
  }
  if (!extras.length) return name;
  const strings = [name.subarray(stringOffset)];
  let extraOffset = name.length - stringOffset;
  for (const extra of extras) { extra.offset = extraOffset; extra.length = extra.bytes.length; strings.push(extra.bytes); extraOffset += extra.bytes.length; }
  const out = Buffer.alloc(6 + (count + extras.length) * 12 + extraOffset);
  out.writeUInt16BE(count + extras.length, 2);
  out.writeUInt16BE(6 + (count + extras.length) * 12, 4);
  name.copy(out, 6, 6, 6 + count * 12);
  extras.forEach((extra, i) => {
    const p = 6 + (count + i) * 12;
    out.writeUInt16BE(extra.platform, p); out.writeUInt16BE(extra.encoding, p + 2); out.writeUInt16BE(extra.language, p + 4);
    out.writeUInt16BE(extra.id, p + 6); out.writeUInt16BE(extra.length, p + 8); out.writeUInt16BE(extra.offset, p + 10);
  });
  Buffer.concat(strings).copy(out, 6 + (count + extras.length) * 12);
  return out;
}

function rebuildTrueType(tables) {
  tables.sort((a, b) => a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0);
  const n = tables.length, entrySelector = Math.floor(Math.log2(n)), searchRange = (1 << entrySelector) * 16;
  let cursor = 12 + n * 16;
  for (const table of tables) {
    table.offset = cursor;
    table.length = table.data.length;
    table.checksum = checksum(table.data);
    cursor += table.data.length + (4 - table.data.length % 4) % 4;
  }
  const out = Buffer.alloc(cursor);
  out.writeUInt32BE(0x00010000, 0);
  out.writeUInt16BE(n, 4);
  out.writeUInt16BE(searchRange, 6);
  out.writeUInt16BE(entrySelector, 8);
  out.writeUInt16BE(n * 16 - searchRange, 10);
  tables.forEach((table, i) => {
    const offset = 12 + i * 16;
    out.write(table.tag, offset, 4, 'ascii');
    out.writeUInt32BE(table.checksum >>> 0, offset + 4);
    out.writeUInt32BE(table.offset, offset + 8);
    out.writeUInt32BE(table.length, offset + 12);
    table.data.copy(out, table.offset);
  });
  const head = tables.find(t => t.tag === 'head');
  if (head?.data.length >= 12) {
    out.writeUInt32BE(0, head.offset + 8);
    out.writeUInt32BE((0xB1B0AFBA - checksum(out)) >>> 0, head.offset + 8);
  }
  return out;
}

export function browserLoadableTrueType(bytes, flags = {}) {
  const input = Buffer.from(bytes);
  if (input.length < 12) return input;
  const scaler = input.readUInt32BE(0);
  if (scaler !== 0x00010000 && scaler !== 0x74727565) return input;
  const count = input.readUInt16BE(4);
  const tables = [];
  for (let i = 0, offset = 12; i < count; i++, offset += 16) {
    const tag = input.subarray(offset, offset + 4).toString('ascii');
    const start = input.readUInt32BE(offset + 8), length = input.readUInt32BE(offset + 12);
    if (start + length > input.length) return input;
    tables.push({ tag, data: Buffer.from(input.subarray(start, start + length)) });
  }
  const cmap = tables.find(t => t.tag === 'cmap');
  if (cmap) cmap.data = unicodeCmap(cmap.data);
  const name = tables.find(t => t.tag === 'name');
  if (name) name.data = windowsNameTable(name.data);
  if (!tables.some(t => t.tag === 'OS/2')) tables.push({ tag: 'OS/2', data: os2Table(tables, flags) });
  return rebuildTrueType(tables);
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
    const extracted = (await run('qpdf', [`--show-object=${stream.split(' ')[0]}`, '--filtered-stream-data', path], { encoding: 'buffer' })).stdout;
    const flags = emphasis(name);
    const bytes = extension === 'ttf' ? browserLoadableTrueType(extracted, flags) : extracted;
    const digest = createHash('sha256').update(extracted).digest('hex').slice(0, 12);
    const familyName = name.split('+').at(-1).replace(/[-_ ]?(?:regular|roman|bold|semibold|demibold|italic|oblique)$/i, '').toLowerCase();
    const familyDigest = createHash('sha256').update(familyName).digest('hex').slice(0, 12);
    await writeFile(resolve(destination, `font-${digest}.${extension}`), bytes);
    fonts.set(name, { source_name: name, css_family: `pdf-font-${familyDigest}`, href: `fonts/font-${digest}.${extension}`, weight: flags.bold ? 700 : 400, style: flags.italic ? 'italic' : 'normal' });
  }
  return [...fonts.values()];
}
