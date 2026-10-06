import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compareText, validateContent } from '../src/pdf2html/content-validation.mjs';
import { parseHtml as parse } from '../src/pdf2html/dom.mjs';
const parseHtml = html => parse(`<html><head></head><body>${html}</body></html>`);
const original = 'He was tired. Nevertheless, he continued working.';
for (const [name, changed] of [
  ['missing word', 'He was tired. Nevertheless, he continued.'],
  ['merged sentences', 'He was tired, nevertheless, he continued working.'],
  ['duplication', original + ' ' + original],
  ['reordered sentences', 'Nevertheless, he continued working. He was tired.'],
  ['changed capitalization', original.toLowerCase()],
  ['changed number', 'He was tired. Nevertheless, he continued working. 12'],
]) test(`strict text rejects ${name}`, () => assert.equal(compareText(original, changed)[0].severity, 'error'));
test('presentation ligatures, Unicode composition and whitespace are equivalent', () => {
  assert.deepEqual(compareText('ﬁle café.\nNext line.', 'file cafe\u0301. Next   line.'), []);
});
test('loss below the former two percent threshold fails', () => {
  const source = Array.from({length: 200}, (_, i) => `word${i}`).join(' ');
  assert.equal(compareText(source, source.replace('word199', '')).length, 1);
});
const profile = { pages: 2, page_text: ['First page.', 'Second page.'] };
const page = (n, value) => `<section id="page_${n}" data-source-page="${n}"><p>${value}</p></section>`;
test('metadata is excluded, while body additions and page relocation fail', () => {
  assert.deepEqual(validateContent(profile, parse(`<html><head><title>Metadata</title></head><body>${page(1,'First page.')}${page(2,'Second page.')}</body></html>`)), []);
  assert.ok(validateContent(profile, parseHtml(`${page(1,'Second page.')}${page(2,'First page.')}`)).some(f => f.code === 'source-text-mismatch'));
  assert.ok(validateContent(profile, parseHtml(`${page(1,'First page.')}${page(2,'Second page.')}Extra`)).some(f => f.code === 'text-outside-source-pages'));
  assert.ok(validateContent(profile, parseHtml(`${page(2,'Second page.')}${page(1,'First page.')}`)).some(f => f.code === 'source-page-structure'));
});
test('source table cells and spans are checked independently of Docling counts', async () => {
  const evidence = JSON.parse(await readFile(new URL('fixtures/semantic-evidence.json', import.meta.url), 'utf8'));
  const table = '<table><tr><td colspan="2">Merged heading</td></tr><tr><td>Alpha</td><td>Beta</td></tr></table>';
  const check = value => validateContent({pages:1,page_text:['Merged heading Alpha Beta']}, parseHtml(page(1,value)), evidence);
  assert.ok(!check(table).some(f => f.code === 'source-table-mismatch'));
  assert.ok(check(table.replace('colspan="2"','colspan="1"')).some(f => f.code === 'source-table-mismatch'));
  assert.ok(check(table.replace('<td>Alpha</td><td>Beta</td>','<td>Alpha Beta</td><td></td>')).some(f => f.code === 'source-table-mismatch'));
  assert.ok(check(table).some(f => f.code === 'source-image-missing'));
});

test('clear source paragraph gaps cannot be flattened into one paragraph', () => {
  const lines=[{text:'First paragraph.',top:100,bottom:112,size_pt:12,x0:40,x1:150},{text:'Second paragraph.',top:150,bottom:162,size_pt:12,x0:40,x1:160}];
  const evidence={pages:[{page_number:1,width_pt:600,height_pt:800,words:[],lines,images:[],strokes:[],rectangles:[]}]};
  const profile={pages:1,page_text:['First paragraph. Second paragraph.']};
  assert.ok(validateContent(profile,parseHtml(page(1,'First paragraph. Second paragraph.')),evidence).some(f=>f.code==='source-block-merged'));
  assert.ok(!validateContent(profile,parseHtml(page(1,'First paragraph.</p><p>Second paragraph.')),evidence).some(f=>f.code==='source-block-merged'));
});

test('image comparison rejects blank and differently colored replacements', async () => {
  const { imageDifference } = await import('../src/pdf2html/image-validation.mjs');
  const image = color => ({width:2,height:2,data:Buffer.from(Array.from({length:4},()=>[...color,255]).flat())});
  assert.equal(imageDifference(image([255,0,0]),image([255,0,0])),0);
  assert.ok(imageDifference(image([255,0,0]),image([255,255,255])) > .05);
  assert.ok(imageDifference(image([255,0,0]),image([0,0,255])) > .05);
});

test('inline emphasis inside a word does not change the text sequence', () => {
  assert.deepEqual(validateContent({pages:1,page_text:['Cooperate.']},parseHtml(page(1,'Co<strong>operate</strong>.'))),[]);
});
