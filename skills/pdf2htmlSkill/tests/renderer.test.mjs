import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { renderHtml } from '../src/pdf2html/renderer.mjs';
import { parseHtml } from '../src/pdf2html/dom.mjs';

function contract(html) {
  const $ = parseHtml(html);
  function visit(node) {
    if (node.type === 'text') return node.data.trim() ? node.data.replace(/\s+/gu, ' ') : null;
    if (!node.name) return null;
    const attributes = Object.fromEntries(Object.entries(node.attribs ?? {}).sort(([a], [b]) => a.localeCompare(b)));
    if (attributes.style) attributes.style = attributes.style.split(';').map(value => value.trim()).filter(Boolean).sort().join(';');
    return [node.name, attributes, (node.children ?? []).map(visit).filter(value => value !== null)];
  }
  return $('html').toArray().map(visit);
}
const directory = new URL('./fixtures/renderer/', import.meta.url);
for (const file of await readdir(directory)) {
  const fixture = JSON.parse(await readFile(new URL(file, directory), 'utf8'));
  test(fixture.name, async () => {
    const output = renderHtml(fixture.input, fixture.evidence, { ...fixture.options, originalRoot: fixture.originalRoot });
    try {
      assert.equal(output.css, fixture.css);
      assert.deepEqual(contract(output.html), contract(fixture.html));
    } catch (error) {
      await writeFile(new URL(`../${file}.actual.html`, import.meta.url), output.html);
      throw error;
    }
  });
}
