import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { compareTables, validateTableEvidence, translatedTables } from '../src/tables.mjs';
import { sourceDecorations, sourceFonts } from '../src/decorations.mjs';
import { familyKey } from '../src/typography.mjs';
import { paginationCss } from '../src/pagination.mjs';
import { fileHash } from '../src/storage.mjs';
import { openBrowser } from '../src/browser.mjs';
import { inspectLayout } from '../src/layout-checks.mjs';
import { navigate, applyDomRepairs, importReaderArticle } from '../src/layout-browser.mjs';

const source={page:14,rows:2,columns:2,widthPt:300,cells:[0,1,2,3].map(i=>({row:Math.floor(i/2),col:i%2,rowspan:1,colspan:1,text:['Pattern','Meaning','Sponsor','Public benefit'][i],widthPt:i%2?200:100,background:i<2?'#193646':'#ffffff',borders:Object.fromEntries(['top','right','bottom','left'].map(side=>[side,'1.00pt solid #aabbcc'])),typography:{name:'Arial',family:'Arial',sizePt:9,color:i<2?'#ffffff':'#111111',weight:i<2?700:400,style:'normal',leadingPt:12,paddingPt:[3,4,3,4],indentPt:0}}))};
source.cells.forEach(c=>c.typography.align='left');
const options={sourceFontMap:{arial:'"Arial", sans-serif'},defaultSizePx:16};
function documentFixture(){return {width:1024,records:[{tag:'table',selector:'#table',page:14,bounds:{left:0,right:600},cells:source.cells.map((c,i)=>({row:c.row,col:c.col,rowspan:1,colspan:1,text:c.text,selector:'#c'+i,width:c.widthPt*2,background:i<2?'rgb(25, 54, 70)':'rgb(255, 255, 255)',color:i<2?'rgb(255, 255, 255)':'rgb(17, 17, 17)',font:{family:'Arial, sans-serif',size:'12px',weight:i<2?'700':'400',style:'normal'},lineHeight:'16px',textAlign:'left',indent:0,padding:[4,16/3,4,16/3],borders:Object.fromEntries(['top','right','bottom','left'].map(side=>[side,{width:1,style:'solid',color:'rgb(170, 187, 204)'}]))}))}]};}
test('table evidence rejects missing, malformed and overlapping grids',()=>{
  validateTableEvidence([source]);assert.throws(()=>validateTableEvidence(undefined),/table evidence/);
  const bad=structuredClone(source);bad.cells[1].col=0;assert.throws(()=>validateTableEvidence([bad]),/Overlapping/);
  bad.cells[1].col=1;bad.cells[0].background='url(remote)';assert.throws(()=>validateTableEvidence([bad]),/cell/);
});
test('table validation catches white-on-light headers, changed fills, borders and column proportions',()=>{
  const doc=documentFixture();assert.deepEqual(compareTables([source],doc,options).findings,[]);
  for(const mutate of [c=>c.background='rgba(255, 255, 255, 0.08)',c=>c.width=300,c=>c.font.weight='400',c=>c.borders.left.width=0,c=>c.padding[0]=20]){
    const broken=documentFixture();mutate(broken.records[0].cells[0]);
    const result=compareTables([source],broken,options);assert(result.findings.some(f=>f.category==='source_table_cell_difference'&&f.severity==='error'));assert(result.actions.some(a=>a.selector==='#c0'));
  }
});
test('split PDF glyph runs do not authorize a table text rewrite',()=>{
  const split=structuredClone(source),doc=documentFixture();
  split.cells[3].text='Public benefit scienti fi c';
  doc.records[0].cells[3].text='Public benefit scientific';
  const result=compareTables([split],doc,options);
  assert(!result.actions.some(action=>action.kind==='table_fragments'));
  assert(!result.findings.some(finding=>finding.category==='source_table_text_case_difference'));
});
test('mixed source typography still transfers structural cell presentation',()=>{
  const mixed=structuredClone(source),doc=documentFixture();
  mixed.cells[3].typography=null;doc.records[0].cells[3].width=300;
  const result=compareTables([mixed],doc,options);
  assert(result.findings.some(finding=>finding.category==='source_table_typography_unmapped'));
  assert(result.actions.some(action=>action.selector==='#c3'&&action.properties.width==='66.667%'));
});
test('partial text, wrong spans, duplicate tables and unsupported source grids never authorize repairs',()=>{
  for(const mutate of [d=>d.records[0].cells[0].text+=' Extra',d=>d.records[0].cells[0].colspan=2,d=>d.records.push(structuredClone(d.records[0]))]){
    const doc=documentFixture();mutate(doc);const result=compareTables([source],doc,options);assert(result.findings.length);assert.equal(result.actions.length,0);
  }
  assert.equal(compareTables([],documentFixture(),options).findings[0].category,'html_table_unmapped');
});

test('empty converter spacer cells are removed when every source row maps exactly',()=>{
  const doc=documentFixture();
  doc.records[0].cells=doc.records[0].cells.flatMap(c=>[
    {...c,selector:c.selector+'a',col:c.col*2},
    {...c,selector:c.selector+'b',text:'',col:c.col*2+1,width:1}
  ]);
  const result=compareTables([source],doc,options);
  assert(result.findings.some(f=>f.category==='source_table_grid_difference'));
  assert(result.actions.some(a=>a.kind==='table_grid'));
  assert(!result.findings.some(f=>f.category==='source_table_unmapped'||f.category==='html_table_unmapped'));
});

