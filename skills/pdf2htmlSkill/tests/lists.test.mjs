import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceLists, recoverSourceLists } from '../src/pdf2html/lists.mjs';
import { parseHtml } from '../src/pdf2html/dom.mjs';

const group={page:1,kind:'ol',start:4,bodyLeft:50,items:[{text:'4. First: question?',number:4,marker:'4.',size:10,leading:14,gap:3,left:56,textLeft:70},{text:'5. Second question?',number:5,marker:'5.',size:10,leading:14,gap:3,left:56,textLeft:70}]};
test('recovers an ordered list without absorbing following prose or losing inline emphasis',()=>{
 const $=parseHtml('<section><p id="page_1">4. <strong>First</strong>: question? 5. Second question? Following prose.</p></section>'),before=$('section').text();
 recoverSourceLists($,$('section')[0],[group],11);
 assert.equal($('ol').attr('start'),'4');assert.equal($('li').length,2);assert.equal($('li strong').text(),'First');assert.equal($('section > p').text(),'Following prose.');
 assert.equal($('section').text(),before);assert.equal($('#page_1').length,1);assert.equal($('.source-list-marker').length,2);
 const once=$.html();recoverSourceLists($,$('section')[0],[group],11);assert.equal($.html(),once);
});
test('does not infer lists from numbers inside prose or convert a numbered contents table',()=>{
 const page={page_number:1,height_pt:600,words:[],lines:[{text:'Body',top:80,bottom:90,x0:50,x1:300,size_pt:10},{text:'A paragraph mentions 1. and 2.',top:100,bottom:110,x0:50,x1:300,size_pt:10}]};
 assert.deepEqual(sourceLists({pages:[page]}),[]);
 page.lines.push(...['1. First chapter 9','2. Second chapter 16'].map((text,i)=>({text,top:150+i*20,bottom:160+i*20,x0:50,x1:350,size_pt:10})));
 assert.deepEqual(sourceLists({pages:[page]}),[]);
});
