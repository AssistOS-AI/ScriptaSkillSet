import { issue } from './layout-checks.mjs';
import { validateTableEvidence } from './tables.mjs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);

const compact = s => s.normalize('NFKC').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();

export async function sourceDecorations(pdf, sha256, executable) {
  if (!executable || !path.isAbsolute(executable)) throw Error('Configure --pdf2html or VALIDATEBOOK_PDF2HTML with the absolute pdf2html skill launcher path');
  const { stdout, stderr } = await execute(executable, ['decorations', path.resolve(pdf)], { timeout:120000, maxBuffer:32e6 });
  const profile = JSON.parse(stdout);
  profile.warnings = [...(profile.warnings || []), ...(stderr.trim() ? [stderr.trim()] : [])];
  if (profile.sourceSha256 !== sha256 || !Array.isArray(profile.borders) || !Array.isArray(profile.unresolved)) throw Error('Invalid or stale PDF decoration evidence');
  for (const b of profile.borders) {
    if (!Number.isInteger(b.page) || b.page < 1 || typeof b.text !== 'string' || !b.text.trim() || !(b.size > 0) || !Number.isFinite(b.size) || !/^#[\da-f]{6}$/i.test(b.stroke?.color) || !(b.stroke.width > 0)) throw Error('Invalid source border');
    if (!/^\d+(?:\.\d+)?em solid #[\da-f]{6}$/i.test(b.properties?.['border-left']) || !['padding-left','margin-left'].every(k => /^\d+(?:\.\d+)?em$/.test(b.properties[k])) || b.properties['text-indent'] !== '0px' || Object.keys(b.properties).length !== 4) throw Error('Invalid border presentation');
  }
  if(!Array.isArray(profile.lists))throw Error('Source presentation provider must include list evidence');
  validateTableEvidence(profile.tables);
  for(const rule of profile.horizontalRules||[])if(!Number.isInteger(rule.page)||rule.page<1||![rule.x0,rule.x1,rule.top,rule.bottom,rule.width].every(Number.isFinite)||rule.x1<=rule.x0||rule.width<=0||!/^#[\da-f]{6}$/i.test(rule.color))throw Error('Invalid source horizontal rule');
  for(const list of profile.lists)if(!['ol','ul'].includes(list.kind)||!Number.isInteger(list.page)||!Array.isArray(list.items)||list.items.length<2||list.items.some(i=>typeof i.text!=='string'||![i.size,i.leading,i.left,i.textLeft,i.gap,list.bodyLeft].every(Number.isFinite)||i.size<=0||i.leading<=0))throw Error('Invalid source list evidence');
  return profile;
}

export async function sourceFonts(pdf, sha256, executable, destination) {
  if (!executable || !path.isAbsolute(executable)) throw Error('Configure --pdf2html or VALIDATEBOOK_PDF2HTML with the absolute pdf2html skill launcher path');
  const { stdout } = await execute(executable, ['fonts', path.resolve(pdf), path.resolve(destination)], { timeout:120000, maxBuffer:32e6 });
  const profile=JSON.parse(stdout);
  if(profile.sourceSha256!==sha256||!Array.isArray(profile.fonts)||profile.fonts.some(font=>typeof font.source_name!=='string'||typeof font.css_family!=='string'||typeof font.href!=='string'||!['normal','italic'].includes(font.style)||![400,700].includes(font.weight)))throw Error('Invalid or stale PDF font evidence');
  return profile.fonts;
}

export function compareDecorations(profile, document, language = 'en') {
  const findings = [], matches = [];
  if (!profile) return { matches, findings: [issue(language, 'source_decorations_unchecked', 'document', 'Configure --pdf2html to check source paragraph borders and lists; source presentation is not certified.', { severity: 'warning' })] };
  for (const unresolved of profile.unresolved) findings.push(issue(language, 'source_border_unresolved', 'page ' + unresolved.page, unresolved.reason));
  for (const border of profile.borders) {
    const candidates = document.records.filter(r => r.tag === 'p' && (!r.page || Number(r.page) === border.page) && compact(r.text) === compact(border.text));
    if (candidates.length !== 1) { findings.push(issue(language, 'source_border_unmapped', 'page ' + border.page, 'A source paragraph border has no unique whole-paragraph HTML match.', { text: border.text })); continue; }
    const record = candidates[0]; matches.push({ selector: record.selector, border });
    const actual = record.decoration, size = parseFloat(record.font.size);
    const rgb = 'rgb(' + border.stroke.color.slice(1).match(/../g).map(x => parseInt(x, 16)).join(', ') + ')';
    const expected = { width: border.stroke.width / border.size * size, color: rgb, padding: parseFloat(border.properties['padding-left']) * size, margin: parseFloat(border.properties['margin-left']) * size };
    // Chromium quantizes borders to device pixels. Allow less than one pixel,
    // but never accept a missing line or the wrong color/style.
    if (!actual || actual.style !== 'solid' || actual.width <= 0 || Math.abs(actual.width - expected.width) >= 1 || actual.color !== expected.color || Math.abs(actual.padding - expected.padding) > 0.15 || Math.abs(actual.margin - expected.margin) > 0.15 || Math.abs(actual.indent) > 0.15)
      findings.push(issue(language, 'source_border_difference', record.selector, 'Paragraph border or inset differs from the PDF.', { page: border.page, expected, actual, width: document.width }));
  }
  return { matches, findings };
}

export function decorationActions(comparison) {
  const wrong = new Set(comparison.findings.filter(f => f.category === 'source_border_difference').map(f => f.location));
  return comparison.matches.filter(m => wrong.has(m.selector)).map(m => ({ kind: 'presentation', selector: m.selector, properties: m.border.properties }));
}

export function translatedDecorations(profile, english, target, structure, language) {
  if (!profile) return null;
  const result = { borders: [], unresolved: [] };
  for (const match of compareDecorations(profile, english).matches) {
    const mapped = structure.matches.find(m => m.source === match.selector);
    const record = target.records.find(r => r.selector === mapped?.target);
    if (!record) result.unresolved.push({ page: match.border.page, reason: `No unique ${language} structural match for a bordered English paragraph` });
    else result.borders.push({ ...match.border, text: record.text, page: Number(record.page) || match.border.page });
  }
  return result;
}