test('empty spacer repair accepts alternating header and body offsets',()=>{
  const doc=documentFixture(),cells=doc.records[0].cells;
  doc.records[0].cells=[
    {...cells[0],text:'',col:0,selector:'#empty-h0'},{...cells[0],col:1,selector:'#h0'},{...cells[1],text:'',col:2,selector:'#empty-h1'},{...cells[1],col:3,selector:'#h1'},
    {...cells[2],col:0,selector:'#b0'},{...cells[2],text:'',col:1,selector:'#empty-b0'},{...cells[3],col:2,selector:'#b1'},{...cells[3],text:'',col:3,selector:'#empty-b1'}
  ];
  const repair=compareTables([source],doc,options).actions.find(a=>a.kind==='table_grid');
  assert.deepEqual(repair.rows.map(r=>r.keep),[[1,3],[0,2]]);
});

test('one PDF table split across tables and an intervening paragraph is reconstructed uniquely',()=>{
  const doc=documentFixture(),base=doc.records[0],cells=base.cells;
  const first={...base,nodeIndex:10,cells:[
    {...cells[0],selector:'#h0',nodeIndex:11},{...cells[1],selector:'#h1',nodeIndex:12},
    {...cells[2],selector:'#b0',nodeIndex:13},{...cells[3],selector:'#b1',nodeIndex:14,text:'Public'}
  ]};
  const second={...base,selector:'#tail',nodeIndex:16,cells:[{...cells[3],selector:'#empty',nodeIndex:17,text:'',row:0,col:1}]};
  doc.records=[first,...first.cells.map(c=>({tag:'td',selector:c.selector,nodeIndex:c.nodeIndex,page:14,text:c.text})),{tag:'p',selector:'#middle',nodeIndex:15,page:14,text:'benefit'},second,{tag:'td',selector:'#empty',nodeIndex:17,page:14,text:''}];
  const result=compareTables([source],doc,options),repair=result.actions.find(a=>a.kind==='table_fragments');
  assert(repair);assert.equal(repair.rows[1][1].text,'Public benefit');assert.equal(repair.tables.length,2);
  assert(result.findings.some(f=>f.category==='source_table_fragmentation'));
});

test('one malformed table absorbs an adjacent repeated header and split physical rows',()=>{
  const doc=documentFixture(),base=doc.records[0],cells=base.cells;
  const table={...base,nodeIndex:20,cells:[
    {...cells[2],selector:'#b0',nodeIndex:21,row:0,col:0},
    {...cells[3],selector:'#b1a',nodeIndex:22,text:'Public',row:0,col:1},
    {...cells[3],selector:'#b1b',nodeIndex:23,text:'benefit',row:1,col:1}
  ]};
  doc.records=[
    {tag:'p',selector:'#page-header',nodeIndex:19,page:14,text:'Meaning Pattern',id:'page_14'},
    table,
    ...table.cells.map(cell=>({tag:'td',selector:cell.selector,nodeIndex:cell.nodeIndex,page:14,text:cell.text}))
  ];
  const result=compareTables([source],doc,options),repair=result.actions.find(action=>action.kind==='table_fragments');
  assert(repair);assert.equal(repair.tables.length,1);
  assert.deepEqual(repair.rows.map(row=>row.map(cell=>cell.text)),[['Pattern','Meaning'],['Sponsor','Public benefit']]);
  assert(repair.remove.some(fragment=>fragment.selector==='#page-header'));
});

test('source table with header word outside table reconstructs from exact PDF inventory',()=>{
  const mkCell=(row,col,text)=>({row,col,rowspan:1,colspan:1,text,widthPt:80,background:row===0?'#193646':'#ffffff',borders:Object.fromEntries(['top','right','bottom','left'].map(side=>[side,'1.00pt solid #aabbcc'])),typography:{name:'Arial',family:'Arial',sizePt:9,color:row===0?'#ffffff':'#111111',weight:row===0?700:400,style:'normal',leadingPt:12,paddingPt:[3,4,3,4],indentPt:0,align:'left'}});
  const rows=[['Domain','Coherence operation','Useful form','Perverse form'],['Mediation','Reframe accusations as a shared problem','Makes negotiation possible while preserving facts power and obligations','Creates fictional symmetry between abuse and the response to abuse'],['Education','One model for different examples','Declares the simplification and shows where it breaks','Turns the metaphor into a universal mechanism']];
  const sourceTable={page:53,rows:3,columns:4,widthPt:320,pageWidthPt:432,topPt:193,bottomPt:300,cells:rows.flatMap((row,r)=>row.map((text,c)=>mkCell(r,c,text)))};
  const table={tag:'table',selector:'#coherence',page:53,nodeIndex:20,rows:Array.from({length:6},()=>[{tag:'td'},{tag:'td'},{tag:'td'},{tag:'td'}]),cells:[
    ['Domain','operation','Useful form Makes negotiation possible while','Perverse form Creates fictional'],
    ['','Reframe accusations','','symmetry between'],
    ['Mediation','','preserving facts,',''],
    ['','as a shared problem','power, and obligations','abuse and the response to abuse'],
    ['','One model for','Declares the simplification and','Turns the metaphor'],
    ['Education','different examples','shows where it breaks','into a universal mechanism']
  ].flatMap((row,r)=>row.map((text,c)=>({row:r,col:c,text,selector:`#h${r}_${c}`,nodeIndex:21+r*4+c})))};
  const doc={width:1024,records:[{tag:'p',selector:'#caption',page:53,nodeIndex:19,text:'Coherence'},table,...table.cells.map(c=>({tag:'td',selector:c.selector,page:53,nodeIndex:c.nodeIndex,text:c.text}))]};
  const result=compareTables([sourceTable],doc,options),repair=result.actions.find(a=>a.kind==='table_fragments');
  const compact=value=>String(value).replace(/[^\p{L}\p{N}]+/gu,'').toLowerCase();
  assert(repair);assert.deepEqual(repair.rows.map(row=>row.map(cell=>compact(cell.text))),rows.map(row=>row.map(compact)));
  assert(!result.findings.some(f=>f.category==='source_table_unmapped'||f.category==='html_table_unmapped'));
});

