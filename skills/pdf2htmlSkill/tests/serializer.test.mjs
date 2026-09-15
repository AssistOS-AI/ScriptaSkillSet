import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serializeDocument } from '../src/pdf2html/serializer.mjs';
import { parseHtml } from '../src/pdf2html/dom.mjs';

test('native list groups preserve starts, skipped numbers and nested bullet lists', async t => {
  const root = await mkdtemp(join(tmpdir(), 'pdf2html-lists-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const ref = $ref => ({ $ref });
  const document = { body: { children: [ref('#/groups/0'), ref('#/groups/2')] }, groups: [
    { self_ref: '#/groups/0', label: 'list', children: [ref('#/texts/0'), ref('#/texts/1')] },
    { self_ref: '#/groups/1', label: 'list', children: [ref('#/texts/2')] },
    { self_ref: '#/groups/2', label: 'list', children: [ref('#/texts/3')] },
  ], texts: [
    { self_ref: '#/texts/0', label: 'list_item', text: 'First', enumerated: true, marker: '4.', children: [ref('#/groups/1')] },
    { self_ref: '#/texts/1', label: 'list_item', text: 'Second', enumerated: true, marker: '7.' },
    { self_ref: '#/texts/2', label: 'list_item', text: 'Nested bullet', enumerated: false, marker: '-' },
    { self_ref: '#/texts/3', label: 'list_item', text: 'Restart', enumerated: true, marker: '1.' },
  ] };
  const result = await serializeDocument(document, {}, root, 2), $ = parseHtml(result.html);
  assert.deepEqual($('ol').map((_, node) => $(node).attr('start')).get(), ['4', '1']);
  assert.deepEqual($('ol').first().children('li').map((_, node) => $(node).attr('value')).get(), ['4', '7']);
  assert.equal($('ol > li > ul > li').text(), 'Nested bullet');
  assert.equal($('ul > li').attr('value'), undefined);
});

test('enumerated items without markers remain ordered; bullet items remain unordered', async t => {
  const root = await mkdtemp(join(tmpdir(), 'pdf2html-lists-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const document = { body: { children: [{ $ref: '#/groups/0' }, { $ref: '#/groups/1' }] }, groups: [
    { self_ref: '#/groups/0', label: 'list', children: [{ $ref: '#/texts/0' }] },
    { self_ref: '#/groups/1', label: 'list', children: [{ $ref: '#/texts/1' }] },
  ], texts: [
    { self_ref: '#/texts/0', label: 'list_item', text: 'Ordered', enumerated: true },
    { self_ref: '#/texts/1', label: 'list_item', text: 'Bullet', enumerated: false, marker: '-' },
  ] };
  const $ = parseHtml((await serializeDocument(document, {}, root, 2)).html);
  assert.equal($('ol > li').text(), 'Ordered');
  assert.equal($('ol').attr('start'), undefined);
  assert.equal($('ul > li').text(), 'Bullet');
});
