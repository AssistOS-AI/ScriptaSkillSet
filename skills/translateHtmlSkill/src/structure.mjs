import path from 'node:path';
import {
  C,
  human,
  elements,
  has,
  attrs,
  serialize,
  casefold,
  rewriteReference,
  rewriteSrcset,
  rewriteCssUrls,
  exists
} from './document.mjs';
export const relevantElements = doc =>
  elements(
    doc,
    n =>
      !(
        n.name === 'meta' &&
        (C.HUMANISATION_META_NAMES ?? C.TRANSLATION_META_NAMES).includes(
          n.attribs.name
        )
      )
  );
export function structureFindings(source, target, sourcePath, targetPath) {
  const findings = [],
    left = relevantElements(source),
    right = relevantElements(target);
  if (left.length !== right.length)
    return [
      {
        severity: 'error',
        code: 'element-count',
        message: human
          ? 'Source and humanised HTML have different element counts.'
          : 'Source and translation have different element counts.',
        details: { source: left.length, target: right.length }
      }
    ];
  for (let i = 0; i < left.length; i++) {
    const a = left[i],
      b = right[i],
      index = i + 1;
    if (a.name !== b.name) {
      findings.push({
        severity: 'error',
        code: 'element-topology',
        message: `Element ${index} changed from ${a.name} to ${b.name}.`
      });
      continue;
    }
    for (const name of new Set([
      ...Object.keys(a.attribs),
      ...Object.keys(b.attribs)
    ])) {
      if (!human && a.name === 'html' && ['lang', 'dir'].includes(name))
        continue;
      if (
        C.HUMAN_ATTRIBUTES.includes(name) ||
        (a.name === 'meta' &&
          casefold(a.attribs.name ?? '') === 'description' &&
          name === 'content')
      ) {
        if (has(a, name) !== has(b, name))
          findings.push({
            severity: 'error',
            code: 'human-attribute-missing',
            message: `Element ${index} changed the presence of ${name}.`
          });
        continue;
      }
      let expected,
        actual = b.attribs[name] ?? '';
      if (C.URL_ATTRIBUTES.includes(name))
        expected = rewriteReference(
          a.attribs[name] ?? '',
          sourcePath,
          targetPath
        );
      else if (name === 'srcset')
        expected = rewriteSrcset(a.attribs[name] ?? '', sourcePath, targetPath);
      else if (name === 'style')
        expected = rewriteCssUrls(
          a.attribs[name] ?? '',
          sourcePath,
          targetPath
        );
      else {
        expected = attrs(a)[name] ?? '';
        actual = attrs(b)[name] ?? '';
      }
      if (JSON.stringify(expected) !== JSON.stringify(actual))
        findings.push({
          severity: 'error',
          code: 'protected-attribute',
          message: `Element ${index} changed protected attribute ${name}.`,
          details: { expected, actual }
        });
    }
  }
  const program = d =>
    elements(d, n => C.SKIP_TAGS.includes(n.name)).map(n => [
      n.name,
      (n.children ?? []).map(serialize).join('')
    ]);
  if (JSON.stringify(program(source)) !== JSON.stringify(program(target)))
    findings.push({
      severity: 'error',
      code: 'protected-content',
      message: human
        ? 'A script, style, code, or other protected region changed.'
        : 'Script, style, code, or another protected region changed.'
    });
  return findings;
}
export async function assetFindings(target, targetPath) {
  const f = [];
  for (const n of elements(target))
    for (const a of C.URL_ATTRIBUTES) {
      const value = n.attribs[a] ?? '';
      if (!value || /^[#/]|^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) continue;
      const local = path.resolve(
        path.dirname(targetPath),
        value.split('?')[0].split('#')[0]
      );
      if (
        (['src', 'poster'].includes(a) || n.name === 'link') &&
        !(await exists(local))
      )
        f.push({
          severity: 'error',
          code: 'missing-local-resource',
          message: `Local resource does not exist: ${value}`
        });
    }
  return f;
}
export const round4 = n => Math.round(n * 10000) / 10000;
export const status = f =>
  f.some(i => i.severity === 'error')
    ? 'failed'
    : f.length
    ? 'passed_with_warnings'
    : 'passed';