test('continued source table is reconstructed from one malformed HTML table with repeated header',()=>{
  const mkCell=(row,col,text)=>({row,col,rowspan:1,colspan:1,text,widthPt:80,background:row===0?'#193646':'#ffffff',borders:Object.fromEntries(['top','right','bottom','left'].map(side=>[side,'1.00pt solid #aabbcc'])),typography:{name:'Arial',family:'Arial',sizePt:9,color:row===0?'#ffffff':'#111111',weight:row===0?700:400,style:'normal',leadingPt:12,paddingPt:[3,4,3,4],indentPt:0,align:'left'}});
  const header=['Stage','Operation','Local gain','Epistemic risk'];
  const firstRows=[header,['Juxtaposition','The prompt places the phenomena together','Focuses comparison','Proximity is treated as a relation'],['Shared vocabulary','Terms valid for both are found','Creates a common language','Polysemy is confused with mechanism'],['Abstraction','A super category appears','Compresses and orders','The category no longer discriminates']];
  const secondRows=[header,['Parallelism','Differences are formulated symmetrically','Memorability','Form appears to be evidence'],['Elaboration','The frame generates consequences and examples','Productivity','Internal confirmations appear to be independent support'],['Caveat','A local reservation is added','Verbal modesty','The conclusion remains unchanged']];
  const sourceParts=[firstRows,secondRows].map((rows,index)=>({page:16+index,rows:rows.length,columns:4,widthPt:320,pageWidthPt:432,topPt:index?48:413,bottomPt:index?171:527,cells:rows.flatMap((row,r)=>row.map((text,c)=>mkCell(r,c,text)))}));
  const table={tag:'table',selector:'#six',page:16,nodeIndex:10,rows:Array.from({length:12},()=>[{tag:'td'},{tag:'td'},{tag:'td'},{tag:'td'}]),cells:[
    ['Stage','Operation The prompt places','Local gain','Epistemic risk Proximity is treated'],
    ['Juxtaposition','the phenomena together Terms valid for both Creates a common','Focuses comparison','as a relation Polysemy is'],
    ['Shared vocabulary','','','confused with'],
    ['','are found','language','mechanism'],
    ['Abstraction','A super-category','Compresses and','The category no'],
    ['','appears','orders','longer discriminates'],
    ['Stage','Operation Differences are','Local gain','Epistemic risk Form appears to be'],
    ['Parallelism','formulated symmetrically The frame generates','Memorability','evidence Internal confirmations appear'],
    ['Elaboration','consequences and Productivity examples','','to be independent support'],
    ['','A local reservation is','','The conclusion'],
    ['Caveat','','Verbal modesty',''],
    ['','added','','remains unchanged']
  ].flatMap((row,r)=>row.map((text,c)=>({row:r,col:c,text,selector:`#c${r}_${c}`,nodeIndex:11+r*4+c})))};
  const doc={width:1024,records:[table,...table.cells.map(c=>({tag:'td',selector:c.selector,nodeIndex:c.nodeIndex,page:16,text:c.text}))]};
  const result=compareTables(sourceParts,doc,options),repair=result.actions.find(a=>a.kind==='table_fragments');
  assert(repair);assert.equal(repair.rows.length,7);
  assert.deepEqual(repair.rows.map(row=>row[0].text),['Stage','Juxtaposition','Shared vocabulary','Abstraction','Parallelism','Elaboration','Caveat']);
  assert.equal(repair.rows[5][3].text,'Internal confirmations appear to be independent support');
  assert(!result.findings.some(f=>f.category==='source_table_unmapped'||f.category==='html_table_unmapped'));
});

test('a merged exact table is distributed back to certified source pages',()=>{
  const first=structuredClone(source),second=structuredClone(source),doc=documentFixture();
  doc.pageContainers=[14,15];
  second.page=15;second.cells[2].text='Other sponsor';second.cells[3].text='Other benefit';
  const extra=doc.records[0].cells.slice(2).map((cell,index)=>({...cell,row:2,selector:'#extra'+index,text:second.cells[index+2].text}));
  doc.records[0].cells.push(...extra);doc.records[0].rows=[[{tag:'th'},{tag:'th'}],[{tag:'td'},{tag:'td'}],[{tag:'td'},{tag:'td'}]];
  const result=compareTables([first,second],doc,options),action=result.actions.find(item=>item.kind==='table_source_pages');
  assert(action);assert.deepEqual(action.fragments,[
    {page:14,bodyRows:1,rowKeys:['sponsor|publicbenefit']},
    {page:15,bodyRows:1,rowKeys:['othersponsor|otherbenefit']}
  ]);
  assert(result.findings.some(finding=>finding.category==='source_table_page_distribution'));
  assert(!result.findings.some(finding=>finding.category==='source_table_unmapped'||finding.category==='html_table_unmapped'));
});

