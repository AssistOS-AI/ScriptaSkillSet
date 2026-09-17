import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { borderlessGrids, sourceTables } from '../src/pdf2html/source-tables.mjs';
import { inspectSource } from '../src/pdf2html/source.mjs';
test('filled source tables are detected in an existing PDF', {skip:!process.env.PDF2HTML_TABLE_PDF}, async()=>{
  const source=await inspectSource(process.env.PDF2HTML_TABLE_PDF);
  const page=source.evidence.pages.find(p=>p.page_number===Number(process.env.PDF2HTML_TABLE_PAGE||10));
  const tables=sourceTables({pages:[page]});
  assert(tables.length>0, JSON.stringify({rectangles:page.rectangles,strokes:page.strokes}));
  assert(tables.every(t=>t.cells.every(c=>!c.text||c.typography)));
});
const evidence=JSON.parse(await readFile(new URL('fixtures/semantic-evidence.json',import.meta.url),'utf8'));
test('source provider exports merged grid spans, text, fills and individual borders',()=>{
  const tables=sourceTables(evidence);assert.equal(tables.length,1);
  assert.equal(tables[0].columns,2);assert.equal(tables[0].cells[0].colspan,2);
  assert(Number.isFinite(tables[0].topPt)&&tables[0].bottomPt>tables[0].topPt);
  assert.deepEqual(tables[0].cells.map(c=>c.text),['Merged heading','Alpha','Beta']);
  assert(tables[0].cells.every(c=>Object.keys(c.borders).length===4));
  assert(tables[0].cells.every(c=>/^#[\da-f]{6}$/i.test(c.background)));
});
test('open source grids are not certified and mixed cell fonts remain explicit',()=>{
  const copy=structuredClone(evidence);copy.pages[0].strokes=[];
  assert.deepEqual(sourceTables(copy),[]);
  const mixed=structuredClone(evidence),words=mixed.pages[0].words.filter(w=>w.top>130&&w.top<150);
  words[0].font_name='DifferentFont';
  assert.equal(sourceTables(mixed)[0].cells[0].typography,null);
});

function filledPage(){
  return {page_number:1,width_pt:400,rectangles:[0,2].flatMap(row=>[0,1].map(col=>({x0:[20,120][col],x1:[120,320][col],top:20+row*30,bottom:50+row*30,fill_color:row?'#eeeeee':'#222222'}))),strokes:[20,50,80,110].map(y=>({x0:20,x1:320,top:y,bottom:y,width:1,color:'#cccccc'})),words:[0,1,2].flatMap(row=>[0,1].map(col=>({x0:25+col*100,x1:65+col*100,top:30+row*30,bottom:40+row*30,text:`Cell${row}${col}`,font_name:'Arial',font_family:'Arial',size_pt:10,color:row?'#111111':'#ffffff'})))};
}
test('horizontal rules and alternating cell fills recover unstroked columns',()=>{
  const tables=sourceTables({pages:[filledPage()]});
  assert.equal(tables.length,1);assert.equal(tables[0].rows,3);assert.equal(tables[0].columns,2);
  assert.equal(tables[0].topPt,20);assert.equal(tables[0].bottomPt,110);
  assert.deepEqual(tables[0].cells.map(c=>c.widthPt),[100,200,100,200,100,200]);
  assert.equal(tables[0].cells[2].background,'#ffffff');
  assert(tables[0].cells.every(c=>c.borders.left==='0'&&c.borders.right==='0'));
});
test('decorative fills, crossing text and missing row boundaries do not invent a table',()=>{
  for(const mutate of [p=>p.strokes=[],p=>p.rectangles=p.rectangles.filter(r=>r.x0===20),p=>p.words.forEach(w=>{w.x0=25;w.x1=300;})]){
    const page=filledPage();mutate(page);assert.deepEqual(sourceTables({pages:[page]}),[]);
  }
});
function borderlessPage(page,rows){
  const item=(text,x0,x1,top)=>({text,x0,x1,top,bottom:top+10,size_pt:10,font_name:'Arial',font_family:'Arial',color:'#000000'});
  const text_items=[item('Concept',70,110,50),item('Meaning in practice',190,285,50)];
  rows.forEach((row,index)=>{
    const top=70+index*30;text_items.push(item(row[0],70,145,top),item(row[1],190,360,top));
    if(row[2])text_items.push(item(row[2],190,330,top+12));
  });
  return {page_number:page,width_pt:400,height_pt:600,text_items,words:[],rectangles:[],strokes:[]};
}
test('aligned borderless rows and a one-row repeated-header continuation are certified',()=>{
  const pages=[borderlessPage(1,[['Statistical bias','A systematic estimation error','continued'],['Inductive bias','A structural preference']]),borderlessPage(2,[['Normative choice','A value judgment']])];
  const grids=borderlessGrids(pages);assert.equal(grids.get(1).length,1);assert.equal(grids.get(2).length,1);
  const tables=sourceTables({pages});assert.deepEqual(tables.map(table=>[table.page,table.rows,table.columns]),[[1,3,2],[2,2,2]]);
  assert.deepEqual(tables[0].cells.map(cell=>cell.text),['Concept','Meaning in practice','Statistical bias','A systematic estimation error continued','Inductive bias','A structural preference']);
});
test('ordinary prose and an isolated two-column pair are not borderless tables',()=>{
  const prose=borderlessPage(1,[['Only one label','Only one explanation']]);
  assert.deepEqual(borderlessGrids([prose]).get(1),[]);
  prose.text_items.push({text:'A paragraph crosses the proposed split',x0:70,x1:360,top:100,bottom:110,size_pt:10,font_name:'Arial',font_family:'Arial',color:'#000000'});
  assert.deepEqual(sourceTables({pages:[prose]}),[]);
});
