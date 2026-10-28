import test from 'node:test';
import assert from 'node:assert/strict';
import { manuscriptEvidence, compareManuscriptText } from '../src/manuscript-text.mjs';
function page(texts,page=1) {
  return {page,height:800,width:600,blocks:[{lines:texts.map((text,index)=>({text,left:40,right:550,top:100+index*15,bottom:110+index*15}))}]};
}
const source='One — two. Three well-known words.';
const check=(text)=>compareManuscriptText(manuscriptEvidence([page([source])]),{manuscriptText:text});
test('book acceptance preserves punctuation, case, order and every word',()=>{
  assert.deepEqual(check(source),[]);
  for(const text of [source.replace('—','-'),source.toLowerCase(),source.replace('two.','two,'),source.replace(' two.',''),source+source,source.replace('well-known','wellknown'),'Three well-known words. One — two.']) {
    assert.equal(check(text)[0].category,'source_text_mismatch');
  }
});
test('NFC, presentation ligatures and inline whitespace are equivalent',()=>{
  const evidence=manuscriptEvidence([page(['ﬁle café.'])]);
  assert.deepEqual(compareManuscriptText(evidence,{manuscriptText:'file cafe\u0301.\n'}),[]);
});
test('only evidenced line-end joins are allowed',()=>{
  const pages=[page(['An ex‐','termination. Another extermination.'])];
  const output={manuscriptText:'An extermination. Another extermination.'};
  assert.deepEqual(compareManuscriptText(manuscriptEvidence(pages),output),[]);
  pages[0].blocks[0].lines[1].top=150;
  assert.equal(compareManuscriptText(manuscriptEvidence(pages),output).length,1);
  assert.equal(compareManuscriptText(manuscriptEvidence([page(['An ex‐','termination.'])]),{manuscriptText:'An extermination.'}).length,1);
});
test('a full compound spelling prevents an ambiguous join',()=>{
  const evidence=manuscriptEvidence([page(['A well-','known case. A wellknown and well-known case.'])]);
  assert.equal(compareManuscriptText(evidence,{manuscriptText:'A wellknown case. A wellknown and well-known case.'}).length,1);
});
test('printed folios require geometric evidence; manuscript numbers are kept',()=>{
  const pdf=page(['Chapter 1','42','Last paragraph.']);
  pdf.blocks.push({lines:[{text:'1',left:290,right:300,top:760,bottom:770}]});
  const evidence=manuscriptEvidence([pdf]);
  assert.deepEqual(compareManuscriptText(evidence,{manuscriptText:'Chapter 1 42 Last paragraph.'}),[]);
  assert.equal(compareManuscriptText(evidence,{manuscriptText:'Chapter 1 Last paragraph.'}).length,1);
});
test('missing measurement is an error, never a pass',()=>{
  assert.equal(compareManuscriptText(manuscriptEvidence([page(['Text.'])]),{})[0].category,'source_text_unchecked');
});
test('different wrapping and joined words across pages preserve narrative order',()=>{
  const a=page(['A lead‐']),b=page(['ing sentence. Another leading sentence.'],2);
  a.blocks[0].lines[0].top=700;a.blocks[0].lines[0].bottom=710;
  assert.deepEqual(compareManuscriptText(manuscriptEvidence([a,b]),{manuscriptText:'A leading sentence. Another leading sentence.'}),[]);
});

test('PDF block classification alone does not invalidate a geometrically continuous split word',()=>{
 const pdf=page(['An ex‐','termination. Another extermination.']);
 const second=pdf.blocks[0].lines.pop();pdf.blocks.push({lines:[second]});
 assert.deepEqual(compareManuscriptText(manuscriptEvidence([pdf]),{manuscriptText:'An extermination. Another extermination.'}),[]);
});

test('an unbroken component of a source compound is spelling evidence, without dropping compound hyphens',()=>{
 const a=page(['Auschwitz-Birkenau. Camps like Aus‐']),b=page(['chwitz, Treblinka and Sobibor.'],2);
 a.blocks[0].lines[0].top=700;a.blocks[0].lines[0].bottom=710;
 const evidence=manuscriptEvidence([a,b]);
 assert.deepEqual(compareManuscriptText(evidence,{manuscriptText:'Auschwitz-Birkenau. Camps like Auschwitz, Treblinka and Sobibor.'}),[]);
 assert.equal(compareManuscriptText(evidence,{manuscriptText:'AuschwitzBirkenau. Camps like Auschwitz, Treblinka and Sobibor.'}).length,1);
});