test('an unpaginated book never receives source-page table distribution',()=>{
  const first=structuredClone(source),second=structuredClone(source),doc=documentFixture();
  second.page=15;second.cells[2].text='Other sponsor';second.cells[3].text='Other benefit';
  doc.records[0].page=null;
  doc.records[0].cells.push(...doc.records[0].cells.slice(2).map((cell,index)=>({...cell,row:2,selector:'#unpaginated'+index,text:second.cells[index+2].text})));
  const result=compareTables([first,second],doc,options);
  assert(!result.actions.some(action=>action.kind==='table_source_pages'||action.kind==='table_source_groups'));
});

test('certified table rows recreate a missing continuation-page anchor', {skip:!process.env.VALIDATEBOOK_INTEGRATION},async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'validatebook-table-anchor-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const file=path.join(dir,'book.html');
  await fs.writeFile(file,'<!doctype html><html><body><section class="pdf-source-page" data-source-page="14"><table id="table"><thead><tr><th>Pattern</th><th>Meaning</th></tr></thead><tbody><tr><td>Sponsor</td><td>Public benefit</td></tr><tr><td>Other sponsor</td><td>Other benefit</td></tr></tbody></table></section><section class="pdf-source-page" data-source-page="15"></section></body></html>');
  const action={kind:'table_source_pages',selector:'#table',fragments:[
    {page:14,bodyRows:1,rowKeys:['sponsor|publicbenefit']},
    {page:15,bodyRows:1,rowKeys:['othersponsor|otherbenefit']}
  ]};
  const browser=await openBrowser(process.env.VALIDATEBOOK_CHROMIUM);t.after(()=>browser.close());await navigate(browser,file);
  await browser.evaluate(`(${applyDomRepairs.toString()})(${JSON.stringify([action])})`);
  assert.equal(await browser.evaluate('document.querySelector("[data-source-page=\\"15\\"] tbody tr").id'),'page_15');
  assert.equal(await browser.evaluate('document.querySelectorAll("table").length'),2);
});

test('distinct continued tables merged into one HTML table are split by header and source page',()=>{
  const mkCell=(row,col,text)=>({row,col,rowspan:1,colspan:1,text,widthPt:col?200:100,background:row===0?'#103a5b':'#ffffff',borders:Object.fromEntries(['top','right','bottom','left'].map(side=>[side,'0'])),typography:{name:'Arial',family:'Arial',sizePt:9,color:row===0?'#ffffff':'#111111',weight:row===0?700:400,style:'normal',leadingPt:12,paddingPt:[3,4,3,4],indentPt:0,align:'left'}});
  const part=(header,bodyRows,page)=>({page,rows:1+bodyRows.length,columns:2,widthPt:300,pageWidthPt:432,topPt:100,bottomPt:200,cells:[header,...bodyRows].flatMap((row,r)=>row.map((text,c)=>mkCell(r,c,text)))});
  const headerA=['Control pattern','When it earns its complexity'];
  const headerB=['Pattern','Engineering rule'];
  const sourceParts=[
    part(headerA,[['Reactive loop','Choose the next action']],14),
    part(headerA,[['Planner-executor','Create an explicit decomposition']],15),
    part(headerB,[['Deterministic boundary','Use code for identity']],16),
    part(headerB,[['Graph state','Name phases and persist state']],17)
  ];
  const merged=[headerA,['Reactive loop','Choose the next action'],['Planner-executor','Create an explicit decomposition'],headerB,['Deterministic boundary','Use code for identity'],['Graph state','Name phases and persist state']];
  const table={tag:'table',selector:'#chain',page:14,nodeIndex:10,bounds:{left:0,right:600},rows:[],cells:merged.flatMap((row,r)=>row.map((text,c)=>({
    row:r,col:c,rowspan:1,colspan:1,text,selector:`#c${r}_${c}`,width:(c?200:100)*2,
    background:r===0||r===3?'rgb(16, 58, 91)':'rgb(255, 255, 255)',color:r===0||r===3?'rgb(255, 255, 255)':'rgb(17, 17, 17)',
    font:{family:'Arial, sans-serif',size:'12px',weight:r===0||r===3?'700':'400',style:'normal'},lineHeight:'16px',textAlign:'left',indent:0,padding:[4,16/3,4,16/3],
    borders:Object.fromEntries(['top','right','bottom','left'].map(side=>[side,{width:1,style:'solid',color:'rgb(170, 187, 204)'}]))
  })))};
  const result=compareTables(sourceParts,{width:1024,pageContainers:[14,15,16,17],records:[table]},options);
  assert(!result.findings.some(f=>f.category==='source_table_unmapped'||f.category==='html_table_unmapped'));
  const repair=result.actions.find(a=>a.kind==='table_source_groups');assert(repair);
  assert.deepEqual(repair.groups.map(group=>group.fragments.map(fragment=>({page:fragment.page,headerRow:fragment.headerRow,bodyRows:fragment.bodyRows}))),[
    [{page:14,headerRow:0,bodyRows:[1]},{page:15,headerRow:0,bodyRows:[2]}],
    [{page:16,headerRow:3,bodyRows:[4]},{page:17,headerRow:3,bodyRows:[5]}]
  ]);
  assert(!result.actions.some(a=>a.kind==='presentation'));
});

