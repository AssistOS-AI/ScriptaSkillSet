import { median, dominant, counter, clamp, round } from './common.mjs';
import { blockNames, flowNames, blockWords, setStyle, relativeSize, text } from './dom.mjs';
import { fontStack } from './styles.mjs';

function linesOf(words, tolerance = 1) {
  const lines = [];
  for (const word of [...words].sort((a, b) => a.top - b.top || a.x0 - b.x0)) {
    if (!lines.length || Math.abs(word.top - lines.at(-1)[0].top) > tolerance) lines.push([word]);
    else lines.at(-1).push(word);
  }
  return lines;
}
const min = (words, key) => Math.min(...words.map(word => word[key]));
const max = (words, key) => Math.max(...words.map(word => word[key]));

export function formatBlocks($, section, page, aligned, profile, fonts) {
  $(section).find('h1,h2,h3,h4,h5,h6').each((_, block) => {
    const words = blockWords(block, page, aligned);
    if (!words.length) { block.name = 'p'; return; }
    const size = median(words.map(word => word.size_pt)), ratio = profile.body_size_pt ? size / profile.body_size_pt : 1;
    block.name = ratio >= 1.8 ? 'h1' : ratio >= 1.35 ? 'h2' : ratio >= 1.12 ? 'h3' : 'p';
    setStyle(block, 'font-size', relativeSize(size, profile.body_size_pt));
  });
  const faces = new Map(fonts.map(font => [font.source_name, font]));
  $(section).find(blockNames).each((_, block) => {
    const words = blockWords(block, page, aligned);
    if (!words.length) return;
    const size = median(words.map(word => word.size_pt));
    if (block.name.startsWith('h') && size > 0) {
      if (words.every(word => !word.bold)) setStyle(block, 'font-weight', '400');
      const tops = [...new Set(words.map(word => round(word.top, 1)))].sort((a, b) => a - b);
      const height = tops.length === 1 ? (max(words, 'bottom') - min(words, 'top')) / size : median(tops.slice(1).map((top, index) => top - tops[index])) / size;
      setStyle(block, 'line-height', clamp(height, 0.9, 1.5).toFixed(3));
    }
    if (Math.abs(size - profile.body_size_pt) >= 0.5) setStyle(block, 'font-size', relativeSize(size, profile.body_size_pt));
    const [name, nameCount] = dominant(words.map(word => word.font_name).filter(Boolean)) ?? ['', 0];
    const [family, familyCount] = dominant(words.map(word => word.font_family));
    const [color, colorCount] = dominant(words.map(word => word.color));
    if (faces.has(name) && nameCount / words.length >= 0.75 && (name !== profile.body_font_name || block.name.startsWith('h'))) setStyle(block, 'font-family', `"${faces.get(name).css_family}", ${fontStack(family)}`);
    else if (familyCount / words.length >= 0.75 && (family !== profile.body_family || block.name.startsWith('h'))) setStyle(block, 'font-family', fontStack(family));
    if (colorCount / words.length >= 0.75 && color.toLowerCase() !== profile.text_color.toLowerCase()) setStyle(block, 'color', color);
  });
  $(section).find('p').each((_, block) => {
    const words = blockWords(block, page, aligned);
    if (!words.length || new Set(words.map(word => round(word.top, 1))).size < 2) return;
    const height = max(words, 'bottom') - min(words, 'top');
    if (height > 0) setStyle(block, 'min-height', `${height.toFixed(2)}pt`);
  });
}

export function alignBlocks($, section, page, aligned) {
  const counts = counter(linesOf(page.words).map(line => round(min(line, 'x0'), 1)));
  const common = [...counts].filter(([left, count]) => count >= 2 && left < page.width_pt * 0.25).map(([left]) => left);
  $(section).find(`${flowNames},caption,figcaption`).each((_, block) => {
    const words = blockWords(block, page, aligned);
    if (!words.length) return;
    const bounds = linesOf(words).map(line => [min(line, 'x0'), max(line, 'x1')]);
    const centered = bounds.every(([left, right]) => Math.abs((left + right) / 2 - page.width_pt / 2) / page.width_pt < 0.035);
    const compact = bounds.every(([left, right]) => (right - left) / page.width_pt < 0.7);
    const letters = text(block).match(/\p{L}/gu)?.join('') ?? '';
    const uppercase = Boolean(letters) && letters === letters.toUpperCase();
    const indented = block.name === 'p' && common.some(left => Math.abs(bounds[0][0] - left) <= 1.5);
    if (centered && (compact || uppercase) && (uppercase || !indented)) setStyle(block, 'text-align', 'center');
    else if (block.name === 'caption') setStyle(block, 'text-align', 'left');
  });
}

