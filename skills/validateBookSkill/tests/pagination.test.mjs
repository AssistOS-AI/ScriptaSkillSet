import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {openBrowser} from '../src/browser.mjs';
import {navigate} from '../src/layout-browser.mjs';
import {paginateDocument,paginationCss,translatedPaginationCss,sourcePagePresentation,sourceImagePresentation,applyContentsPresentation,applySourceImagePresentation,pagePaddingDifferences,sourceBlankPages} from '../src/pagination.mjs';
import {checkDisplay} from '../src/layout-checks.mjs';
test('translations keep independent margins and source anchors without suppressing rendering errors',()=>{
 const profile={width:400,margins:{top:40,right:40,bottom:40,left:40}};
 const layout={language:'fr',records:[],duplicates:[],brokenLinks:[],fontFaces:[],width:390,scrollWidth:390,pagination:{anchors:141,pages:[],misplacedAnchors:['page_5']}};
 assert.deepEqual(checkDisplay(layout,'fr'),[]);
 assert(checkDisplay({...layout,language:'en'},'en').some(f=>f.category==='missing_page_containers'));
 layout.pagination.pages=[{number:1,width:390,top:0,bottom:100,padding:[5,5,5,5]},{number:2,width:390,top:90,bottom:200,padding:[5,5,5,5]}];
 assert.deepEqual(pagePaddingDifferences(layout,profile,'fr'),[]);
 assert(pagePaddingDifferences(layout,profile,'en').length>0);
 assert(checkDisplay(layout,'fr').some(f=>f.category==='overlapping_pages'));
 layout.readerOmittedPages=['2'];
 assert(checkDisplay(layout,'fr').some(f=>f.category==='reader_root_incomplete'));
});
test('page padding check rejects regressions while allowing a full-bleed cover',()=>{
 const profile={width:400,margins:{top:40,right:40,bottom:50,left:60}};
 const layout={width:1000,pagination:{pages:[{number:1,width:800,cover:true,padding:[0,0,0,0]},{number:2,width:800,padding:[80,80,100,120]}]}};
 assert.deepEqual(pagePaddingDifferences(layout,profile),[]);layout.pagination.pages[1].padding=[20,20,20,20];assert.equal(pagePaddingDifferences(layout,profile)[0].page,2);
});
test('missing source pages with only repeated running headers and folios are blank pages',()=>{
 const pages=[
  {page:1,text:'BOOK TITLE        AUTHOR\n\nOpening text\n\n1'},
  {page:2,text:'BOOK TITLE        AUTHOR\n\nMore text\n\n2'},
  {page:3,text:'BOOK TITLE        AUTHOR\n\n3'},
  {page:4,text:'BOOK TITLE        AUTHOR\n\nReal body text\n\n4'}
 ];
 assert.deepEqual(sourceBlankPages(pages,[1,2,4]),[3]);
 assert.deepEqual(sourceBlankPages(pages,[1,2]),[3]);
});
test('PDF image inventory converts pixels and resolution to source page dimensions',()=>{const inventory='page num type width height color comp bpc enc interp object ID x-ppi y-ppi size ratio\n   9 1 image 1400 812 icc 3 8 image no 33 0 315 314 50K 1.5%\n  43 5 image 1400 831 icc 3 8 image no 105 0 385 387 44K 1.3%\n  43 6 smask 1400 831 gray 1 8 image no 105 0 385 387 2K 0.1%';const images=sourceImagePresentation(inventory);assert.equal(images.length,2);assert.equal(images[0].page,9);assert.equal(images[0].index,0);assert.equal(images[0].width,320);assert(Math.abs(images[1].width-261.818)<.001);});
test('source margins replace arbitrary padding and survive print rules',()=>{const css=paginationCss({width:400,height:600,margins:{top:40,right:40,bottom:50,left:60},contents:[{indent:0}]});assert(css.includes('padding:10cqw 10cqw 12.5cqw 15cqw'));assert(css.includes('.source-contents-heading'));assert(css.includes('.source-toc{box-sizing:border-box;width:100%'));assert(css.includes('.pdf-table-wrap'));assert(!css.includes('font-family:inherit'));assert(!css.includes('clamp'));assert(!css.includes('margin:0;padding:0;border:0;box-shadow:none'));});
test('native contents repair preserves labels and uses each edition page numbers',{skip:!process.env.VALIDATEBOOK_INTEGRATION},async t=>{
 const browser=await openBrowser(process.env.VALIDATEBOOK_CHROMIUM);t.after(()=>browser.close());
 await browser.evaluate('document.body.innerHTML='+JSON.stringify('<ol class="source-toc"><li><a href="#chapter">Chapter One</a></li></ol><section class="pdf-source-page" data-reader-page="9"><h2 id="chapter">Chapter One</h2></section>'));
 const profile={contents:[{label:'Chapter One',number:'2',indent:18}]};
 const result=await browser.evaluate('('+applyContentsPresentation.toString()+')('+JSON.stringify({profile})+')');assert.equal(result.mapping.length,1);assert.equal(result.unmatched.length,0);
 assert.equal(await browser.evaluate('document.querySelector(".validatebook-toc-label").textContent'),'Chapter One');assert.equal(await browser.evaluate('document.querySelector(".validatebook-toc-page").textContent'),' 2');assert.equal(await browser.evaluate('document.querySelector("a").dataset.pageLabel'),'2');
 const css=paginationCss({...profile,width:432,height:648,margins:{top:52,right:47,bottom:51,left:56},contentsLineHeight:17,contentsFontSize:11});
 await browser.evaluate(`(()=>{document.body.setAttribute('data-validatebook-root','');document.body.setAttribute('data-pdf-fidelity','fixture');const managed=document.createElement('style');managed.textContent=${JSON.stringify(css)};document.head.append(managed);const later=document.createElement('style');later.textContent='[data-pdf-fidelity] .source-toc li{line-height:1.38}';document.head.append(later);})()`);
 assert(Math.abs(await browser.evaluate('(()=>{const s=getComputedStyle(document.querySelector("li"));return parseFloat(s.lineHeight)/parseFloat(s.fontSize);})()')-17/11)<.001);
 await browser.evaluate('('+applyContentsPresentation.toString()+')('+JSON.stringify({profile,language:'fr',mapping:result.mapping})+')');assert.equal(await browser.evaluate('document.querySelector("a").dataset.pageLabel'),'1');assert.equal(await browser.evaluate('document.querySelectorAll(".validatebook-toc-label").length'),1);
 const rows=Array.from({length:32},(_,i)=>`<text top="${52+i*17}" left="${i===10?56:73}" width="${i===10?329:312}" height="14" font="1">A sufficiently long source paragraph line</text>`).join('');
 const xml='<pdf2xml><fontspec id="1" size="11"/>'+[1,2,3].map(n=>`<page number="${n}" width="432" height="648"><text top="22" left="56" width="120" height="10" font="1">Repeated running header</text>${rows}<text top="613" left="180" width="120" height="12" font="1">BOOK TITLE · ${n}</text></page>`).join('')+'</pdf2xml>';
 const measured=await browser.evaluate('('+sourcePagePresentation.toString()+')('+JSON.stringify(xml)+')');assert.equal(measured.margins.left,56);assert.equal(measured.margins.right,47);assert.equal(measured.margins.top,52);assert(measured.margins.bottom>35);
 await assert.rejects(browser.evaluate('('+sourcePagePresentation.toString()+')('+JSON.stringify('<pdf2xml><page width="432" height="648"/></pdf2xml>')+')'),/Insufficient/);
});
test('plain positioned PDF contents rebuilds an incomplete converted table',{skip:!process.env.VALIDATEBOOK_INTEGRATION},async t=>{
 const browser=await openBrowser(process.env.VALIDATEBOOK_CHROMIUM);t.after(()=>browser.close());
 const rows=Array.from({length:24},(_,i)=>`<text top="${52+i*17}" left="56" width="329" height="14" font="1">A sufficiently long source paragraph line</text>`).join('');
 const bodyPages=[1,2,3].map(n=>`<page number="${n}" width="432" height="648">${rows}</page>`).join('');
 const toc='<page number="4" width="432" height="648"><text top="50" left="56" width="90" height="24" font="2">Contents</text><text top="100" left="56" width="170" height="14" font="1">PART I: PATTERNS</text><text top="135" left="75" width="250" height="14" font="1">1. First Chapter</text><text top="135" left="380" width="8" height="14" font="1">1</text><text top="175" left="75" width="250" height="14" font="1">2. A Long Second Chapter</text><text top="192" left="56" width="120" height="14" font="1">Continued Title</text><text top="175" left="380" width="8" height="14" font="1">8</text><text top="240" left="56" width="310" height="14" font="1"><i>Page numbers refer to the numbered body.</i></text></page>';
 const xml=`<pdf2xml><fontspec id="1" size="11"/><fontspec id="2" size="20"/>${bodyPages}${toc}<outline><item page="6">First Chapter</item><item page="13">A Long Second Chapter Continued Title</item></outline></pdf2xml>`;
 const profile=await browser.evaluate('('+sourcePagePresentation.toString()+')('+JSON.stringify(xml)+')');
  assert.deepEqual(profile.contents.map(row=>[row.kind,row.label,row.number,row.destination]),[['part','PART I: PATTERNS',undefined,undefined],['entry','1. First Chapter','1',6],['entry','2. A Long Second Chapter Continued Title','8',13]]);
 assert.equal(profile.contentsLineHeight,17);assert.equal(profile.contentsFontSize,11);
 await browser.evaluate('document.body.innerHTML='+JSON.stringify('<main data-validatebook-root><section class="pdf-source-page"><h2 id="page_4">Contents</h2><div class="pdf-table-wrap"><table class="pdf-toc"><tbody><tr><td>PART I: PATTERNS</td></tr></tbody></table></div></section><section class="pdf-source-page"><h2 id="page_6">First Chapter</h2></section><section class="pdf-source-page"><h2 id="page_13">Second Chapter</h2></section></main>'));
 const repaired=await browser.evaluate('('+applyContentsPresentation.toString()+')('+JSON.stringify({profile})+')');
 assert.equal(repaired.unmatched.length,0);assert.equal(repaired.mapping.length,2);
 assert.equal(await browser.evaluate('document.querySelectorAll(".source-toc a").length'),2);
 assert.equal(await browser.evaluate('document.querySelector(".source-toc-part").textContent'),'PART I: PATTERNS');
 assert.equal(await browser.evaluate('document.querySelector(".source-contents-note").textContent'),'Page numbers refer to the numbered body.');
});
test('pagination CSS uses source page proportions and never clips flowing text',()=>{
 const css=paginationCss({width:432,height:648});
 assert(css.includes('min-height:150cqw'));
 assert(css.includes('break-after:page'));
 assert(css.includes('--validatebook-page-scale:max(1,calc(100cqw / 576px))'));
 const translated=translatedPaginationCss({width:432,height:648,margins:{top:52,right:47,bottom:51,left:56},contents:[{indent:0}],contentsLineHeight:17,contentsFontSize:11});
 assert(translated.includes('--validatebook-font-size:var(--reader-font-size,var(--standalone-size,1em))'));
 assert(translated.includes('padding:12.037037037037036cqw 10.87962962962963cqw 11.805555555555555cqw 12.962962962962962cqw'));
 assert(css.includes('[data-validatebook-root] th, [data-validatebook-root] td{overflow-wrap:normal;word-break:normal;hyphens:none}'));
 assert(!css.includes('[data-validatebook-root] th, [data-validatebook-root] td{overflow-wrap:anywhere}'));
 assert(!css.includes('overflow:hidden'));
 assert.throws(()=>paginationCss({width:0,height:648}));
});
test('native pagination separates cover/title, splits nested contents, preserves text and is idempotent',{skip:!process.env.VALIDATEBOOK_INTEGRATION},async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'source-pages-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const file=path.join(root,'book.html');
 await fs.writeFile(file,'<!doctype html><html><head><style>body{width:600px;margin:auto}'+paginationCss({width:432,height:648})+'</style></head><body data-validatebook-root><figure id="page_1">Cover</figure><h1 id="page_2">Title</h1><p>Subtitle</p><p>Epigraph.</p><p id="page_3">Copyright</p><ol id="contents"><li id="page_4">First</li><li><span id="page_5"></span>Second</li></ol><span class="source-anchor" id="chapter"></span><h2 id="page_6">Chapter</h2><p>Prose <em>with emphasis</em>.</p></body></html>');
 const browser=await openBrowser(process.env.VALIDATEBOOK_CHROMIUM);t.after(()=>browser.close());await navigate(browser,file);
 const result=await browser.evaluate('('+paginateDocument.toString()+')('+JSON.stringify({blankPages:[7],expectedPages:7})+')');assert.deepEqual(result.pages,[1,2,3,4,5,6,7]);
 const checked=await browser.evaluate('Array.from(document.querySelectorAll(".pdf-source-page"),n=>({page:n.dataset.readerPage,text:n.textContent,top:n.getBoundingClientRect().top,bottom:n.getBoundingClientRect().bottom,height:n.getBoundingClientRect().height,ids:Array.from(n.querySelectorAll("[id]"),n=>n.id)}))');
 assert.equal(checked[0].text,'Cover');assert.equal(checked[1].text,'TitleSubtitleEpigraph.');assert(checked[5].ids.includes('chapter'));assert(checked.every(p=>p.height>=899));for(let i=1;i<checked.length;i++)assert(checked[i].top>=checked[i-1].bottom+31);
 assert.equal(await browser.evaluate('document.querySelectorAll("#contents").length'),1);assert.equal(await browser.evaluate('document.querySelectorAll("ol").length'),2);
 const again=await browser.evaluate('('+paginateDocument.toString()+')('+JSON.stringify({expectedPages:7})+')');assert.equal(again.html,result.html);
});
