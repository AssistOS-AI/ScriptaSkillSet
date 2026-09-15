import fs from 'node:fs/promises';
import path from 'node:path';
import { readJson, writeJson, verifyInputs } from './storage.mjs';

export function textReport(result) {
  const lines = ['ValidateBook: layout and structural integrity', `Status: ${result.status}`, `Mode: ${result.scope}`, `Documents: ${result.documents.map(d => d.language).join(', ')}`, `PDF pages checked: ${result.pageCoverage.length}`, `Applied corrections: ${result.corrections.length}`, `Unresolved findings: ${result.findings.length}`, '', 'Problems found and corrections'];
  for (const f of result.initialFindings) lines.push(`[${f.language}] ${f.category} at ${f.location}: ${f.detail}`);
  for (const c of result.corrections) lines.push(`[${c.language}] ${c.kind} in ${c.file}\nBefore: ${typeof c.before === 'string' ? c.before : JSON.stringify(c.before)}\nAfter: ${typeof c.after === 'string' ? c.after : JSON.stringify(c.after)}`);
  lines.push('', 'Remaining findings');
  for (const f of result.findings) lines.push(`[${f.severity}] [${f.language}] ${f.category} at ${f.location}: ${f.detail}${f.excerpts ? '\n' + f.excerpts.join('\n') : ''}`);
  lines.push('', 'Limitations', ...result.limitations, '', 'Recovery', ...result.backups.map(b => `${b.file} -> ${b.backup}`));
  return lines.join('\n') + '\n';
}
export async function writeLayoutReport(directory, result) {
  await writeJson(path.join(directory, 'report.json'), result);
  await fs.writeFile(path.join(directory, 'report.txt'), textReport(result));
  await writeJson(path.join(directory, 'repair-tasks.json'), { scope: result.scope, tasks: result.findings, instruction: 'Layout/structure only. No humanisation, translation rewriting, summaries, metadata, font-size-control tests, screenshots or automatic missing-language creation.' });
  return { ...result, reportText: path.join(directory, 'report.txt') };
}
export async function layoutReport(directory) {
  directory = path.resolve(directory);
  const job = await readJson(path.join(directory, 'job.json'));
  if (job.scope !== 'layout_and_structure' || job.result?.scope !== 'layout_and_structure' || !Array.isArray(job.inputs) || !Array.isArray(job.artifacts)) throw Error('Invalid layout job contract; prepare a fresh job in a separate directory.');
  await verifyInputs([...job.inputs, ...job.artifacts]);
  return writeLayoutReport(directory, job.result);
}