test('distinct merged tables are installed as page-local fragments', {skip:!process.env.VALIDATEBOOK_INTEGRATION},async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'validatebook-table-groups-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const file=path.join(dir,'book.html');
  await fs.writeFile(file,'<!doctype html><html><body data-validatebook-root><section class="pdf-source-page" data-source-page="14"><div class="pdf-table-wrap"><table id="chain"><thead><tr><th>Control pattern</th><th>When it earns its complexity</th></tr></thead><tbody><tr><td>Reactive loop</td><td>Choose the next action</td></tr><tr id="page_15"><td>Planner-executor</td><td>Create an explicit decomposition</td></tr><tr><td>Pattern</td><td>Engineering rule</td></tr><tr><td>Deterministic boundary</td><td>Use code for identity</td></tr><tr id="page_17"><td>Pattern</td><td>Engineering rule</td></tr><tr><td>Graph state</td><td>Name phases and persist state</td></tr></tbody></table></div></section><section class="pdf-source-page" data-source-page="15"><h2>Next section</h2></section><section class="pdf-source-page" data-source-page="16"><p>Prose before table.</p></section><section class="pdf-source-page" data-source-page="17"></section></body></html>');
  const action={kind:'table_source_groups',selector:'#chain',rowKeys:['controlpattern|whenitearnsitscomplexity','reactiveloop|choosethenextaction','plannerexecutor|createanexplicitdecomposition','pattern|engineeringrule','deterministicboundary|usecodeforidentity','pattern|engineeringrule','graphstate|namephasesandpersiststate'],groups:[
    {headerKey:'controlpattern|whenitearnsitscomplexity',fragments:[{page:14,headerRow:0,bodyRows:[1],placement:'original'},{page:15,headerRow:0,bodyRows:[2],placement:'start'}]},
    {headerKey:'pattern|engineeringrule',fragments:[{page:16,headerRow:3,bodyRows:[4],placement:'end'},{page:17,headerRow:5,bodyRows:[6],placement:'start'}]}
  ]};
  const browser=await openBrowser(process.env.VALIDATEBOOK_CHROMIUM);t.after(()=>browser.close());await navigate(browser,file);
  await browser.evaluate(`(${applyDomRepairs.toString()})(${JSON.stringify([action])})`);
  assert.deepEqual(await browser.evaluate(`Array.from(document.querySelectorAll('.pdf-source-page'),page=>({page:Number(page.dataset.sourcePage),tables:page.querySelectorAll('table').length,header:page.querySelector('th')?.textContent,body:page.querySelector('td')?.textContent,last:page.lastElementChild?.className}))`),[
    {page:14,tables:1,header:'Control pattern',body:'Reactive loop',last:'pdf-table-wrap'},
    {page:15,tables:1,header:'Control pattern',body:'Planner-executor',last:''},
    {page:16,tables:1,header:'Pattern',body:'Deterministic boundary',last:'pdf-table-wrap'},
    {page:17,tables:1,header:'Pattern',body:'Graph state',last:'pdf-table-wrap'}
  ]);
  assert.equal(await browser.evaluate(`document.querySelector('[data-source-page="17"] thead tr').id`),'page_17');
});

test('source table rows emitted as exact adjacent paragraphs are normalized deterministically',()=>{
  const doc=documentFixture();
  doc.records[0].cells=source.cells.filter(c=>c.row===0).map(c=>({...c,selector:c.selector+'h'}));
  doc.records.push({tag:'p',selector:'#adjacent',page:14,text:'Sponsor Public benefit'});
  const result=compareTables([source],doc,options);
  const action=result.actions.find(item=>item.kind==='table_normalize_rows');
  assert(action);assert.deepEqual(action.plan.map(item=>item.paragraph||item.rows),[[0],'#adjacent']);
  assert(!result.findings.some(f=>f.category==='source_table_unmapped'||f.category==='html_table_unmapped'));
});

test('normalization composes missing paragraphs, wrapped rows and repeated continuation headers',()=>{
  const mk=(row,col,text)=>({row,col,rowspan:1,colspan:1,text,widthPt:col?200:100,background:'#fff',borders:{top:'0',right:'0',bottom:'0',left:'0'},typography:null});
  const part=(page,rows)=>({page,rows:rows.length,columns:2,widthPt:300,pageWidthPt:432,topPt:50,bottomPt:200,cells:rows.flatMap((values,row)=>values.map((text,col)=>mk(row,col,text)))});
  const header=['Stack','Reason'];
  const profile=[part(56,[header,['OpenAI','Compact abstraction'],['Microsoft Agent Framework 1.0','Enterprise ecosystem fit']]),part(57,[header,['Google ADK','Evaluation and deployment support']])];
  const physical=[header,['OpenAI','Compact abstraction'],header,['Google ADK','Evaluation and'],['','deployment support']];
  const table={tag:'table',selector:'#stack',page:56,nodeIndex:10,rows:physical.map((_,row)=>row?[{tag:'td'},{tag:'td'}]:[{tag:'th'},{tag:'th'}]),cells:physical.flatMap((values,row)=>values.map((text,col)=>({row,col,rowspan:1,colspan:1,text,selector:`#r${row}c${col}`})))};
  const paragraph={tag:'p',selector:'#microsoft',page:56,nodeIndex:30,text:'Microsoft Agent Framework Enterprise ecosystem 1.0 fit'};
  const result=compareTables(profile,{width:1024,records:[table,paragraph]},options),action=result.actions.find(item=>item.kind==='table_normalize_rows');
  assert(action);
  assert.deepEqual(action.plan.map(item=>item.paragraph||item.rows),[[0],[1],'#microsoft',[2],[3,4]]);
  assert(!result.findings.some(f=>f.category==='source_table_unmapped'||f.category==='html_table_unmapped'));
});

