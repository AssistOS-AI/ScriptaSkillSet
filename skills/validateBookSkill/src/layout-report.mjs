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
  const lines = ['# ValidateBook: layout and structural integrity', '', `| | |`, `|---|---|`, `| **Status** | ${result.status} |`, `| **Mode** | ${result.scope} |`, `| **Documents** | ${result.documents.map(d => d.language).join(', ')} |`, `| **PDF pages checked** | ${result.pageCoverage.length} |`, `| **Applied corrections** | ${result.corrections.length} |`, `| **Unresolved findings** | ${result.findings.length} |`, ''];
  const unresolved = result.findings.filter(f => f.severity === 'error');
  const warnings = result.findings.filter(f => f.severity !== 'error');
  lines.push('## Probleme nerezolvate', '');
  if (unresolved.length === 0) {
    lines.push('Nicio problemă nerezolvată.', '');
  } else {
    lines.push('| # | Severitate | Limbă | Categorie | Locație | Detalii |', '|---|---|---|---|---|---|');
    unresolved.forEach((f, i) => {
      const detail = f.detail.replace(/\|/g, '\\|');
      const location = String(f.location).replace(/\|/g, '\\|');
      lines.push(`| ${i + 1} | ${f.severity} | ${f.language} | ${f.category} | ${location} | ${detail} |`);
    });
    lines.push('');
    for (const f of unresolved) {
      if (f.excerpts?.length) {
        lines.push(`> **${f.category}** @ ${f.location}:`, '>');
        for (const ex of f.excerpts) lines.push(`> ${ex.replace(/\n/g, '\n> ')} >`);
        lines.push('');
      }
    }
  }
  if (warnings.length > 0) {
    lines.push('### Avertismente', '');
    lines.push('| # | Limbă | Categorie | Locație | Detalii |', '|---|---|---|---|---|');
    warnings.forEach((f, i) => {
      const detail = f.detail.replace(/\|/g, '\\|');
      const location = String(f.location).replace(/\|/g, '\\|');
      lines.push(`| ${i + 1} | ${f.language} | ${f.category} | ${location} | ${detail} |`);
    });
    lines.push('');
  }
  lines.push('## Sumar corecții aplicate', '');
  if (result.corrections.length === 0) {
    lines.push('Nicio corecție aplicată.', '');
  } else {
    lines.push('| # | Limbă | Tip | Fișier |', '|---|---|---|---|');
    result.corrections.forEach((c, i) => {
      lines.push(`| ${i + 1} | ${c.language} | ${c.kind} | ${c.file} |`);
    });
    lines.push('');
    const summary = {};
    for (const c of result.corrections) {
      const key = `${c.language} / ${c.kind}`;
      summary[key] = (summary[key] || 0) + 1;
    }
    lines.push('**Grupat după limbă și tip:**', '');
    for (const [key, count] of Object.entries(summary).sort()) {
      lines.push(`- ${key}: ${count}`);
    }
    lines.push('');
  }
  lines.push('## Probleme inițiale detectate', '');
  if (result.initialFindings?.length) {
    for (const f of result.initialFindings) lines.push(`- [${f.language}] ${f.category} at ${f.location}: ${f.detail}`);
  } else {
    lines.push('Niciuna.');
  }
  lines.push('');
  lines.push('## Limitări', '');
  for (const l of result.limitations) lines.push(`- ${l}`);
  lines.push('');
  lines.push('## Recovery', '');
  if (result.backups?.length) {
    for (const b of result.backups) lines.push(`- ${b.file} → ${b.backup}`);
  } else {
    lines.push('Fișierele de lucru temporare au fost eliminate după livrarea raportului.');
  }
  lines.push('');
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
