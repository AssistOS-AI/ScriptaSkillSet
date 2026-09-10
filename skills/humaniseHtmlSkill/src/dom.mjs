import {
  parseDocument,
  DomUtils
} from '../external/html/node_modules/htmlparser2/dist/esm/index.js';

export const parse = text => parseDocument(text);
export const elements = (root, predicate = () => true) =>
  DomUtils.findAll(
    node => Boolean(node.name) && predicate(node),
    root.children ?? []
  );
export const first = (root, predicate) => elements(root, predicate)[0];
export const named = (root, name) => first(root, node => node.name === name);
export const has = (node, key) => Object.hasOwn(node.attribs ?? {}, key);
export const meta = (root, name) =>
  first(root, node => node.name === 'meta' && node.attribs.name === name)
    ?.attribs.content;
export const compact = text => text.trim().replace(/\s+/gu, ' ');
export function textOf(root) {
  const parts = [];
  const visit = node => {
    if (node.type === 'text' && node.data.trim()) parts.push(node.data.trim());
    if (!['script', 'style', 'comment'].includes(node.type))
      for (const child of node.children ?? []) visit(child);
  };
  visit(root);
  return parts.join(' ');
}
export function remove(root, predicate) {
  for (const node of elements(root, predicate)) DomUtils.removeElement(node);
}
export const escape = text =>
  String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#x27;');
