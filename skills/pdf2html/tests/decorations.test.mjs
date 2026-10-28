import test from 'node:test';
import assert from 'node:assert/strict';
import { paragraphBorders, applyParagraphBorders } from '../src/pdf2html/decorations.mjs';
import { parseHtml, alignment } from '../src/pdf2html/dom.mjs';

const stroke = (top,bottom) => ({x0:65,x1:65,top,bottom,width:2,color:'#777777'});
const page = () => ({page_number:1,height_pt:600,lines:[{text:'Body',x0:50,x1:300,top:80,bottom:90,size_pt:10},{text:'A quotation',x0:74,x1:180,top:104,bottom:114,size_pt:10},{text:'continues here.',x0:74,x1:180,top:118,bottom:128,size_pt:10}], strokes:[stroke(100,116),stroke(115,132)],words:[]});
test('merges quote segments, derives source insets, excludes a table edge', () => {
  const p=page(), profile=paragraphBorders({pages:[p]});
  assert.equal(profile.borders.length,1); assert.equal(profile.borders[0].text,'A quotation continues here.');
  assert.equal(profile.borders[0].properties['padding-left'],'0.800000em');
  assert.equal(profile.borders[0].properties['margin-left'],'1.400000em');
  p.strokes.push({x0:65,x1:300,top:100,bottom:100,width:1,color:'#777777'});
  assert.equal(paragraphBorders({pages:[p]}).borders.length,0);
});
test('renderer decorates the aligned quote, preserves prose and does not decorate a partial paragraph', () => {
  const p=page();
  p.words=p.lines.flatMap(l=>l.text.replace('.','').split(' ').map(text=>({...l,text,token:text.toLowerCase()})));
  const $=parseHtml('<section><p>Body</p><p>A quotation continues here.</p></section>'), section=$('section')[0];
  applyParagraphBorders($,section,p,alignment(p,section));
  assert.equal($('p').first().attr('style'),undefined);
  assert.match($('p').last().attr('style'),/border-left: 0.200000em solid #777777/);
  assert.equal($('p').last().text(),'A quotation continues here.');
  $('p').last().removeAttr('style').append(' Extra prose');
  applyParagraphBorders($,section,p,alignment(p,section));
  assert.equal($('p').last().attr('style'),undefined);
});
test('unmatched vertical source graphics remain explicit and no-stroke pages invent no border', () => {
  const p=page();p.lines=[];
  assert.equal(paragraphBorders({pages:[p]}).unresolved.length,1);
  p.strokes=[];assert.deepEqual(paragraphBorders({pages:[p]}),{borders:[],unresolved:[],horizontalRules:[]});
});
test('isolated display rules retain source color and geometry, table edges are excluded',()=>{
  const p=page();p.strokes=[{x0:50,x1:300,top:190,bottom:190,width:1.5,color:'#007c82'}];
  assert.equal(paragraphBorders({pages:[p]}).horizontalRules[0].color,'#007c82');
  p.strokes.push({x0:50,x1:50,top:180,bottom:200,width:1,color:'#007c82'});
  assert.equal(paragraphBorders({pages:[p]}).horizontalRules.length,0);
});
