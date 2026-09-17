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
const missingTranslationCategories=new Set(['missing_structural_anchor','block_sequence_difference','translation_block_count_difference']);
const clean=value=>String(value??'').replace(/\s+/g,' ').replace(/\|/g,'\\|').trim();
function groupedFindings(findings=[]){
  const groups=new Map();
  for(const finding of findings){
    const message=categoryReason[finding.category]||finding.detail;
    const key=`${finding.language}|${finding.category}|${message}`;
    if(!groups.has(key))groups.set(key,{language:finding.language,category:finding.category,message,count:0,locations:[]});
    const group=groups.get(key);group.count++;
    const location=clean(finding.location);
    if(location&&!group.locations.includes(location)&&group.locations.length<3)group.locations.push(location);
  }
  return [...groups.values()].sort((a,b)=>b.count-a.count||a.language.localeCompare(b.language)||a.category.localeCompare(b.category));
}
function findingTable(lines,findings,empty){
  const groups=groupedFindings(findings);
  if(!groups.length){lines.push(empty,'');return;}
  lines.push('| Limbă | Problemă | Cazuri | Exemple de locații |','|---|---|---:|---|');
  for(const group of groups)lines.push(`| ${clean(group.language)} | ${clean(group.message)} | ${group.count} | ${group.locations.join('<br>')} |`);
  lines.push('');
}

export function textReport(result) {
  const unresolved = result.findings.filter(f => f.severity === 'error');
  const missing = unresolved.filter(f=>f.language!=='en'&&missingTranslationCategories.has(f.category));
  const clear = unresolved.filter(f=>!missing.includes(f));
  const lines = ['# ValidateBook: raport de corecție', '', `| | |`, `|---|---|`, `| **Status** | ${result.status} |`, `| **Limbi** | ${result.documents.map(d => d.language).join(', ')} |`, `| **Pagini PDF verificate** | ${result.pageCoverage.length} |`, `| **Corecții aplicate** | ${result.corrections.length} |`, `| **Erori rămase** | ${unresolved.length} |`, ''];
  lines.push('## Erori clare rămase','');
  findingTable(lines,clear,'Nicio eroare clară rămasă.');
  lines.push('## Paragrafe sau blocuri posibil lipsă în traduceri','');
  findingTable(lines,missing,'Nu au fost identificate paragrafe sau blocuri posibil lipsă în traduceri.');
  lines.push('## Corecții aplicate', '');
  if (result.corrections.length === 0) {
    lines.push('Nicio corecție aplicată.', '');
  } else {
    const summary = new Map();
    for (const c of result.corrections) {
      const key = `${c.language} / ${c.kind}`;
      if(!summary.has(key))summary.set(key,{count:0,files:new Set()});
      const group=summary.get(key);group.count++;if(c.file)group.files.add(c.file);
    }
    lines.push('| Limbă / tip | Fixuri | Fișiere afectate |','|---|---:|---:|');
    for (const [key, group] of [...summary].sort(([a],[b])=>a.localeCompare(b)))lines.push(`| ${clean(key)} | ${group.count} | ${group.files.size} |`);
    lines.push('');
  }
  return lines.join('\n') + '\n';
}
export async function writeLayoutReport(directory, result) {
  await writeJson(path.join(directory, 'report.json'), result);
  await fs.writeFile(path.join(directory, 'report.md'), textReport(result));
  return { ...result, reportText: path.join(directory, 'report.md') };
}
export async function layoutReport(directory) {
  directory = path.resolve(directory);
  const job = await readJson(path.join(directory, 'job.json'));
  if (job.scope !== 'layout_and_structure' || job.result?.scope !== 'layout_and_structure' || !Array.isArray(job.inputs) || !Array.isArray(job.artifacts)) throw Error('Invalid layout job contract; prepare a fresh job in a separate directory.');
  await verifyInputs([...job.inputs, ...job.artifacts]);
  return writeLayoutReport(directory, job.result);
}
