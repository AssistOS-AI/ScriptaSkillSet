import { tokens, median, dominant, round, clamp } from './common.mjs';
import { text, blockWords, setStyle } from './dom.mjs';
const min = (items, key) => Math.min(...items.map(item => item[key]));
const max = (items, key) => Math.max(...items.map(item => item[key]));

export function sourceBorder(strokes, side, coordinate, start, end) {
  const candidates = [];
  for (const stroke of strokes) {
    const tolerance = Math.max(1, stroke.width), horizontal = ['top', 'bottom'].includes(side);
    if (Math.abs(horizontal ? stroke.bottom - stroke.top : stroke.x1 - stroke.x0) > tolerance) continue;
    const position = horizontal ? (stroke.top + stroke.bottom) / 2 : (stroke.x0 + stroke.x1) / 2;
    const overlap = horizontal ? Math.min(stroke.x1, end) - Math.max(stroke.x0, start) : Math.min(stroke.bottom, end) - Math.max(stroke.top, start);
    const distance = Math.abs(position - coordinate);
    if (distance <= tolerance && overlap >= Math.max(1, (end - start) * 0.5)) candidates.push({ distance, overlap, stroke });
  }
  const candidate = candidates.sort((a, b) => a.distance - b.distance || b.overlap - a.overlap)[0];
  return candidate ? `${Math.max(0.5, candidate.stroke.width).toFixed(2)}pt solid ${candidate.stroke.color}` : '0';
}

export function tableGeometry($, section, page, aligned) {
  if (!page.rectangles.length) return;
  for (const table of $(section).find('table').toArray()) {
    const rectangles = new Map(), contents = new Map();
    for (const cell of $(table).find('th,td').toArray()) {
      const words = blockWords(cell, page, aligned);
      if (!words.length) continue;
      contents.set(cell, words);
      const candidates = page.rectangles.filter(rectangle => words.every(word => {
        const x = (word.x0 + word.x1) / 2, y = (word.top + word.bottom) / 2;
        return x >= rectangle.x0 - 0.75 && x <= rectangle.x1 + 0.75 && y >= rectangle.top - 0.75 && y <= rectangle.bottom + 0.75;
      }));
      candidates.sort((a, b) => (a.x1 - a.x0) * (a.bottom - a.top) - (b.x1 - b.x0) * (b.bottom - b.top));
      if (candidates.length) rectangles.set(cell, candidates[0]);
    }
    if (rectangles.size < 2) continue;
    const selected = [...rectangles.values()];
    const left = min(selected, 'x0'), right = max(selected, 'x1'), top = min(selected, 'top'), bottom = max(selected, 'bottom');
    const strokes = page.strokes.filter(stroke => stroke.x1 >= left - 1 && stroke.x0 <= right + 1 && stroke.bottom >= top - 1 && stroke.top <= bottom + 1);
    setStyle(table, 'table-layout', 'fixed'); setStyle(table, 'border-collapse', 'collapse');
    const content = page.words.filter(word => word.top < page.height_pt * 0.93);
    if (content.length) {
      const contentLeft = min(content, 'x0'), contentRight = max(content, 'x1'), width = contentRight - contentLeft;
      if (width > 0) {
        const leftRatio = Math.max(0, (left - contentLeft) / width), rightRatio = Math.max(0, (contentRight - right) / width);
        setStyle(table, 'width', `${(Math.max(0, 1 - leftRatio - rightRatio) * 100).toFixed(2)}%`);
        setStyle(table, 'margin-left', `${(leftRatio * 100).toFixed(2)}%`);
        setStyle(table, 'margin-right', `${(rightRatio * 100).toFixed(2)}%`);
      }
    }
    const rows = $(table).find('tr').toArray();
    let reference = [], columns = [];
    for (const row of rows) {
      const cells = $(row).children('th,td').toArray();
      if (cells.length > reference.length && cells.every(cell => rectangles.has(cell))) reference = cells;
    }
    if (reference.length) {
      columns = reference.map(cell => [rectangles.get(cell).x0, rectangles.get(cell).x1]);
      const widths = columns.map(([left, right]) => right - left), total = widths.reduce((a, b) => a + b, 0);
      $(table).children('colgroup').remove();
      const group = $('<colgroup></colgroup>');
      for (const width of widths) group.append($('<col>').attr('style', `width: ${(width / total * 100).toFixed(2)}%`));
      $(table).prepend(group);
    }
    const boundaries = [...new Set(selected.flatMap(rectangle => [round(rectangle.top, 2), round(rectangle.bottom, 2)]))].sort((a, b) => a - b);
    const inferred = boundaries.length === rows.length + 1 ? boundaries.slice(1).map((value, index) => [boundaries[index], value]) : [];
    const caption = $(table).children('caption').first()[0];
    if (caption) {
      const words = blockWords(caption, page, aligned);
      if (words.length) {
        const offset = min(words, 'x0') - left;
        if (offset >= 0) setStyle(caption, 'padding-left', `${offset.toFixed(2)}pt`);
        else { setStyle(caption, 'position', 'relative'); setStyle(caption, 'left', `${offset.toFixed(2)}pt`); }
        setStyle(caption, 'text-align', 'left');
      }
    }
    rows.forEach((row, rowIndex) => {
      const cells = $(row).children('th,td').toArray(), rowRectangles = cells.map(cell => rectangles.get(cell)).filter(Boolean), bounds = inferred[rowIndex];
      if (bounds) setStyle(row, 'height', `${(bounds[1] - bounds[0]).toFixed(2)}pt`);
      else if (rowRectangles.length) setStyle(row, 'height', `${Math.max(...rowRectangles.map(rectangle => rectangle.bottom - rectangle.top)).toFixed(2)}pt`);
      cells.forEach((cell, index) => {
        const rectangle = rectangles.get(cell), words = contents.get(cell) ?? [];
        if (!words.length) return;
        let x0, x1, y0, y1;
        if (rectangle) { x0 = rectangle.x0; x1 = rectangle.x1; y0 = rectangle.top; y1 = rectangle.bottom; }
        else if (bounds && columns[index]) { [x0, x1] = columns[index]; [y0, y1] = bounds; }
        else return;
        const leftPadding = clamp(min(words, 'x0') - x0, 0, 8), topPadding = clamp(min(words, 'top') - y0, 0, 8), bottomPadding = clamp(y1 - max(words, 'bottom'), 0, 8);
        if (rectangle) setStyle(cell, 'background-color', rectangle.fill_color);
        setStyle(cell, 'border', '0');
        for (const [side, coordinate, start, end] of [['top', y0, x0, x1], ['right', x1, y0, y1], ['bottom', y1, x0, x1], ['left', x0, y0, y1]]) setStyle(cell, `border-${side}`, sourceBorder(strokes, side, coordinate, start, end));
        const [color, count] = dominant(words.map(word => word.color));
        if (count / words.length >= 0.75) setStyle(cell, 'color', color);
        setStyle(cell, 'padding', `${topPadding.toFixed(2)}pt ${leftPadding.toFixed(2)}pt ${bottomPadding.toFixed(2)}pt ${leftPadding.toFixed(2)}pt`);
        const tops = [...new Set(words.map(word => round(word.top, 2)))].sort((a, b) => a - b);
        if (tops.length > 1) {
          const size = median(words.map(word => word.size_pt));
          if (size > 0) setStyle(cell, 'line-height', clamp(median(tops.slice(1).map((top, index) => top - tops[index])) / size, 1, 1.5).toFixed(3));
        }
        const groups = new Map();
        for (const word of words) { const top = round(word.top, 1); if (!groups.has(top)) groups.set(top, []); groups.get(top).push(word); }
        if ([...groups.values()].every(line => Math.abs((min(line, 'x0') - x0) - (x1 - max(line, 'x1'))) <= 2)) setStyle(cell, 'text-align', 'center');
      });
    });
  }
}

