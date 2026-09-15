import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ruledGrids,recoverRuledTables } from '../src/pdf2html/table-recovery.mjs';
const evidence=JSON.parse(await readFile(new URL('fixtures/semantic-evidence.json',import.meta.url),'utf8'));
const page=evidence.pages[0];
function document() {
  const texts=[['Merged heading',123,135,196,146],['Alpha',123,153,149,164],['Beta',303,153,325,164]].map(([text,l,t,r,b],index)=>({self_ref:`#/texts/${index}`,parent:{$ref:'#/body'},children:[],label:'text',content_layer:'body',text,prov:[{page_no:1,bbox:{l,t,r,b,coord_origin:'TOPLEFT'}}]}));
  return {body:{children:texts.map(item=>({$ref:item.self_ref}))},texts,tables:[]};
}
test('closed source rules recover a merged header and two data cells',()=>{
  const grids=ruledGrids(page.strokes);assert.equal(grids.length,1);assert.equal(grids[0].num_rows,2);assert.equal(grids[0].num_cols,2);assert.equal(grids[0].table_cells[0].col_span,2);
  const result=recoverRuledTables(document(),evidence);assert.deepEqual(result.tables[0].data.table_cells.map(cell=>cell.text),['Merged heading','Alpha','Beta']);assert.deepEqual(result.body.children,[{$ref:'#/tables/0'}]);
});
test('open decorations cannot become a table',()=>{assert.deepEqual(ruledGrids(page.strokes.filter(line=>line.x0!==page.strokes[0].x0 || line.x1!==line.x0)),[]);});
test('recovery rejects omitted text, overlapping tables and ambiguous cells',()=>{
  const omitted=document();omitted.texts[0].text='Merged';assert.equal(recoverRuledTables(omitted,evidence).tables.length,0);
  const ambiguous=document();ambiguous.texts[1].prov[0].bbox.r=320;assert.equal(recoverRuledTables(ambiguous,evidence).tables.length,0);
  const existing=document();existing.tables.push({prov:[{page_no:1,bbox:{l:117,t:130,r:478,b:166,coord_origin:'TOPLEFT'}}]});assert.equal(recoverRuledTables(existing,evidence).tables.length,1);
});
