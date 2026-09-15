import { median } from './common.mjs';

export function fontStack(family) {
  return family === 'serif' ? 'Georgia, "Times New Roman", serif'
    : family === 'monospace' ? '"SFMono-Regular", Consolas, "Liberation Mono", monospace'
    : 'Inter, "Segoe UI", Arial, sans-serif';
}

export function buildStyles(evidence) {
  const profile = evidence.typography;
  const width = evidence.pages.length ? median(evidence.pages.map(page => page.width_pt)) : 612;
  const height = evidence.pages.length ? median(evidence.pages.map(page => page.height_pt)) : 792;
  const [h1, h2, h3] = profile.heading_scale;
  const faces = new Map(evidence.fonts.map(font => [font.source_name, font]));
  const face = faces.get(profile.body_font_name);
  const bodyStack = (face ? '"' + face.css_family + '", ' : '') + fontStack(profile.body_family);
  const fontRules = evidence.fonts.map(font => '@font-face { font-family: "' + font.css_family
    + '"; src: url("' + font.href + '") format("' + (font.href.endsWith('.ttf') ? 'truetype' : 'opentype')
    + '"); font-weight: ' + font.weight + '; font-style: ' + font.style + '; font-display: block; }').join('\n');
  return `${fontRules}
:root {
  --pdf-body-size: ${profile.body_size_pt.toFixed(2)}pt;
  --pdf-text: ${profile.text_color};
  --pdf-page-width: ${width.toFixed(2)}pt;
  --pdf-page-height: ${height.toFixed(2)}pt;
  --pdf-page-aspect: ${width.toFixed(2)} / ${height.toFixed(2)};
}
* { box-sizing: border-box; }
html { background-color: #f5f5f5; color: var(--pdf-text); }
body {
  max-width: min(800px, var(--pdf-page-width));
  margin: 0 auto;
  padding: 2rem 0;
  font-family: ${bodyStack};
  font-size: var(--standalone-size, var(--pdf-body-size));
  line-height: 1.45;
}
main.pdf-document { width: 100%; margin: 0; }
.source-page {
  position: relative;
  aspect-ratio: var(--pdf-page-aspect);
  margin-bottom: 1.5rem;
  padding: var(--pdf-page-top, 2rem) var(--pdf-page-right, 2rem) var(--pdf-page-bottom, 2rem) var(--pdf-page-left, 2rem);
  background-color: #fff;
  box-shadow: 0 1px 8px rgba(0, 0, 0, 0.12);
}
.source-page:last-child { margin-bottom: 0; }
.source-page > :first-child { margin-top: 0; }
.source-page-full-image { overflow: hidden; padding: 0; }
.source-page-full-image > figure { position: absolute; inset: 0; margin: 0; }
.source-page-full-image > figure > img { width: 100%; height: 100%; object-fit: cover; }
.source-page::after {
  content: attr(data-page-label);
  position: absolute;
  right: 1rem;
  bottom: 0.75rem;
  left: 1rem;
  color: #777;
  font-size: 0.75rem;
  line-height: 1;
  text-align: center;
}
h1 { font-size: ${h1.toFixed(2)}em; }
h2 { font-size: ${h2.toFixed(2)}em; }
h3 { font-size: ${h3.toFixed(2)}em; }
h1, h2, h3, h4, h5, h6 {
  margin-top: 1.5em;
  margin-bottom: 0.5em;
  color: #333;
  line-height: 1.25;
  break-after: avoid;
}
h1 { border-bottom: 0; }
p { margin: 0 0 0.55em; text-align: justify; }
h1, h2, h3, h4, h5, h6, p, li, td, th, caption, figcaption { overflow-wrap: anywhere; }
figure { max-width: 100%; margin: 1.5em 0; text-align: center; }
img { display: block; max-width: 100%; height: auto; margin-inline: auto; }
figcaption { margin-top: 0.5em; color: #666; text-align: center; }
.table-scroll { width: 100%; max-width: 100%; overflow-x: auto; }
table { width: 100%; max-width: 100%; margin: 1em 0; border-collapse: collapse; }
th, td { padding: 8px; border: 1px solid #ddd; text-align: start; vertical-align: top; }
th { background-color: #f2f2f2; font-weight: bold; }
.toc-table { margin: 0; border: 0; table-layout: auto; }
.toc-table td { padding: 0; border: 0; }
.toc-part-row td { font-weight: 700; }
.toc-entry { display: flex; align-items: baseline; gap: 0.3em; width: 100%; box-sizing: border-box; padding-left: var(--toc-indent, 0pt); color: inherit; text-decoration: none; }
.toc-title { flex: 0 1 auto; }
.toc-part-title { flex: 0 1 auto; }
.toc-leader { flex: 1 1 auto; min-width: 1rem; border-bottom: 1px dotted currentColor; }
.toc-page { flex: 0 0 auto; min-width: 2ch; text-align: right; }
.contents-list { margin: 0; }
.contents-list-entry { margin: 0 0 0.45em; line-height: 1.25; text-align: left; }
.contents-list-entry:last-child { margin-bottom: 0; }
pre { padding: 1em; overflow: auto; background-color: #f6f8fa; border-radius: 3px; }
code { padding: 0.2em 0.4em; background-color: #f6f8fa; border-radius: 3px; font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; }
pre code { padding: 0; background-color: transparent; }
.formula { margin: 1em 0; padding: 0.5em; background-color: #f9f9f9; text-align: center; }
.formula-not-decoded {
  margin: 1em 0;
  padding: 0.5em;
  background: repeating-linear-gradient(45deg, #f0f0f0, #f0f0f0 10px, #f9f9f9 10px, #f9f9f9 20px);
  text-align: center;
}
.key-value-region { margin: 1em 0; padding: 1em; background-color: #f9f9f9; border-radius: 4px; }
.key-value-region dt { font-weight: bold; }
.key-value-region dd { margin: 0 0 0.5em 1em; }
.form-container { margin: 1em 0; padding: 1em; border: 1px solid #ddd; border-radius: 4px; }
.form-item { margin-bottom: 0.5em; }
.image-classification { margin-top: 0.5em; color: #666; font-size: 0.9em; }
details.docling-meta { margin: 0.5em 0; font-size: 0.9em; text-align: left; }
details.docling-meta > summary { padding: 2px 6px; color: #555; cursor: pointer; font-style: italic; }
.docling-meta-field { margin: 4px 0 4px 1em; padding: 6px 10px; background-color: #f0f0f0; border-left: 3px solid #ccc; border-radius: 3px; text-align: left; }
.docling-meta-field-label { color: #444; font-weight: bold; }
a { color: inherit; text-decoration: inherit; }
@media (max-width: 640px) {
  body { padding: 0.75rem; }
  .source-page { margin-bottom: 1rem; }
  .source-page::after { bottom: 0.5rem; }
}
@media print {
  html { background: #fff; }
  body { max-width: none; padding: 0; }
  main.pdf-document { width: auto; margin: 0; }
  .source-page { min-height: var(--pdf-page-height); margin: 0; padding: 0; aspect-ratio: auto; box-shadow: none; }
  .source-page:not(:empty) { padding-top: var(--pdf-page-top, 0%); }
  .source-page + .source-page:not(:empty) { break-before: page; }
  a { color: inherit; }
}
`;
}
