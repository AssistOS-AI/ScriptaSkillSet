import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pageScale, compareTypography, typographyActions } from '../src/typography.mjs';
import { paginationCss,translatedPaginationCss,pageHeightDifferences } from '../src/pagination.mjs';
import { inspectLayout } from '../src/layout-checks.mjs';
import { openBrowser } from '../src/browser.mjs';
import { navigate, applyDomRepairs } from '../src/layout-browser.mjs';

const text='A complete paragraph preserves its source proportions when the page grows.';
const profile={bodyPt:11,bodyCssPx:44/3,leadingPt:15,leadingCssPx:20,pages:[{page:1,width:432,height:648,lines:[{text,top:50,font:{sizePt:11}}]}]};
test('page height validation detects collapsed pages and accepts longer translated pages',()=>{
 const geometry={width:432,height:648};
 const layout={width:1024,pagination:{pages:[{number:1,width:600,height:200},{number:2,width:600,height:900},{number:3,width:600,height:1400}]}};
 assert.deepEqual(pageHeightDifferences(layout,geometry).map(p=>p.page),[1]);
});

test('translated cover, title, copyright and final pages retain full height while long prose grows',{skip:!process.env.VALIDATEBOOK_INTEGRATION},async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'validatebook-translated-pages-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const file=path.join(dir,'book.html'),geometry={width:432,height:648,margins:{top:45,right:43,bottom:50,left:52}};
 const paragraphs=['Coperta','O BALANȚĂ DE FIER ȘI SARE','Drepturi de autor © [2026] Axiologic Research','O lucrare de ficțiune speculativă.','Textul tradus poate ocupa mai mult spațiu. '.repeat(400)];
 await fs.writeFile(file,'<!doctype html><html lang="ro"><head><style>body{margin:0}p{font-size:16px;line-height:24px}'+paginationCss(geometry)+'/* validateBook translated flow */\n[data-validatebook-root] > .pdf-source-page{min-height:0}</style></head><body data-validatebook-root>'+paragraphs.map((p,i)=>'<section class="pdf-source-page" data-reader-page="'+(i+1)+'"><p>'+p+'</p></section>').join('')+'</body></html>');
 const browser=await openBrowser(process.env.VALIDATEBOOK_CHROMIUM);t.after(()=>browser.close());await navigate(browser,file);
 assert((await browser.evaluate(`(${inspectLayout.toString()})()`)).pagination.pages[0].height<500);
 await browser.evaluate('document.querySelector("style").textContent+='+JSON.stringify(translatedPaginationCss(geometry)));
 for(const width of [864,576,320]){
  await browser.send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
  const layout=await browser.evaluate(`(${inspectLayout.toString()})()`);
  assert.deepEqual(pageHeightDifferences(layout,geometry),[]);
  assert(layout.pagination.pages[4].height>width*1.5);
  assert.deepEqual(layout.records.map(r=>r.text),paragraphs.map(p=>p.trim()));
 }
});
test('page scale uses physical source width and preserves a readable mobile floor',()=>{
  assert.equal(pageScale({pageWidth:864},432),1.5);
  assert.equal(pageScale({pageWidth:320},432),1);
  assert.equal(pageScale({},432),1);
  const doc={records:[{tag:'p',page:'1',pageWidth:864,selector:'#p',text,font:{size:'14.6667px'},style:{lineHeight:'20px',marginBottom:0}}]};
  assert(compareTypography(profile,doc).findings.some(f=>f.category==='absolute_font_size_difference'));
  doc.records[0].font.size='22px';doc.records[0].style.lineHeight='30px';
  assert.deepEqual(compareTypography(profile,doc).findings,[]);
});

test('page scale follows the page box, not a wider host container',()=>{
  const css=paginationCss({width:432,height:648,margins:{top:45,right:43,bottom:50,left:52}});
  assert(css.includes('[data-validatebook-root] > .pdf-source-page{container-type:inline-size;'));
  assert(css.includes('--validatebook-page-scale:max(1,calc(100cqw / 576px))'));
  assert(!css.includes('> *{--validatebook-page-scale'));
  assert(css.includes('[data-validatebook-root]:has(> .pdf-source-page){container-type:inline-size'));
});

test('native page scaling survives consolidation, nested containers and a second repair', {skip:!process.env.VALIDATEBOOK_INTEGRATION}, async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'validatebook-scale-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const file=path.join(dir,'book.html');
  const css=paginationCss({width:432,height:648,margins:{top:45,right:43,bottom:50,left:52}});
  await fs.writeFile(file,`<!doctype html><html><head><style>:root{--standalone-size:18.56px}body{margin:0;width:100%}p{margin:0}${css}</style></head><body data-validatebook-root><section class="pdf-source-page" data-source-page="1"><p id="p">${text}</p><div style="container-type:inline-size"><p id="nested">${text}</p></div></section></body></html>`);
  const browser=await openBrowser(process.env.VALIDATEBOOK_CHROMIUM);t.after(()=>browser.close());await navigate(browser,file);
  let previousCss;
  for(let pass=0;pass<2;pass++){
    const before=await browser.evaluate(`(${inspectLayout.toString()})()`);
    const mapped={mappings:before.records.filter(r=>r.tag==='p').map(r=>({selector:r.selector,fontSizePt:11})),findings:[]};
    await browser.evaluate(`(${applyDomRepairs.toString()})(${JSON.stringify(typographyActions(profile,before,mapped,{defaultSizePx:18.56}))})`);
    const saved=await browser.evaluate(`(${applyDomRepairs.toString()})(${JSON.stringify([{kind:'consolidate_styles',href:'validatebook-layout.css',previousCss}])})`);
    previousCss=saved.stylesheet.css;await fs.writeFile(file,saved.html);await fs.writeFile(path.join(dir,'validatebook-layout.css'),previousCss);await navigate(browser,file);
    for(const width of [864,576,320]){
      await browser.send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
      const layout=await browser.evaluate(`(${inspectLayout.toString()})()`);
      for(const p of layout.records.filter(r=>r.tag==='p'))assert(Math.abs(parseFloat(p.font.size)-44/3*Math.max(1,width/576))<.02,JSON.stringify({pass,width,p}));
    }
  }
});
