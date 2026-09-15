import path from 'node:path';
import { readJson } from './storage.mjs';
import { report } from './audit.mjs';

export function nextAction(reports, autoCorrect) {
  if (!reports.length) throw Error('At least one layout report is required');
  const current = reports.at(-1);
  if (current.scope !== 'layout_and_structure') throw Error('Editorial report cannot enter the layout workflow');
  const errors = r => r.findings.filter(f => f.severity === 'error');
  if (errors(current).length) return { action: autoCorrect ? 'repair_layout' : 'report_only', tasks: errors(current), instruction: 'Use local structural evidence and text-preserving plans. Request narrowly scoped judgment only for ambiguous cases. Never rewrite translations or run editorial skills.' };
  return { action: 'layout_validated', reportText: current.reportText, limitations: current.limitations };
}
export async function workflow(file) {
  const history = await readJson(path.resolve(file));
  if (!Array.isArray(history) || !history.length) throw Error('Expected a nonempty array of report paths');
  const reports = [];
  for (const f of history) reports.push(await report((await readJson(path.resolve(f))).job));
  return nextAction(reports, true);
}
