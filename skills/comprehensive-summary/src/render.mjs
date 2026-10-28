import path from 'node:path';
import { readFileSync } from 'node:fs';
import { escape } from './dom.mjs';
import { C, wordCount, draftText } from './core.mjs';
const css = readFileSync(
  new URL('../assets/summary.css', import.meta.url),
  'utf8'
);
export function renderSummary(job, chapters, synthesis, draft) {
  const ui =
    C.UI_STRINGS[job.language.split('-')[0].toLowerCase()] ?? C.UI_STRINGS.en;
  const paragraph = p =>
    `<p data-clusters="${escape(
      p.clusterIds.join(' ')
    )}" data-source-units="${escape(p.sourceUnitIds.join(' '))}">${escape(
      p.text
    )}</p>`;
  const sections = draft.sections
    .map(
      s =>
        `<section id="${escape(s.id)}"><h2>${escape(
          s.heading
        )}</h2>${s.paragraphs.map(paragraph).join('')}</section>`
    )
    .join('');
  const rows = synthesis.clusters
    .filter(c => c.selected)
    .map(c => {
      const links = c.chapterIds.map(id => {
        const ch = chapters.find(c => c.id === id),
          href =
            path
              .relative(path.dirname(job.output), job.source)
              .split(path.sep)
              .join('/') + (ch.anchor ? '#' + ch.anchor : '');
        return `<a href="${escape(href)}">${escape(
          id === 'front-matter' ? ui.front : ch.title
        )}</a>`;
      });
      return `<tr data-cluster="${escape(c.id)}" data-source-units="${escape(
        c.sourceUnitIds.join(' ')
      )}"><th scope="row">${escape(c.label)}</th><td>${escape(
        c.synthesis
      )}</td><td>${links.join('; ')}</td></tr>`;
    })
    .join('');
  return `<!doctype html>
<html lang="${escape(job.language)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="summary-generator" content="comprehensivesummary-skill">
<meta name="summary-source-sha256" content="${escape(job.sourceSha256)}">
<meta name="summary-target-words" content="${job.targetWords}">
<meta name="summary-minimum-words" content="${job.minimumWords}">
<meta name="summary-maximum-words" content="${job.maximumWords}">
<meta name="summary-actual-words" content="${wordCount(draftText(draft))}">
<meta name="summary-words-per-minute" content="${job.wordsPerMinute}">
<title>${escape(draft.title)}</title>
<style>${css}</style>
</head>
<body><main>
<article data-summary-body>
<h1>${escape(draft.title)}</h1>
<p class="dek">${escape(draft.dek)}</p>
${sections}
<section id="conclusion">${draft.conclusion.map(paragraph).join('')}</section>
</article>
<details data-source-map><summary>${escape(ui.map)}</summary>
<table><thead><tr><th>${escape(ui.idea)}</th><th>${escape(
    ui.summary
  )}</th><th>${escape(
    ui.chapters
  )}</th></tr></thead><tbody>${rows}</tbody></table>
</details>
</main></body></html>
`;
}
