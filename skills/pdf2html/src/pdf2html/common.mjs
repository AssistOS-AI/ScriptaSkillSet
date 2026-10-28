export const median = values => {
  if (!values.length) throw new Error('Cannot take the median of an empty collection.');
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
};
export const expandLigatures = text => String(text).replace(/[ﬀ-ﬆ]/gu, character => ({'ﬀ':'ff','ﬁ':'fi','ﬂ':'fl','ﬃ':'ffi','ﬄ':'ffl','ﬅ':'st','ﬆ':'st'})[character]);
export const tokens = text => expandLigatures(text).toLowerCase().replaceAll('\u00ad', '').replaceAll('ß', 'ss').replaceAll('ς', 'σ').match(/[\p{L}\p{N}_]+/gu) ?? [];
export const wordMatches = text => [...String(text).matchAll(/[\p{L}\p{N}_]+/gu)];
export const counter = values => {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
};
export const dominant = values => [...counter(values)].sort((a, b) => b[1] - a[1])[0];
export const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export const round = (value, places = 0) => Number(value.toFixed(places));
export const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

/** Matching blocks with the same longest-contiguous-match and earliest-tie rules as SequenceMatcher. */
export function matchingBlocks(a, b, { autojunk = false } = {}) {
  const positions = new Map();
  b.forEach((value, index) => {
    if (!positions.has(value)) positions.set(value, []);
    positions.get(value).push(index);
  });
  if (autojunk && b.length >= 200) for (const [value, indexes] of positions) if (indexes.length > Math.floor(b.length / 100) + 1) positions.delete(value);
  const blocks = [];
  const ranges = [[0, a.length, 0, b.length]];
  while (ranges.length) {
    const [alo, ahi, blo, bhi] = ranges.pop();
    let startA = alo, startB = blo, length = 0, previous = new Map();
    for (let i = alo; i < ahi; i += 1) {
      const current = new Map();
      for (const j of positions.get(a[i]) ?? []) {
        if (j < blo) continue;
        if (j >= bhi) break;
        const size = (previous.get(j - 1) ?? 0) + 1;
        current.set(j, size);
        if (size > length) { startA = i - size + 1; startB = j - size + 1; length = size; }
      }
      previous = current;
    }
    while (startA > alo && startB > blo && a[startA - 1] === b[startB - 1]) { startA -= 1; startB -= 1; length += 1; }
    while (startA + length < ahi && startB + length < bhi && a[startA + length] === b[startB + length]) length += 1;
    if (!length) continue;
    blocks.push([startA, startB, length]);
    if (alo < startA && blo < startB) ranges.push([alo, startA, blo, startB]);
    if (startA + length < ahi && startB + length < bhi) ranges.push([startA + length, ahi, startB + length, bhi]);
  }
  blocks.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  const merged = [];
  for (const block of blocks) {
    const last = merged.at(-1);
    if (last && last[0] + last[2] === block[0] && last[1] + last[2] === block[1]) last[2] += block[2];
    else merged.push([...block]);
  }
  return [...merged, [a.length, b.length, 0]];
}
