import { tokens } from './common.mjs';
import { alignment, blockWords, setStyle } from './dom.mjs';

// Recover a source label only when a ruled, bold display line precedes the
// first recognized text. Running headers and image text are excluded.
export function recoverSourceHeading($, section, page, evidence) {
  if ($(section).find('figure').length) return;
  const aligned = alignment(page, section);
  const matched = [...aligned.mapping.keys()].map(index => page.words[index]);
  if (!matched.length) return;
  const firstTop = Math.min(...matched.map(word => word.top));
  for (const line of page.lines) {
    if (line.bottom >= firstTop || !/\p{L}/u.test(line.text) || line.text !== line.text.toUpperCase()) continue;
    const key = tokens(line.text).join(' ');
    const occurrences = evidence.pages.filter(other => other.lines.some(candidate =>
      Math.abs(candidate.top - line.top) < 3 && tokens(candidate.text).join(' ') === key));
    if (occurrences.length > 1) continue;
    const indexes = page.words.flatMap((word, index) =>
      word.top >= line.top - 1 && word.bottom <= line.bottom + 1 && word.x0 >= line.x0 - 1 && word.x1 <= line.x1 + 1 ? [index] : []);
    if (!indexes.length || indexes.some(index => aligned.mapping.has(index) || !page.words[index].bold)) continue;
    const rule = page.strokes.find(stroke => stroke.top >= line.bottom && stroke.bottom < firstTop &&
      stroke.bottom - stroke.top <= 1 && stroke.x1 - stroke.x0 >= page.width_pt * 0.5 &&
      stroke.x0 <= line.x0 + 2 && stroke.x1 >= line.x1 - 2);
    if (!rule) continue;
    const label = $('<p></p>').text(line.text);
    $(section).prepend(label);
    return;
  }
}

export function sourceDisplayGeometry($, section, page, aligned, bodySize) {
  const blocks = $(section).children('h1,h2,h3,h4,h5,h6,p').toArray();
  for (let index = 0; index < blocks.length - 1; index += 1) {
    const block = blocks[index], next = blocks[index + 1];
    const words = blockWords(block, page, aligned), following = blockWords(next, page, aligned);
    if (!words.length || !following.length || !/^h[1-6]$/.test(next.name)) continue;
    const bottom = Math.max(...words.map(word => word.bottom)), top = Math.min(...following.map(word => word.top));
    const rule = page.strokes.find(stroke => stroke.top >= bottom && stroke.bottom < top &&
      stroke.bottom - stroke.top <= 1 && stroke.x1 - stroke.x0 >= page.width_pt * 0.5);
    if (!rule || !words.every(word => word.bold) || new Set(words.map(word => Math.round(word.top))).size !== 1) continue;
    if (index === 0) setStyle(section, '--pdf-page-top', `${(Math.min(...words.map(word => word.top)) / page.width_pt * 100).toFixed(2)}%`);
    setStyle(block, 'line-height', '1');
    setStyle(block, 'padding-bottom', `calc(var(--pdf-reader-size) * ${((rule.top - bottom) / bodySize).toFixed(4)})`);
    setStyle(block, 'border-bottom', `${Math.max(0.5, rule.width).toFixed(2)}pt solid ${rule.color}`);
    setStyle(block, 'margin-bottom', `calc(var(--pdf-reader-size) * ${((top - rule.bottom) / bodySize).toFixed(4)})`);
    setStyle(next, 'margin-top', '0');
  }
}