test('a complete source table emitted as contiguous paragraphs is reconstructed',()=>{
  const mk=(row,col,text)=>({row,col,rowspan:1,colspan:1,text,widthPt:100,background:'#fff',borders:{top:'0',right:'0',bottom:'0',left:'0'},typography:null});
  const values=[['Review area','Question'],['Outcome','Is the outcome observable?'],['Scope','Which tasks are allowed?']];
  const profile={page:65,rows:3,columns:2,widthPt:200,pageWidthPt:432,topPt:100,bottomPt:200,cells:values.flatMap((row,r)=>row.map((text,c)=>mk(r,c,text)))};
  const records=[
    {tag:'p',selector:'#intro',page:65,nodeIndex:1,text:'Introductory prose.'},
    {tag:'p',selector:'#first',page:65,nodeIndex:2,text:'Review area Question Outcome Is the outcome observable?'},
    {tag:'p',selector:'#second',page:65,nodeIndex:3,text:'Scope Which tasks are allowed?'}
  ];
  const result=compareTables([profile],{width:1024,records},options),action=result.actions.find(item=>item.kind==='table_from_paragraphs');
  assert(action);assert.deepEqual(action.paragraphs.map(item=>item.selector),['#first','#second']);
  assert.deepEqual(action.rows.map(row=>row.map(cell=>cell.text)),values);
  assert(!result.findings.some(f=>f.category==='source_table_unmapped'));
});

test('html table continuations across page breaks are merged when headers repeat',()=>{
  const doc={width:1024,records:[
    {tag:'table',selector:'#first',page:7,nodeIndex:10,rows:[[{tag:'th'},{tag:'th'}],[{tag:'td'},{tag:'td'}]],cells:[
      {row:0,col:0,text:'Concept',selector:'#h0'},{row:0,col:1,text:'Meaning in practice',selector:'#h1'},
      {row:1,col:0,text:'Statistical bias',selector:'#a0'},{row:1,col:1,text:'A systematic estimation error.',selector:'#a1'}
    ]},
    {tag:'table',selector:'#next',page:8,nodeIndex:20,rows:[[{tag:'th'},{tag:'th'}],[{tag:'td'},{tag:'td'}]],cells:[
      {row:0,col:0,text:'Concept',selector:'#h2'},{row:0,col:1,text:'Meaning in practice',selector:'#h3'},
      {row:1,col:0,text:'Normative choice',selector:'#b0'},{row:1,col:1,text:'A value judgment.',selector:'#b1'}
    ]}
  ]};
  const result=compareTables([],doc,options);
  assert(result.findings.some(f=>f.category==='html_table_continuation'));
  assert.deepEqual(result.actions.map(a=>a.kind),['table_continuation']);
  assert(!result.findings.some(f=>f.category==='html_table_unmapped'));
});

test('multi-page glossary tables demote converter-promoted body headers',()=>{
  const doc={width:1024,records:[
    {tag:'table',selector:'#first',page:156,nodeIndex:10,rows:[[{tag:'th'},{tag:'th'}],[{tag:'td'},{tag:'td'}]],cells:[
      {row:0,col:0,text:'Concept',selector:'#h0'},{row:0,col:1,text:'Explanation and accessible link',selector:'#h1'},
      {row:1,col:0,text:'Authority bias',selector:'#a0'},{row:1,col:1,text:'The tendency to give more weight. Wikipedia',selector:'#a1'}
    ]},
    {tag:'table',selector:'#p157',page:157,nodeIndex:20,rows:[[{tag:'th'},{tag:'th'}],[{tag:'td'},{tag:'td'}]],cells:[
      {row:0,col:0,text:'Bayesian prior',selector:'#b0'},{row:0,col:1,text:'A prior is the belief before evidence. Wikipedia',selector:'#b1'},
      {row:1,col:0,text:'Bibliometrics',selector:'#b2'},{row:1,col:1,text:'The quantitative study of publications. Wikipedia',selector:'#b3'}
    ]},
    {tag:'table',selector:'#p158',page:158,nodeIndex:30,rows:[[{tag:'th'},{tag:'th'}],[{tag:'td'},{tag:'td'}]],cells:[
      {row:0,col:0,text:'Conflict of interest',selector:'#c0'},{row:0,col:1,text:'A situation in which interests can affect judgment. Wikipedia',selector:'#c1'},
      {row:1,col:0,text:'Counterfactual test',selector:'#c2'},{row:1,col:1,text:'A test that asks what would happen if one feature changed. Wikipedia',selector:'#c3'}
    ]}
  ]};
  const result=compareTables([],doc,options),action=result.actions.find(a=>a.kind==='table_continuation');
  assert(action);assert.equal(action.continuations.length,2);
  assert(action.continuations.every(item=>item.mode==='promoted_header_is_body'));
  assert(!result.findings.some(f=>f.category==='html_table_unmapped'));
});

