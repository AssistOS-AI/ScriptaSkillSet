import { createRequire } from 'node:module';
import { wordMatches, tokens, matchingBlocks } from './common.mjs';
const require = createRequire(new URL('../../external/runtime/package.json', import.meta.url));
const cheerio = require('cheerio');

export function parseHtml(html) {
  return cheerio.load(html, { xml: { xmlMode: false, decodeEntities: true } });
}
export function text(node) {
  const parts = [];
  function visit(item) {
    if (['script', 'style'].includes(item.name)) return;
    if (item.type === 'text' && item.data.trim()) parts.push(item.data.trim());
    for (const child of item.children ?? []) visit(child);
  }
  visit(node);
  return parts.join(' ');
}
export function htmlWords(node) {
  const words = [];
  function visit(item) {
    if (['script', 'style'].includes(item.name)) return;
    if (item.type === 'text') for (const match of wordMatches(item.data)) words.push({ node: item, start: match.index, end: match.index + match[0].length, token: tokens(match[0])[0] });
    for (const child of item.children ?? []) visit(child);
  }
  visit(node);
  return words;
}
export function belongsTo(word, container) {
  for (let parent = word.node.parent; parent; parent = parent.parent) if (parent === container) return true;
  return false;
}
export function setStyle(node, property, value) {
  const declarations = (node.attribs.style ?? '').split(';').map(item => item.trim()).filter(item => item && !item.toLowerCase().startsWith(`${property.toLowerCase()}:`));
  node.attribs.style = [...declarations, `${property}: ${value}`].join('; ');
}
export function addClass(node, value) {
  node.attribs.class = [...new Set([...(node.attribs.class ?? '').split(/\s+/).filter(Boolean), value])].join(' ');
}
export function alignment(page, section) {
  const words = htmlWords(section), mapping = new Map();
  for (const [source, target, length] of matchingBlocks(page.words.map(word => word.token), words.map(word => word.token))) {
    for (let offset = 0; offset < length; offset += 1) mapping.set(source + offset, target + offset);
  }
  return { words, mapping };
}
export function blockWords(block, page, aligned) {
  return [...aligned.mapping].filter(([, html]) => belongsTo(aligned.words[html], block)).map(([source]) => page.words[source]);
}
export const blockNames = 'h1,h2,h3,h4,h5,h6,p,caption,figcaption,th,td';
export const flowNames = 'h1,h2,h3,h4,h5,h6,p';
export const relativeSize = (size, body) => `calc(var(--pdf-reader-size) * ${(body > 0 ? size / body : 1).toFixed(4)})`;
