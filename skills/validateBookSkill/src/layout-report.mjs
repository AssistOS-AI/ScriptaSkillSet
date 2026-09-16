import fs from 'node:fs/promises';
import path from 'node:path';
import { readJson, writeJson, verifyInputs } from './storage.mjs';

const categoryReason={
  missing_structural_anchor:'Un bloc din engleza nu are corespondent unic in traducere; poate lipsi un paragraf sau s-a pierdut ancora structurala.',
  block_sequence_difference:'Ordinea sau tipurile de blocuri difera de layout-ul canonic englez; poate indica paragrafe lipsa, fragmente extra sau cuprins/tabele rupte.',
  translation_block_count_difference:'O pagina tradusa are alt numar de blocuri decat pagina engleza corespondenta; stilurile nu pot fi propagate complet.',
  translation_style_difference:'Un bloc tradus nu foloseste fontul, marimea, leading-ul, culoarea sau spacing-ul rolului englez corespondent.',
  translation_style_unmapped:'Skillul nu a gasit un rol englez neambiguu pentru blocul tradus; textul este pastrat, dar stilul nu este certificat.',
  translated_contents_presentation:'Cuprinsul tradus nu poate fi aliniat sigur cu structura engleza; textul si linkurile existente sunt pastrate, problema trebuie semnalata.',
  source_typography_unmapped:'Un paragraf englez nu are potrivire unica in PDF, deci fontul/marimea nu pot fi certificate.',
  source_text_color_difference:'Culoarea randata difera de culoarea masurata in PDF.',
  reader_typography_difference:'Varianta importata in reader difera de standalone dupa normalizarea latimii paginii.'
};

function summarizeFindings(findings=[]){
  const counts=new Map();
  for(const f of findings)counts.set(f.category,(counts.get(f.category)||0)+1);
  return [...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
}

export function textReport(result) {
  const lines = ['ValidateBook: layout and structural integrity', `Status: ${result.status}`, `Mode: ${result.scope}`, `Documents: ${result.documents.map(d => d.language).join(', ')}`, `PDF pages checked: ${result.pageCoverage.length}`, `Applied corrections: ${result.corrections.length}`, `Unresolved findings: ${result.findings.length}`, '', 'Problem summary'];
  for(const [category,count] of summarizeFindings(result.findings).slice(0,20))lines.push(`- ${category}: ${count}${categoryReason[category]?' — '+categoryReason[category]:''}`);
  const translationFindings=result.findings.filter(f=>f.language!=='en'&&/translation|structural|block_sequence|reader_typography|contents|paragraph/i.test(f.category+' '+f.detail));
  if(translationFindings.length){
    lines.push('', 'Translation problems');
    for(const [category,count] of summarizeFindings(translationFindings).slice(0,20))lines.push(`- ${category}: ${count}${categoryReason[category]?' — '+categoryReason[category]:''}`);
    for(const f of translationFindings.slice(0,60))lines.push(`[${f.severity}] [${f.language}] ${f.category} at ${f.location}: ${f.detail}`);
  }
  lines.push('', 'Problems found and corrections');
  for (const f of result.initialFindings) lines.push(`[${f.language}] ${f.category} at ${f.location}: ${f.detail}`);
  for (const c of result.corrections) lines.push(`[${c.language}] ${c.kind} in ${c.file}\nBefore: ${typeof c.before === 'string' ? c.before : JSON.stringify(c.before)}\nAfter: ${typeof c.after === 'string' ? c.after : JSON.stringify(c.after)}`);
  lines.push('', 'Remaining findings');
  for (const f of result.findings) lines.push(`[${f.severity}] [${f.language}] ${f.category} at ${f.location}: ${f.detail}${f.excerpts ? '\n' + f.excerpts.join('\n') : ''}`);
  lines.push('', 'Limitations', ...result.limitations, '', 'Recovery');
  if (result.backups?.length) lines.push(...result.backups.map(b => `${b.file} -> ${b.backup}`));
  else lines.push('Temporary working files were discarded after report delivery.');
  return lines.join('\n') + '\n';
}
export async function writeLayoutReport(directory, result) {
  await writeJson(path.join(directory, 'report.json'), result);
  await fs.writeFile(path.join(directory, 'report.txt'), textReport(result));
  return { ...result, reportText: path.join(directory, 'report.txt') };
}
export async function layoutReport(directory) {
  directory = path.resolve(directory);
  const job = await readJson(path.join(directory, 'job.json'));
  if (job.scope !== 'layout_and_structure' || job.result?.scope !== 'layout_and_structure' || !Array.isArray(job.inputs) || !Array.isArray(job.artifacts)) throw Error('Invalid layout job contract; prepare a fresh job in a separate directory.');
  await verifyInputs([...job.inputs, ...job.artifacts]);
  return writeLayoutReport(directory, job.result);
}
