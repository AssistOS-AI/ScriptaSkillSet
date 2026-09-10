import fs from 'node:fs/promises';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { DomUtils } from '../external/html/node_modules/htmlparser2/dist/esm/index.js';
import {
  Element,
  Text
} from '../external/html/node_modules/domhandler/lib/esm/index.js';
import { parse, elements, first, named, has, textOf, compact } from './dom.mjs';
export {
  parse,
  elements,
  first,
  named,
  has,
  textOf,
  compact,
  Element,
  Text,
  DomUtils
};
export const C = JSON.parse(
  readFileSync(new URL('../assets/contract.json', import.meta.url), 'utf8')
);
export const human = Boolean(C.HUMANISATION_META_NAMES);
export const readJson = async p => JSON.parse(await fs.readFile(p, 'utf8'));
export const writeJson = async (p, v) =>
  fs.writeFile(p, JSON.stringify(v, null, 2) + '\n');
export const hash = v =>
  createHash('sha256')
    .update(v)
    .digest('hex');
export const fileSha256 = async p => hash(await fs.readFile(p));
export const exists = async p => {
  try {
    return (await fs.stat(p)).isFile();
  } catch {
    return false;
  }
};
export function resolve(p) {
  let current = path.resolve(
    p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p
  );
  const suffix = [];
  for (;;) {
    try {
      return path.join(realpathSync(current), ...suffix.reverse());
    } catch (error) {
      if (
        !['ENOENT', 'ENOTDIR'].includes(error.code) ||
        path.dirname(current) === current
      )
        throw error;
      suffix.push(path.basename(current));
      current = path.dirname(current);
    }
  }
}
export const count = v => v.reduce((m, k) => ((m[k] = (m[k] ?? 0) + 1), m), {});
export const casefold = s =>
  s
    .toLowerCase()
    .replaceAll('ß', 'ss')
    .replaceAll('ς', 'σ');
export const length = s => [...s].length;
export const words = s =>
  s.match(/(?<![\p{L}\p{N}_])[\p{L}]+(?![\p{L}\p{N}_])/gu) ?? [];
