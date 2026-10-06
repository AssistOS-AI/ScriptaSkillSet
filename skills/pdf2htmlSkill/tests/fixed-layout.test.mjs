import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHtml } from '../src/pdf2html/dom.mjs';
import { applyFixedLayout } from '../src/pdf2html/fixed-layout.mjs';

test('each page keeps its own source size and independently positioned text', () => {
  const $ = parseHtml('<!doctype html><html><body><main class="pdf-document"><section class="source-page" data-source-page="1" id="page_1"><p>First page.</p></section><section class="source-page" data-source-page="2" id="page_2"><p>Second page.</p></section></main></body></html>');
  const evidence = { typography:{body_size_pt:10}, pages:[
    {page_number:1,width_pt:500,height_pt:700,words:[{text:'First',token:'first',x0:50,x1:77,top:80,bottom:90,size_pt:10},{text:'page',token:'page',x0:80,x1:105,top:80,bottom:90,size_pt:10}],images:[],strokes:[],rectangles:[]},
    {page_number:2,width_pt:600,height_pt:800,words:[{text:'Second',token:'second',x0:120,x1:160,top:180,bottom:190,size_pt:10},{text:'page',token:'page',x0:165,x1:190,top:180,bottom:190,size_pt:10}],images:[],strokes:[],rectangles:[]},
  ] };
  applyFixedLayout($,$('main')[0],evidence);
  assert.deepEqual($('.pdf-page-frame').map((_,frame)=>[frame.attribs['data-pdf-width'],frame.attribs['data-pdf-height']]).get(),['500','700','600','800']);
  assert.match($('#page_1').attr('style'),/width: 500\.00pt; height: 700\.00pt/);
  assert.match($('#page_2').attr('style'),/width: 600\.00pt; height: 800\.00pt/);
  assert.match($('#page_1 p').attr('style'),/left: 50\.00pt; top: 80\.00pt/);
  assert.match($('#page_2 p').attr('style'),/left: 120\.00pt; top: 180\.00pt/);
  assert.equal($('[data-pdf-position-unresolved]').length,0);
  assert.equal($('script#pdf2html-reader-bridge').length,1);
});

test('Docling page geometry positions a region with no matching text glyphs', () => {
  const $=parseHtml('<main class="pdf-document"><section class="source-page" data-source-page="1" id="page_1"><figure data-pdf-page="1" data-pdf-box="20,30,120,80"><img src="picture.png"></figure></section></main>');
  applyFixedLayout($,$('main')[0],{typography:{body_size_pt:10},pages:[{page_number:1,width_pt:500,height_pt:700,words:[],images:[],strokes:[],rectangles:[]}]});
  assert.match($('#page_1 figure').attr('style'),/left: 20\.00pt; top: 30\.00pt; width: 100\.00pt/);
});
