import { readFileSync } from 'node:fs';
import { escape } from './dom.mjs';
import { wordCount, draftText } from './core.mjs';
const css = readFileSync(new URL('../assets/marketing.css', import.meta.url), 'utf8');
export function render(job, synthesis, draft) {
  const sections = draft.sections.map(section => `<section class="sales-section sales-${escape(section.role)}"><h2>${escape(section.heading)}</h2>${section.paragraphs.map(paragraph => `<p>${escape(paragraph.text)}</p>`).join('')}</section>`);
  return `<!doctype html>
<html lang="${escape(job.language)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="marketing-summary-generator" content="marketingsummary-skill">
<meta name="marketing-summary-source-sha256" content="${escape(job.sourceSha256)}">
<meta name="marketing-summary-mode" content="${escape(synthesis.mode)}">
<meta name="marketing-summary-target-words" content="${job.targetWords}">
<meta name="marketing-summary-minimum-words" content="${job.minimumWords}">
<meta name="marketing-summary-maximum-words" content="${job.maximumWords}">
<meta name="marketing-summary-actual-words" content="${wordCount(draftText(draft))}">
<title>${escape(draft.title)}</title>
<style>${css}</style>
</head>
<body><main><article data-marketing-summary>
<header><h1>${escape(draft.title)}</h1><p class="dek">${escape(draft.dek)}</p></header>
${sections.join('')}
<p class="closing">${escape(draft.closing.text)}</p>
</article></main></body></html>
`;
}