export const letters = s => s.match(/[\p{L}]/gu) ?? [];
export const tokenRE = /⟦(OPEN|CLOSE|VOID):(T\d{6})⟧/gu;
export const protectionRE = /⟦PROTECT:P\d{6}⟧/gu;
const protectedRE = new RegExp(C.PROTECTED_RE, 'giu');
export const sortedJson = v => {
  if (Array.isArray(v)) return '[' + v.map(sortedJson).join(', ') + ']';
  if (v && typeof v === 'object')
    return (
      '{' +
      Object.keys(v)
        .sort()
        .map(k => JSON.stringify(k) + ': ' + sortedJson(v[k]))
        .join(', ') +
      '}'
    );
  return JSON.stringify(v);
};
export function excluded(n) {
  for (let p = n; p; p = p.parent)
    if (
      C.SKIP_TAGS.includes(p.name) ||
      casefold(p.attribs?.translate ?? '') === 'no'
    )
      return true;
  return false;
}
export function ancestors(n) {
  const a = [];
  for (let p = n.parent; p; p = p.parent) a.push(p);
  return a;
}
export function attrs(n) {
  const out = { ...n.attribs };
  for (const k of ['class', 'accesskey', 'dropzone'])
    if (has(n, k))
      out[k] = out[k]
        .trim()
        .split(/\s+/)
        .filter(Boolean);
  for (const k of ['rel', 'rev'])
    if (['a', 'link', 'area'].includes(n.name) && has(n, k))
      out[k] = out[k]
        .trim()
        .split(/\s+/)
        .filter(Boolean);
  if (n.name === 'td' || n.name === 'th')
    if (has(n, 'headers'))
      out.headers = out.headers
        .trim()
        .split(/\s+/)
        .filter(Boolean);
  return out;
}
const encodeText = s =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
function quote(s) {
  s = encodeText(String(s));
  if (s.includes('"') && !s.includes("'")) return "'" + s + "'";
  return '"' + s.replaceAll('"', '&quot;') + '"';
}
export function serialize(n) {
  if (n.type === 'root') return (n.children ?? []).map(serialize).join('');
  if (n.type === 'directive')
    return n.data.toLowerCase().startsWith('!doctype')
      ? '<!DOCTYPE ' + n.data.slice(9).trim() + '>\n'
      : '<' + n.data + '>';
  if (n.type === 'comment') return '<!--' + n.data + '-->';
  if (n.type === 'text') {
    let data = n.data;
    if (
      /^\s+$/.test(data) &&
      !ancestors(n).some(p =>
        ['pre', 'textarea', 'script', 'style'].includes(p.name)
      )
    )
      data = data.includes('\n') ? '\n' : ' ';
    return ['script', 'style'].includes(n.parent?.name)
      ? data
      : encodeText(data);
  }
  const a = Object.entries(attrs(n))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => ' ' + k + '=' + quote(Array.isArray(v) ? v.join(' ') : v))
    .join('');
  return (
    '<' +
    n.name +
    a +
    (C.VOID_TAGS.includes(n.name)
      ? '/>'
      : '>' + (n.children ?? []).map(serialize).join('') + '</' + n.name + '>')
  );
}
export function append(parent, node) {
  DomUtils.appendChild(parent, node);
}
export function replaceChildren(parent, nodes) {
  for (const n of [...(parent.children ?? [])]) DomUtils.removeElement(n);
  for (const n of nodes) append(parent, n);
}
export function unwrap(n) {
  const parent = n.parent,
    index = parent.children.indexOf(n),
    children = [...n.children];
  parent.children.splice(index, 1, ...children);
  for (const c of children) c.parent = parent;
  parent.children.forEach((c, i) => {
    c.prev = parent.children[i - 1] ?? null;
    c.next = parent.children[i + 1] ?? null;
  });
  n.parent = null;
  n.children = [];
}
function protect(text, protections) {
  return text.replace(protectedRE, value => {
    const t = `⟦PROTECT:P${String(Object.keys(protections).length + 1).padStart(
      6,
      '0'
    )}⟧`;
    protections[t] = value;
    return t;
  });
}
function encodeChildren(tag) {
  const placeholders = {},
    protections = {};
  function encode(n) {
    if (n.type === 'comment') {
      const t = `⟦PROTECT:P${String(
        Object.keys(protections).length + 1
      ).padStart(6, '0')}⟧`;
      protections[t] = `<!--${n.data}-->`;
      return t;
    }
    if (n.type === 'text') return protect(n.data, protections);
    if (n.type === 'directive')
      return protect(n.data.replace(/^!doctype\s+/i, ''), protections);
    if (!n.name) return serialize(n);
    const id = `T${String(Object.keys(placeholders).length + 1).padStart(
      6,
      '0'
    )}`;
    placeholders[id] = { tag: n.name, attrs: attrs(n) };
    if (C.VOID_TAGS.includes(n.name)) return `⟦VOID:${id}⟧`;
    return `⟦OPEN:${id}⟧${(n.children ?? [])
      .map(encode)
      .join('')}⟦CLOSE:${id}⟧`;
  }
  return {
    source: (tag.children ?? []).map(encode).join(''),
    placeholders,
    protections
  };
}
function page(tag) {
  const p =
    ancestors(tag).find(
      p => p.name === 'section' && has(p, 'data-source-page')
    ) ?? (tag.name === 'section' && has(tag, 'data-source-page') ? tag : null);
  return p?.attribs['data-source-page'] ?? null;
}
export function roots(doc) {
  const candidates = elements(
    doc,
    n =>
      (C.TEXT_TAGS ?? C.TRANSLATABLE_TAGS).includes(n.name) &&
      !excluded(n) &&
      (human ? /[\p{L}\p{N}]/u : /[\p{L}\p{N}_]/u).test(textOf(n))
  );
  return candidates.filter(n => !elements(n).some(c => candidates.includes(c)));
}
function chapterMap(doc, roots) {
  let chapters = [],
    mapping = new Map();
  const h1s = elements(
    doc,
    n => n.name === 'h1' && !excluded(n) && /[\p{L}\p{N}]/u.test(textOf(n))
  );
  if (h1s.length) {
    let current = { id: 'front-matter', title: 'Front matter' },
      number = 0;
    chapters.push(current);
    for (const r of roots) {
      if (h1s.includes(r)) {
        current = {
          id: `chapter-${String(++number).padStart(4, '0')}`,
          title: textOf(r)
        };
        chapters.push(current);
      }
      mapping.set(r, current);
    }
    chapters = chapters.filter(c => [...mapping.values()].includes(c));
    return { chapters, mapping };
  }
  const scope = named(doc, 'main') ?? named(doc, 'body'),
    boundaries = (scope?.children ?? []).filter(n =>
      ['article', 'section'].includes(n.name)
    );
  if (boundaries.length) {
    boundaries.forEach((b, i) => {
      const h = first(b, n => /^h[1-6]$/.test(n.name)),
        ch = {
          id: `chapter-${String(i + 1).padStart(4, '0')}`,
          title: h ? textOf(h) : `Section ${i + 1}`
        };
      chapters.push(ch);
      const descendants = elements(b);
      roots
        .filter(r => r === b || descendants.includes(r))
        .forEach(r => mapping.set(r, ch));
    });
    let front = false;
    for (const r of roots)
      if (!mapping.has(r)) {
        mapping.set(r, { id: 'front-matter', title: 'Front matter' });
        front = true;
      }
    if (front) chapters.unshift({ id: 'front-matter', title: 'Front matter' });
    return { chapters, mapping };
  }
  const ch = {
    id: 'document',
    title: named(doc, 'title') ? textOf(named(doc, 'title')) : 'Document'
  };
  chapters = [ch];
  roots.forEach(r => mapping.set(r, ch));
  return { chapters, mapping };
}
function verifyOnly(kind, plain, title) {
  const text = compact(plain),
    h = compact(casefold(title).replace(/^[ :.-]+|[ :.-]+$/gu, ''));
  return (
    C.BIBLIOGRAPHY_HEADINGS.includes(h) ||
    (kind === 'attribute:aria-label' &&
      new RegExp(C.PAGE_LABEL_RE, 'iu').test(text)) ||
    new RegExp(C.COPYRIGHT_RE, 'iu').test(text) ||
    new RegExp(C.IDENTIFIER_RE, 'u').test(text) ||
    /^(?:\[[^\]]+\]|\([^)]*\d{4}[^)]*\)|\s|[,;:.])+$/.test(text)
  );
}
export function extractUnits(doc) {
  const units = [],
    rootNodes = roots(doc),
    { chapters, mapping } = human
      ? chapterMap(doc, rootNodes)
      : { chapters: [], mapping: new Map() };
  function add(kind, encoded, tag, chapter, attribute, nodeId) {
    const id = `u${String(units.length + 1).padStart(6, '0')}`;
    let plain = encoded.source.replace(tokenRE, '');
    if (human)
      for (const [t, v] of Object.entries(encoded.protections))
        plain = plain.replaceAll(t, v);
    const u = {
      id,
      kind,
      ...(human ? { chapterId: chapter.id, chapterTitle: chapter.title } : {}),
      page: page(tag),
      ...(human
        ? {
            policy: verifyOnly(kind, plain, chapter.title)
              ? 'verify-only'
              : 'editable'
          }
        : {}),
      source: encoded.source,
      plainText: plain,
      placeholders: encoded.placeholders ?? {},
      protections: encoded.protections ?? {},
      ...(attribute ? { attribute, nodeId } : {})
    };
    units.push(u);
    return id;
  }
  for (const r of rootNodes) {
    const id = `u${String(units.length + 1).padStart(6, '0')}`;
    r.attribs[C.MARKER_UNIT] = id;
    add(r.name, encodeChildren(r), r, mapping.get(r));
  }
  const textNodes = [];
  function visit(n) {
    if (
      ['text', 'directive'].includes(n.type) &&
      n.data.trim() &&
      !excluded(n) &&
      !ancestors(n).some(p => has(p, C.MARKER_UNIT))
    )
      textNodes.push(n);
    for (const c of n.children ?? []) visit(c);
  }
  visit(doc);
  for (const n of textNodes) {
    const wrapper = new Element('span', { [C.MARKER_WRAPPER]: '' });
    DomUtils.replaceElement(n, wrapper);
    append(wrapper, n);
    const parentRoot = rootNodes.find(r => ancestors(n).includes(r));
    const ch = mapping.get(parentRoot) ?? { id: 'document', title: 'Document' };
    wrapper.attribs[C.MARKER_UNIT] = `u${String(units.length + 1).padStart(
      6,
      '0'
    )}`;
    add('text', encodeChildren(wrapper), wrapper, ch);
  }
  let counter = 0;
  for (const tag of elements(doc)) {
    if (excluded(tag)) continue;
    const attributes = C.HUMAN_ATTRIBUTES.filter(a => has(tag, a));
    if (
      tag.name === 'meta' &&
      casefold(tag.attribs.name ?? '') === 'description' &&
      has(tag, 'content')
    )
      attributes.push('content');
    for (const attribute of [...new Set(attributes)].sort()) {
      const value = tag.attribs[attribute];
      if (!(human ? /[\p{L}\p{N}]/u : /[\p{L}\p{N}_]/u).test(value)) continue;
      if (!has(tag, C.MARKER_NODE))
        tag.attribs[C.MARKER_NODE] = `n${String(++counter).padStart(6, '0')}`;
      const protections = {},
        source = protect(value, protections),
        ancestor = [...rootNodes]
          .reverse()
          .find(r => r === tag || ancestors(tag).includes(r));
      add(
        'attribute:' + attribute,
        { source, placeholders: {}, protections },
        tag,
        mapping.get(ancestor) ?? { id: 'document', title: 'Document' },
        attribute,
        tag.attribs[C.MARKER_NODE]
      );
    }
  }
  return { units, chapters };
}
export function annotateMemory(units) {
  const seen = new Map(),
    templates = new Map();
  let exact = 0,
    labels = 0;
  for (const u of units) {
    const key = sortedJson({
      kind: u.kind,
      ...(human ? { policy: u.policy } : {}),
      source: u.source,
      placeholders: u.placeholders ?? {},
      protections: u.protections ?? {},
      attribute: u.attribute ?? null
    });
    if (seen.has(key)) {
      u.reuseOf = seen.get(key);
      exact++;
      continue;
    }
    seen.set(key, u.id);
    if (
      human ||
      !u.kind.startsWith('attribute:') ||
      Object.keys(u.placeholders).length ||
      Object.keys(u.protections).length
    )
      continue;
    const m = u.source.trim().match(/^(.*?\D)(\d+)(\D*)$/u);
    if (!m || !/[\p{L}\p{N}_]/u.test(m[1])) continue;
    const tk = JSON.stringify([u.kind, casefold(m[1]), casefold(m[3])]);
    if (!templates.has(tk)) templates.set(tk, [u.id, m[2]]);
    else {
      const [id, num] = templates.get(tk);
      Object.assign(u, {
        reuseTemplateOf: id,
        templateNumber: num,
        sourceNumber: m[2]
      });
      labels++;
    }
  }
  return human
    ? { exactMatches: exact, modelUnitsSaved: exact }
    : {
        exactMatches: exact,
        templatedLabels: labels,
        modelUnitsSaved: exact + labels
      };
}
export const requiresModel = u => !u.reuseOf && !u.reuseTemplateOf;
export async function allUnits(dir, job) {
  const batches = await Promise.all(
    job.batches.map(n => readJson(path.join(dir, 'batches', n)))
  );
  return batches.flatMap(b => b.units);
}
export function restoreProtections(text, unit) {
  if (human) {
    const actual = text.match(protectionRE) ?? [],
      expected = Object.keys(unit.protections ?? {});
    if (JSON.stringify([...actual].sort()) !== JSON.stringify(expected.sort()))
      throw Error(`Unit ${unit.id} changed its protected token set.`);
  }
  for (const [token, value] of Object.entries(unit.protections ?? {})) {
    if (text.split(token).length - 1 !== 1)
      throw Error(
        `Unit ${unit.id} must preserve protected token ${token} exactly once.`
      );
    text = text.replaceAll(token, value);
  }
  return text;
}
export function decodeFragment(value, unit) {
  const matches = s => [...s.matchAll(tokenRE)].map(m => m[0]).sort();
  if (JSON.stringify(matches(value)) !== JSON.stringify(matches(unit.source)))
    throw Error(`Unit ${unit.id} changed its HTML placeholder set.`);
  value = restoreProtections(value, unit);
  const root = new Element('div', {}),
    stack = [['ROOT', root]];
  let position = 0;
  for (const m of value.matchAll(tokenRE)) {
    if (m.index > position)
      append(stack.at(-1)[1], new Text(value.slice(position, m.index)));
    const [kind, id] = [m[1], m[2]],
      def = unit.placeholders?.[id];
    if (!def)
      throw Error(`Unit ${unit.id} contains unknown placeholder ${id}.`);
    if (kind === 'OPEN' || kind === 'VOID') {
      const a = Object.fromEntries(
          Object.entries(def.attrs ?? {}).map(([k, v]) => [
            k,
            Array.isArray(v) ? v.join(' ') : v
          ])
        ),
        n = new Element(def.tag, a);
      append(stack.at(-1)[1], n);
      if (kind === 'OPEN') stack.push([id, n]);
    } else {
      if (stack.length === 1 || stack.at(-1)[0] !== id)
        throw Error(`Unit ${unit.id} has improperly nested placeholder ${id}.`);
      stack.pop();
    }
    position = m.index + m[0].length;
  }
  if (position < value.length)
    append(stack.at(-1)[1], new Text(value.slice(position)));
  if (stack.length !== 1)
    throw Error(`Unit ${unit.id} has unclosed HTML placeholders.`);
  return [...root.children];
}
export function rewriteReference(value, source, target) {
  if (!value || /^[#/]|^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) return value;
  const m = value.match(/^([^?#]*)(\?[^#]*)?(#.*)?$/s);
  return (
    (
      path.relative(
        path.dirname(target),
        path.resolve(path.dirname(source), m[1])
      ) || '.'
    )
      .split(path.sep)
      .join('/') +
    (m[2] ?? '') +
    (m[3] ?? '')
  );
}
export const rewriteSrcset = (v, s, t) =>
  v
    .split(',')
    .map(c => {
      const parts = c
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      if (parts.length) parts[0] = rewriteReference(parts[0], s, t);
      return parts.join(' ');
    })
    .join(', ');
export const rewriteCssUrls = (v, s, t) =>
  v.replace(
    /url\(\s*(['"]?)(.*?)\1\s*\)/gi,
    (_, q, url) => `url(${q}${rewriteReference(url, s, t)}${q})`
  );
export function rewriteLocalReferences(doc, source, target) {
  for (const n of elements(doc)) {
    for (const a of C.URL_ATTRIBUTES)
      if (has(n, a))
        n.attribs[a] = rewriteReference(n.attribs[a], source, target);
    if (has(n, 'srcset'))
      n.attribs.srcset = rewriteSrcset(n.attribs.srcset, source, target);
    if (has(n, 'style'))
      n.attribs.style = rewriteCssUrls(n.attribs.style, source, target);
  }
}
export function applyUnits(doc, units, values) {
  for (const u of units) {
    const n = first(
      doc,
      n =>
        n.attribs[u.attribute ? C.MARKER_NODE : C.MARKER_UNIT] ===
        (u.attribute ? u.nodeId : u.id)
    );
    if (!n)
      throw Error(
        `Missing ${u.attribute ? 'attribute' : 'content'} target for ${u.id}.`
      );
    if (u.attribute)
      n.attribs[u.attribute] = restoreProtections(values[u.id], u);
    else replaceChildren(n, decodeFragment(values[u.id], u));
  }
  for (const n of elements(doc, n => has(n, C.MARKER_WRAPPER))) unwrap(n);
  for (const n of elements(doc))
    for (const key of [C.MARKER_UNIT, C.MARKER_NODE, C.MARKER_WRAPPER])
      delete n.attribs[key];
}
export function addMetadata(doc, values) {
  const head = named(doc, 'head');
  if (!head) throw Error('Input must contain a head element.');
  for (const n of elements(
    head,
    n => n.name === 'meta' && Object.hasOwn(values, n.attribs.name)
  ))
    DomUtils.removeElement(n);
  for (const [name, content] of Object.entries(values))
    append(head, new Element('meta', { name, content }));
}