export function indentParagraphs($, section, page, aligned, bodyLeft, firstIndent, bodySize) {
  if (bodyLeft === null || firstIndent === null) return;
  const left = bodyLeft * page.width_pt, expected = (bodyLeft + firstIndent) * page.width_pt;
  const tolerance = Math.max(1.5, 0.2 * firstIndent * page.width_pt);
  $(section).find('p').each((_, paragraph) => {
    if ($(paragraph).parents('table,figure,nav,li,aside').length || paragraph.attribs.style?.toLowerCase().includes('text-align: center')) return;
    const words = blockWords(paragraph, page, aligned), sizes = words.map(word => word.size_pt).filter(size => size > 0);
    if (!sizes.length || Math.abs(median(sizes) - bodySize) > 0.75) return;
    const groups = new Map();
    for (const word of [...words].sort((a, b) => a.top - b.top || a.x0 - b.x0)) {
      const top = round(word.top, 1);
      if (!groups.has(top)) groups.set(top, []);
      groups.get(top).push(word);
    }
    const lines = [...groups.values()];
    if (Math.abs(min(lines[0], 'x0') - expected) > tolerance) return;
    if (lines.length > 1 && !lines.slice(1).some(line => Math.abs(min(line, 'x0') - left) <= tolerance)) return;
    setStyle(paragraph, 'text-indent', `${(firstIndent * page.width_pt).toFixed(2)}pt`);
  });
}

export function displayRhythm($, section, page, aligned) {
  const blocks = $(section).children(flowNames).toArray().filter(block => block.attribs.style?.toLowerCase().includes('text-align: center')).map(block => [block, blockWords(block, page, aligned)]).filter(([, words]) => words.length);
  if (blocks.length < 2 || (blocks.length < 3 && !page.strokes.some(stroke => stroke.x1 - stroke.x0 >= page.width_pt * 0.5))) return;
  for (const [block, words] of blocks) {
    if (new Set(words.map(word => round(word.top, 1))).size === 1) {
      const size = median(words.map(word => word.size_pt).filter(size => size > 0));
      const height = max(words, 'bottom') - min(words, 'top');
      if (size > 0 && height > 0) setStyle(block, 'line-height', clamp(height / size, 0.9, 1.5).toFixed(3));
    }
    setStyle(block, 'margin-top', '0');
  }
  for (let index = 0; index < blocks.length - 1; index += 1) {
    const [block, words] = blocks[index], [next, nextWords] = blocks[index + 1];
    if ($(block).nextAll(flowNames).first()[0] !== next) continue;
    const bottom = max(words, 'bottom'), top = min(nextWords, 'top');
    const stroke = page.strokes.filter(stroke => bottom <= stroke.top && stroke.top <= top && stroke.x1 - stroke.x0 >= page.width_pt * 0.5).sort((a, b) => a.top - b.top)[0];
    if (stroke) {
      setStyle(block, 'padding-bottom', `${Math.max(0, stroke.top - bottom).toFixed(2)}pt`);
      setStyle(block, 'border-bottom', `${Math.max(0.5, stroke.width).toFixed(2)}pt solid ${stroke.color}`);
    }
    setStyle(block, 'margin-bottom', `${Math.max(0, top - (stroke?.bottom ?? bottom)).toFixed(2)}pt`);
  }
}

export function headingRules($, section, page, aligned) {
  $(section).children('h1,h2,h3,h4,h5,h6').each((_, heading) => {
    const next = $(heading).next()[0];
    if (!next) return;
    const words = blockWords(heading, page, aligned), nextWords = blockWords(next, page, aligned);
    if (!words.length || !nextWords.length) return;
    const bottom = max(words, 'bottom'), top = min(nextWords, 'top');
    const stroke = page.strokes.filter(stroke => bottom <= stroke.top && stroke.top <= stroke.bottom && stroke.bottom <= top && stroke.bottom - stroke.top <= 1 && stroke.x1 - stroke.x0 >= page.width_pt * 0.5 && stroke.x0 <= min(words, 'x0') + 2 && stroke.x1 >= max(words, 'x1') - 2).sort((a, b) => a.top - b.top)[0];
    if (!stroke) return;
    setStyle(heading, 'padding-bottom', `${(stroke.top - bottom).toFixed(2)}pt`);
    setStyle(heading, 'border-bottom', `${Math.max(0.5, stroke.width).toFixed(2)}pt solid ${stroke.color}`);
    setStyle(heading, 'margin-bottom', `${(top - stroke.bottom).toFixed(2)}pt`);
  });
}
