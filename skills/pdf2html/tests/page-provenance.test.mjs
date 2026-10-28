import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHtml} from '../src/pdf2html/dom.mjs';
import {normalizePages} from '../src/pdf2html/pages.mjs';

test('a lone page folio uses explicit source provenance instead of adjacent prose votes',()=>{
 const $=parseHtml('<html><head></head><body><div class="page"><p>Alpha beta</p><p data-pdf-page="2">2</p><p>Gamma delta</p></div></body></html>');
 const page=(page_number,text)=>({page_number,width_pt:400,height_pt:600,words:text.split(' ').map((text,index)=>({text,token:text.toLowerCase(),x0:30+index*30,x1:50+index*30,top:50,bottom:62})),images:[]});
 normalizePages($,{pages:[page(1,'Alpha beta'),page(2,'Gamma delta 2')]},[1,2]);
 assert.equal($('#page_1').text(),'Alpha beta');
 assert.equal($('#page_2 p[data-pdf-page="2"]').text(),'2');
});
