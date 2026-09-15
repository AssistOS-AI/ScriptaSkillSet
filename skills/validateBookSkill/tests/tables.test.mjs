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
test('partial text, wrong spans, duplicate tables and unsupported source grids never authorize repairs',()=>{
  for(const mutate of [d=>d.records[0].cells[0].text+=' Extra',d=>d.records[0].cells[0].colspan=2,d=>d.records.push(structuredClone(d.records[0]))]){
    const doc=documentFixture();mutate(doc);const result=compareTables([source],doc,options);assert(result.findings.length);assert.equal(result.actions.length,0);
  }
  assert.equal(compareTables([],documentFixture(),options).findings[0].category,'html_table_unmapped');
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
