import { tokens, counter, median, clamp } from './common.mjs';
import { text, setStyle, addClass } from './dom.mjs';

function stableRatio(values, minimumCount, minimumShare) {
  if (!values.length) return null;
  const [dominant, count] = [...counter(values.map(value => Number(value.toFixed(3))))].sort((a, b) => b[1] - a[1])[0];
  if (count < minimumCount || count / values.length < minimumShare) return null;
  return median(values.filter(value => Math.abs(value - dominant) <= 0.0015));
}
export function documentGeometry(evidence) {
  const rights = [], lefts = [], indents = [], size = evidence.typography.body_size_pt;
  for (const page of evidence.pages) for (const line of page.lines) {
    if (Math.abs(line.size_pt - size) > 0.75 || line.top >= page.height_pt * 0.92 || line.x0 >= page.width_pt * 0.3) continue;
    if (line.x1 - line.x0 >= page.width_pt * 0.6) rights.push(line.x1 / page.width_pt);
    if (line.x1 - line.x0 >= page.width_pt * 0.45) lefts.push(line.x0 / page.width_pt);
  }
  const right = stableRatio(rights, 8, 0.2), left = stableRatio(lefts, 4, 0.15);
  if (left !== null) for (const page of evidence.pages) for (const line of page.lines) {
    const indent = line.x0 - left * page.width_pt;
    if (Math.abs(line.size_pt - size) <= 0.75 && line.top < page.height_pt * 0.92 && indent >= Math.max(0.6 * size, 4) && indent <= Math.max(4 * size, 24) && line.x1 - line.x0 >= page.width_pt * 0.25) indents.push(indent / page.width_pt);
  }
  return { right, left, indent: stableRatio(indents, 4, 0.35) };
}

export function repairParagraphs($, section, page, rightRatio = null) {
  const flat = [], owners = [];
  page.lines.forEach((line, index) => { const values = tokens(line.text); flat.push(...values); owners.push(...values.map(() => index)); });
  function locate(paragraph) {
    const target = tokens(text(paragraph));
    if (!target.length) return null;
    for (let start = 0; start <= flat.length - target.length; start += 1) if (target.every((value, index) => flat[start + index] === value)) return [...new Set(owners.slice(start, start + target.length))];
    return null;
  }
  const expected = rightRatio !== null ? rightRatio * page.width_pt : null;
  if (expected !== null) {
    let merged;
    do {
      merged = false;
      const paragraphs = $(section).children('p').toArray();
      for (let index = 0; index < paragraphs.length - 1; index += 1) {
        const current = paragraphs[index], next = paragraphs[index + 1];
        if ($(current).find('*').length || $(next).find('*').length || $(current).next()[0] !== next) continue;
        const a = locate(current), b = locate(next);
        if (!a?.length || !b?.length) continue;
        const last = page.lines[a.at(-1)], first = page.lines[b[0]];
        if (b[0] === a.at(-1) + 1 && last.x1 >= expected - 2.5 && !/[.!?]["'”’)\]]*\s*$/u.test(last.text) && first.top - last.top <= Math.max(last.size_pt, first.size_pt) * 1.7) {
          $(current).text(`${text(current)} ${text(next)}`); $(next).remove(); merged = true; break;
        }
      }
    } while (merged);
  }
  for (const paragraph of $(section).children('p').toArray()) {
    if ($(paragraph).find('*').length) continue;
    const value = text(paragraph), target = tokens(value);
    if (target.length < (rightRatio !== null ? 4 : 20)) continue;
    const used = locate(paragraph);
    if (!used || used.length < (rightRatio !== null ? 2 : 4)) continue;
    const lines = used.map(index => page.lines[index]);
    const right = expected ?? Math.max(...lines.map(line => line.x1));
    if (rightRatio === null && lines.filter(line => Math.abs(line.x1 - right) <= 2.5).length < Math.max(2, Math.floor(lines.length / 12))) continue;
    const size = median(lines.map(line => line.size_pt).filter(size => size > 0));
    const shortfall = rightRatio !== null ? Math.max(0.45 * size, 4) : Math.max(0.75 * size, 6);
    const boundaries = []; let consumed = 0;
    for (const line of lines.slice(0, -1)) { consumed += tokens(line.text).length; if (line.x1 < right - shortfall) boundaries.push(consumed); }
    if (!boundaries.length) continue;
    const matches = [...value.matchAll(/[\p{L}\p{N}_]+/gu)];
    if (matches.length !== target.length) continue;
    const offsets = boundaries.map(boundary => {
      let offset = matches[boundary].index;
      while (offset > 0 && `"'“‘([`.includes(value[offset - 1])) offset -= 1;
      return offset;
    });
    const ranges = [0, ...offsets, value.length], fragments = [];
    const gaps = lines.slice(1).map((line, index) => line.top - lines[index].top).filter(gap => gap > 0);
    const height = gaps.length && size > 0 ? clamp(median(gaps) / size, 1, 1.6) : 1.45;
    for (let index = 0; index < ranges.length - 1; index += 1) {
      const fragmentText = value.slice(ranges[index], ranges[index + 1]).trim();
      if (!fragmentText) continue;
      const fragment = $('<p></p>').attr({ ...paragraph.attribs }).text(fragmentText)[0];
      addClass(fragment, 'source-paragraph-repaired'); setStyle(fragment, 'line-height', height.toFixed(3)); setStyle(fragment, 'margin-bottom', '0');
      $(paragraph).before(fragment); fragments.push(fragment);
    }
    if (fragments.length > 1) $(paragraph).remove();
    else fragments.forEach(fragment => $(fragment).remove());
  }
}