export function repairSingleColumnTables($, section, page) {
  for (const table of $(section).find('table').toArray()) {
    const rows = $(table).find('tr').toArray();
    if (!rows.length || rows.some(row => $(row).children('td,th').length !== 1)) continue;
    const target = tokens(text(table));
    if (!target.length) continue;
    let matched;
    for (let start = 0; start < page.lines.length && !matched; start += 1) {
      const collected = [];
      for (let end = start; end < page.lines.length; end += 1) {
        collected.push(...tokens(page.lines[end].text));
        if (collected.length === target.length && collected.every((value, index) => value === target[index])) { matched = page.lines.slice(start, end + 1); break; }
        if (collected.length >= target.length || collected.some((value, index) => value !== target[index])) break;
      }
    }
    if (!matched || matched.length <= rows.length) continue;
    const body = $(table).find('tbody').first().length ? $(table).find('tbody').first() : $(table);
    rows.forEach(row => $(row).remove());
    for (const line of matched) body.append($('<tr></tr>').append($('<td></td>').text(line.text)));
  }
}

export function repairContinuedHeaders($, main) {
  function boundary(section, first) {
    const children = $(section).children().toArray(), block = first ? children[0] : children.at(-1);
    if (block?.name === 'table') return block;
    return block && $(block).hasClass('table-scroll') ? $(block).children('table').first()[0] : null;
  }
  const sections = $(main).children('section.source-page').toArray();
  for (let index = 1; index < sections.length; index += 1) {
    const previous = boundary(sections[index - 1], false), current = boundary(sections[index], true);
    if (!previous || !current) continue;
    const rowsA = $(previous).find('tr').toArray(), rowsB = $(current).find('tr').toArray();
    if (!rowsA.length || rowsB.length < 2) continue;
    const a = $(rowsA[0]).children('th,td').toArray(), last = $(rowsA.at(-1)).children('th,td').toArray(), b = $(rowsB[0]).children('th,td').toArray(), next = $(rowsB[1]).children('th,td').toArray();
    if (!b.length || b.some(cell => cell.name !== 'th') || [...last, ...next].some(cell => cell.name !== 'td') || new Set([a.length, last.length, b.length, next.length]).size !== 1) continue;
    if (a.every((cell, index) => text(cell).toLowerCase() === text(b[index]).toLowerCase())) continue;
    for (const cell of b) cell.name = 'td';
  }
}
