import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceVocabulary } from '../src/pdf2html/text-fidelity.mjs';
import { restoreSourcePunctuation } from '../src/pdf2html/source-punctuation.mjs';
import { parseHtml } from '../src/pdf2html/dom.mjs';
function restore(source,html) {
  const page={source_text:source,lines:source.split('\n').map((text,index)=>({text,top:100+index*15,bottom:110+index*15,x0:40,x1:400,size_pt:10}))};
  const $=parseHtml(`<section>${html}</section>`);
  restoreSourcePunctuation($('section')[0],page,sourceVocabulary([source]));
  return $;
}
test('conversion restores source dashes, quotes and ambiguous compound spelling',()=>{
  const $=restore('A well-\nknown case — “not” a guess.', '<p>A <strong>wellknown</strong> case - "not" a guess.</p>');
  assert.equal($('p').text(),'A well-known case — “not” a guess.');
  assert.equal($('strong').text(),'well-known');
});
test('conversion retains a joined spelling evidenced elsewhere in the source',()=>{
  const $=restore('An ex‐\ntermination. Another extermination.', '<p>An extermination. Another extermination.</p>');
  assert.equal($('p').text(),'An extermination. Another extermination.');
});
test('conversion leaves unrelated missing text for the book validator',()=>{
  const $=restore('One — two and three.', '<p>One - missing.</p>');
  assert.equal($('p').text(),'One — missing.');
});
test('conversion does not replace a dash without source evidence',()=>{
  const $=restore('One - two.', '<p>One — two.</p>');
  assert.equal($('p').text(),'One — two.');
});

test('an unmatched opening does not block punctuation restoration after a unique exact context',()=>{
  const $=restore('ing with several exact words from the source. The region’s politics — and history.',
    '<p>leading with several exact words from the source. The region\'s politics - and history.</p>');
  assert.equal($('p').text(),'leading with several exact words from the source. The region’s politics — and history.');
});
test('regional restoration preserves unrelated missing words',()=>{
  const $=restore('First missing words. Here are six exact words for alignment. It’s unchanged.',
    '<p>First. Here are six exact words for alignment. It\'s unchanged.</p>');
  assert.equal($('p').text(),'First. Here are six exact words for alignment. It’s unchanged.');
});

test('a dropped internal compound hyphen is restored exactly from source',()=>{
  assert.equal(restore('A Polish-Jewish lawyer.','<p>A PolishJewish lawyer.</p>')('p').text(),'A Polish-Jewish lawyer.');
});

test('typographic double quotes folded to ASCII apostrophes regain the source characters',()=>{
 assert.equal(restore('Wiesel’s “Night” and Levi’s “If This Is a Man”.',"<p>Wiesel's 'Night' and Levi's 'If This Is a Man'.</p>")('p').text(),'Wiesel’s “Night” and Levi’s “If This Is a Man”.');
});