test('already merged concept tables still receive readable column layout',()=>{
  const doc={width:1024,records:[
    {tag:'table',selector:'#merged',page:7,nodeIndex:10,rows:[[{tag:'th'},{tag:'th'}],[{tag:'td'},{tag:'td'}],[{tag:'td'},{tag:'td'}]],cells:[
      {row:0,col:0,text:'Concept',selector:'#h0'},{row:0,col:1,text:'Meaning in practice',selector:'#h1'},
      {row:1,col:0,text:'Statistical bias',selector:'#a0'},{row:1,col:1,text:'A systematic estimation error.',selector:'#a1'},
      {row:2,col:0,text:'Normative choice',selector:'#b0'},{row:2,col:1,text:'A value judgment.',selector:'#b1'}
    ]}
  ]};
  const result=compareTables([],doc,options);
  assert(result.findings.some(f=>f.category==='html_table_unmapped'));
  assert(result.actions.some(a=>a.kind==='table_readable_columns'&&a.selector==='#merged'));
});

test('translated cell presentation requires the existing structural table correspondence',()=>{
  const en=documentFixture(),ro=documentFixture();ro.records[0].selector='#ro';ro.records[0].page=18;ro.records[0].cells.forEach(c=>c.text='Tradus '+c.text);
  const unmapped=translatedTables([source],en,ro,{matches:[]});
  assert(compareTables(unmapped,ro,{...options,language:'ro'}).findings.some(f=>f.category==='translated_table_unmapped'));
  const result=translatedTables([source],en,ro,{matches:[{source:'#table',target:'#ro'}]});
  assert.equal(result[0].page,18);assert.equal(result[0].cells[0].text,'Tradus Pattern');assert.equal(result[0].cells[0].background,source.cells[0].background);
  en.records[0].roleContext=ro.records[0].roleContext='comparison';
  assert.equal(translatedTables([source],en,ro,{matches:[]})[0].cells[0].text,'Tradus Pattern');
  ro.records.push(structuredClone(ro.records[0]));
  assert.equal(translatedTables([source],en,ro,{matches:[]})[0].unmappedTranslation,true);
});

test('declared cell font cannot certify a different rendered fallback',()=>{
  const doc=documentFixture();doc.platformFonts=doc.records[0].cells.map(c=>({selector:c.selector,width:1024,fonts:[{familyName:'Georgia',glyphCount:5}]}));
  assert(compareTables([source],doc,options).findings.some(f=>f.category==='source_table_cell_difference'));
  doc.platformFonts.forEach(s=>s.fonts[0].familyName='Arial');
  assert.deepEqual(compareTables([source],doc,options).findings,[]);
});

test('native table repair survives CSS consolidation and imported article at three widths', {skip:!process.env.VALIDATEBOOK_INTEGRATION},async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'validatebook-tables-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const file=path.join(dir,'book.html'),css=path.join(dir,'validatebook-layout.css');
  await fs.writeFile(file,'<!doctype html><html><head></head><body><section data-source-page="14"><table id="table"><tr><th>Pattern</th><th>Meaning</th></tr><tr><td>Sponsor</td><td>Public benefit</td></tr></table></section></body></html>');
  await fs.writeFile(path.join(dir,'reader.css'),'.reader-html-content{width:100%;}');
  const browser=await openBrowser(process.env.VALIDATEBOOK_CHROMIUM);t.after(()=>browser.close());await navigate(browser,file);
  const before=await browser.evaluate(`(${inspectLayout.toString()})()`);
  const repair=compareTables([source],before,options);assert(repair.actions.length>0);
  await browser.evaluate(`(${applyDomRepairs.toString()})(${JSON.stringify(repair.actions)})`);
  const consolidated=await browser.evaluate(`(${applyDomRepairs.toString()})(${JSON.stringify([{kind:'consolidate_styles',href:'validatebook-layout.css'}])})`);
  await fs.writeFile(file,consolidated.html);await fs.writeFile(css,consolidated.stylesheet.css);
  for(const imported of [false,true]){
    await navigate(browser,file);
    if(imported){await browser.evaluate(`(${importReaderArticle.toString()})(${JSON.stringify({readerCss:pathToFileURL(path.join(dir,'reader.css')).href,managed:true,defaultRem:1})})`);await browser.evaluate('Promise.all(Array.from(document.querySelectorAll("link"),n=>n.sheet?Promise.resolve():new Promise(r=>n.onload=r)))');}
    for(const width of [1440,1024,390]){
      await browser.send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
      const result=compareTables([source],await browser.evaluate(`(${inspectLayout.toString()})()`),options);
      assert.deepEqual(result.findings,[],JSON.stringify({imported,width,findings:result.findings}));assert.equal(result.actions.length,0);
    }
  }
});

