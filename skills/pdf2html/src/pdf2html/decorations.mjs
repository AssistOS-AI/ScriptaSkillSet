import { blockWords, setStyle } from './dom.mjs';

// Reuse PDF.js strokes. No second PDF parser and no phrase-specific rules.
export function paragraphBorders(evidence) {
  const borders = [], unresolved = [], horizontalRules = [];
  for (const page of evidence.pages) {
    const strokes = page.strokes || [], merged = [];
    for(const stroke of strokes.filter(s=>s.x1-s.x0>20&&Math.abs(s.bottom-s.top)<.2)){
      const crosses=strokes.some(s=>Math.abs(s.x1-s.x0)<.2&&s.bottom-s.top>2&&s.x0>=stroke.x0-1&&s.x0<=stroke.x1+1&&s.top<=stroke.top+1&&s.bottom>=stroke.top-1);
      if(!crosses&&stroke.top>page.height_pt*.06&&stroke.top<page.height_pt*.9)horizontalRules.push({page:page.page_number,...stroke});
    }
    for (const stroke of strokes.filter(s => Math.abs(s.x1 - s.x0) < 0.1 && s.bottom - s.top > 2).sort((a, b) => a.x0 - b.x0 || a.top - b.top)) {
      const prior = merged.find(s => Math.abs(s.x0 - stroke.x0) < 0.2 && s.color === stroke.color && Math.abs(s.width - stroke.width) < 0.1 && stroke.top <= s.bottom + 1.1 && stroke.bottom >= s.top);
      if (prior) prior.bottom = Math.max(prior.bottom, stroke.bottom);
      else merged.push({ ...stroke });
    }
    for (const stroke of merged) {
      // Closed/table rules are owned by tableGeometry, not paragraph decoration.
      if (strokes.some(s => s.x1 - s.x0 > 2 && s.bottom - s.top < 0.2 && s.x0 <= stroke.x0 + 1 && s.x1 >= stroke.x0 - 1 && s.top >= stroke.top - 1 && s.top <= stroke.bottom + 1)) continue;
      if (stroke.top < page.height_pt * 0.07 || stroke.bottom > page.height_pt * 0.95) continue;
      const lines = page.lines.filter(l => l.top >= stroke.top - 1 && l.bottom <= stroke.bottom + 1 && l.x0 > stroke.x1 && l.x0 - stroke.x1 < l.size_pt * 3);
      const nearby = page.lines.filter(l => l.text.trim() && l.top > page.height_pt * 0.07 && l.bottom < page.height_pt * 0.95);
      if (!lines.length) { unresolved.push({ page: page.page_number, stroke, reason: 'No unambiguous text beside vertical stroke' }); continue; }
      const size = lines.map(l => l.size_pt).sort((a,b) => a-b)[Math.floor(lines.length / 2)];
      const left = Math.min(...nearby.map(l => l.x0));
      borders.push({ page: page.page_number, text: lines.map(l => l.text).join(' '), lines, stroke, size,
        properties: { 'border-left': `${(stroke.width / size).toFixed(6)}em solid ${stroke.color}`,
          'padding-left': `${(Math.max(0, Math.min(...lines.map(l => l.x0)) - stroke.x0 - stroke.width / 2) / size).toFixed(6)}em`,
          'margin-left': `${(Math.max(0, stroke.x0 - stroke.width / 2 - left) / size).toFixed(6)}em`, 'text-indent': '0px' } });
    }
  }
  return { borders, unresolved, horizontalRules };
}

export function applyParagraphBorders($, section, page, aligned) {
  const profile = paragraphBorders({ pages: [page] });
  for (const border of profile.borders) {
    const matches = $(section).find('p').toArray().filter(node => {
      const words = blockWords(node, page, aligned);
      return words.length && words.every(w => w.top >= border.stroke.top - 1 && w.bottom <= border.stroke.bottom + 1 && w.x0 > border.stroke.x0);
    });
    // Partial paragraphs require structural repair; never decorate unrelated prose.
    const compact = s => s.normalize('NFKC').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
    if (matches.length !== 1 || compact($(matches[0]).text()) !== compact(border.text)) continue;
    for (const node of matches) for (const [key, value] of Object.entries(border.properties)) setStyle(node, key, value);
  }
}
