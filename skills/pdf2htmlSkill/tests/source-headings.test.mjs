import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHtml, alignment } from '../src/pdf2html/dom.mjs';
import { recoverSourceHeading } from '../src/pdf2html/source-headings.mjs';
import { formatBlocks } from '../src/pdf2html/formatting.mjs';

function fixture() {
  const words = [
    { text: 'EPILOGUE', token: 'epilogue', x0: 52, x1: 94, top: 47, bottom: 55.5, size_pt: 8.5, bold: true },
    { text: 'Ending', token: 'ending', x0: 78, x1: 200, top: 92, bottom: 110, size_pt: 18, bold: false },
  ].map(word => ({ ...word, font_name: 'Book-Medium', font_family: 'serif', color: '#111111' }));
  const page = { width_pt: 432, height_pt: 648, words, lines: words, images: [], strokes: [{ x0: 52, x1: 387, top: 62, bottom: 62, width: 2, color: '#862f35' }] };
  return { page, evidence: { pages: [page] }, $: parseHtml('<section><h2>Ending</h2></section>') };
}

test('recovers an omitted ruled chapter label once from exact source text', () => {
  const { $, page, evidence } = fixture(), section = $('section')[0];
  recoverSourceHeading($, section, page, evidence);
  recoverSourceHeading($, section, page, evidence);
  assert.equal($('section > p').text(), 'EPILOGUE');
  assert.equal($('section > p').length, 1);
  assert.equal($('section').children().first().text(), 'EPILOGUE');
});

test('does not invent labels from unruled, repeated, or image content', () => {
  for (const mode of ['unruled', 'repeated', 'image']) {
    const { $, page, evidence } = fixture();
    if (mode === 'unruled') page.strokes = [];
    if (mode === 'repeated') evidence.pages.push(structuredClone(page));
    if (mode === 'image') $('section').append('<figure><img src="picture.png"></figure>');
    recoverSourceHeading($, $('section')[0], page, evidence);
    assert.equal($('section > p').length, 0, mode);
  }
});

test('source medium display type keeps its 18pt size without heading bold synthesis', () => {
  const { $, page } = fixture(), section = $('section')[0];
  formatBlocks($, section, page, alignment(page, section), { body_size_pt: 10.5, body_family: 'serif', body_font_name: 'Book-Regular', text_color: '#111111' }, [{ source_name: 'Book-Medium', css_family: 'source-medium' }]);
  assert.match($('h2').attr('style'), /font-weight: 400/);
  assert.match($('h2').attr('style'), /font-size: calc\(var\(--pdf-reader-size\) \* 1.7143\)/);
  assert.match($('h2').attr('style'), /source-medium/);
});