test('continued tables render with stable columns and wrapping', {skip:!process.env.VALIDATEBOOK_INTEGRATION},async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'validatebook-table-continuation-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const file=path.join(dir,'book.html');
  await fs.writeFile(file,'<!doctype html><html><body data-validatebook-root><section data-source-page="7"><div><table id="first"><thead><tr><th>Concept</th><th>Meaning in practice</th></tr></thead><tbody><tr><td>Statistical bias</td><td>A systematic estimation error relative to a defined statistical target.</td></tr></tbody></table></div></section><section data-source-page="8"><div id="page_8"><table id="next"><thead><tr><th>Concept</th><th>Meaning in practice</th></tr></thead><tbody><tr><td>Normative choice</td><td>A value judgment about which differences are relevant, acceptable, compensable, or unjust.</td></tr></tbody></table></div></section></body></html>');
  const browser=await openBrowser(process.env.VALIDATEBOOK_CHROMIUM);t.after(()=>browser.close());await navigate(browser,file);
  const before=await browser.evaluate(`(${inspectLayout.toString()})()`);
  const action=compareTables([],before,options).actions.find(a=>a.kind==='table_continuation');
  assert(action);
  await browser.evaluate(`(${applyDomRepairs.toString()})(${JSON.stringify([action])})`);
  assert.equal(await browser.evaluate('document.querySelectorAll("table").length'),1);
  assert.equal(await browser.evaluate('getComputedStyle(document.querySelector("#first")).tableLayout'),'fixed');
  assert.equal(await browser.evaluate('getComputedStyle(document.querySelector("#first td")).overflowWrap'),'break-word');
  assert.equal(await browser.evaluate('document.querySelector("#page_8")?.tagName'),'TR');
});

test('existing PDF table regression is repaired only in a temporary HTML copy', {skip:!process.env.VALIDATEBOOK_TABLE_PDF},async t=>{
  const pdf=process.env.VALIDATEBOOK_TABLE_PDF,html=process.env.VALIDATEBOOK_TABLE_HTML;
  const sha=await fileHash(pdf),htmlSha=await fileHash(html);
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'validatebook-source-table-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const profile=await sourceDecorations(pdf,sha,process.env.VALIDATEBOOK_PDF2HTML);
  const page=Number(process.env.VALIDATEBOOK_TABLE_PAGE||14),tables=profile.tables.filter(t=>t.page===page);
  assert(tables.length>0,'Expected a detected source grid');
  const fonts=await sourceFonts(pdf,sha,process.env.VALIDATEBOOK_PDF2HTML,path.join(dir,'fonts'));
  const sourceFontMap=Object.fromEntries(fonts.flatMap(f=>[[familyKey(f.source_name),`"${f.css_family}", serif`],[f.source_name,`"${f.css_family}", serif`]]));
  const browser=await openBrowser(process.env.VALIDATEBOOK_CHROMIUM);t.after(()=>browser.close());
  await navigate(browser,html);
  const snippet=await browser.evaluate(`document.querySelector('[data-source-page="${page}"]').outerHTML`);
  const file=path.join(dir,'book.html');
  const fontCss=fonts.map(f=>`@font-face{font-family:"${f.css_family}";src:url("fonts/${path.basename(f.href)}");font-weight:${f.weight};font-style:${f.style}}`).join('\n');
  const sourceCss=pathToFileURL(path.join(path.dirname(html),'source-layout.css')).href;
  const pageCss=paginationCss({width:tables[0].pageWidthPt,height:tables[0].pageWidthPt*1.5});
  await fs.writeFile(file,`<!doctype html><html><head><style>${fontCss}\n${pageCss}</style><link rel="stylesheet" href="${sourceCss}"></head><body data-validatebook-root>${snippet}</body></html>`);
  await navigate(browser,file);
  const defaultSizePx=await browser.evaluate(`(()=>{const probe=document.createElement('span');probe.style.fontSize='var(--standalone-size,16px)';document.body.append(probe);const size=parseFloat(getComputedStyle(probe).fontSize);probe.remove();return size;})()`);
  const opts={sourceFontMap,defaultSizePx};
  const first=compareTables(tables,await browser.evaluate(`(${inspectLayout.toString()})()`),opts);
  assert(first.actions.length>0);assert(!first.findings.some(f=>f.category!=='source_table_cell_difference'),JSON.stringify(first.findings));
  await browser.evaluate(`(${applyDomRepairs.toString()})(${JSON.stringify(first.actions)})`);
  let css;
  for(let pass=0;pass<2;pass++){
    const consolidated=await browser.evaluate(`(${applyDomRepairs.toString()})(${JSON.stringify([{kind:'consolidate_styles',href:'validatebook-layout.css',previousCss:css}])})`);
    css=consolidated.stylesheet.css;
    await fs.writeFile(file,consolidated.html);await fs.writeFile(path.join(dir,'validatebook-layout.css'),css);await navigate(browser,file);
    const check=compareTables(tables,await browser.evaluate(`(${inspectLayout.toString()})()`),opts);
    assert.equal(check.findings.length,0,JSON.stringify({pass,first:check.findings[0]}));
  }
  for(const width of [1440,1024,390]){
    await browser.send('Emulation.setDeviceMetricsOverride',{width,height:1500,deviceScaleFactor:1,mobile:false});
    const result=compareTables(tables,await browser.evaluate(`(${inspectLayout.toString()})()`),opts);
    assert.equal(result.findings.length,0,JSON.stringify({width,first:result.findings[0]}));
  }
  assert.equal(await fileHash(pdf),sha);assert.equal(await fileHash(html),htmlSha);
});
