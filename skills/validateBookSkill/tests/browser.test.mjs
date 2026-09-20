import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openBrowser } from '../src/browser.mjs';
import { navigate, measure, applyDomRepairs } from '../src/layout-browser.mjs';
import {restorePublisherIdentity} from '../src/source-identity.mjs';
import {compareImageStyles} from '../src/images.mjs';
import {splitDuplicateSourceToc, removeEmptyTranslatedPages} from '../src/pagination.mjs';
import {pathToFileURL} from 'node:url';

test('duplicated source contents lists keep only the entries printed on each PDF page',{skip:!process.env.VALIDATEBOOK_INTEGRATION},async t=>{
 const browser=await openBrowser(process.env.VALIDATEBOOK_CHROMIUM);t.after(()=>browser.close());
 const rows='<li>PART I: A 1</li><li>CHAPTER 1 - One 2</li><li>CHAPTER 2 - Two 3</li>';
 await browser.evaluate('document.body.innerHTML='+JSON.stringify('<section class="pdf-source-page" data-source-page="4"><ol class="source-toc">'+rows+'</ol></section><section class="pdf-source-page" data-source-page="5"><ol class="source-toc">'+rows+'</ol></section>'));
 const changes=await browser.evaluate(`(${splitDuplicateSourceToc.toString()})(${JSON.stringify([{page:4,text:'Table of Contents PART I: A 1 CHAPTER 1 - One 2'},{page:5,text:'CHAPTER 2 - Two 3'}])})`);
 assert.equal(changes.length,2);
 assert.deepEqual(await browser.evaluate('Array.from(document.querySelectorAll("section.pdf-source-page"),s=>Array.from(s.querySelectorAll("li"),li=>li.textContent))'),[['PART I: A 1','CHAPTER 1 - One 2'],['CHAPTER 2 - Two 3']]);
});

test('empty translated pages are removed and keep their anchors',{skip:!process.env.VALIDATEBOOK_INTEGRATION},async t=>{
 const browser=await openBrowser(process.env.VALIDATEBOOK_CHROMIUM);t.after(()=>browser.close());
 await browser.evaluate('document.body.innerHTML='+JSON.stringify('<main data-validatebook-root><section class="pdf-source-page" data-reader-page="1"><p>Prima.</p></section><section class="pdf-source-page" data-reader-page="2"><p id="page_2"></p></section><section class="pdf-source-page" data-reader-page="3"><p>A treia.</p></section></main>'));
 const changes=await browser.evaluate(`(${removeEmptyTranslatedPages.toString()})()`);
 assert.equal(changes.filter(c=>c.kind==='empty_translated_page_removed').length,1);
 assert.equal(await browser.evaluate('document.querySelectorAll("section.pdf-source-page").length'),2);
 assert.equal(await browser.evaluate('document.getElementById("page_2").tagName.toLowerCase()'),'span');
});

test('resegment merges translated paragraphs to the canonical count preserving inline links',{skip:!process.env.VALIDATEBOOK_INTEGRATION},async t=>{
 const browser=await openBrowser(process.env.VALIDATEBOOK_CHROMIUM);t.after(()=>browser.close());
 await browser.evaluate('document.body.innerHTML='+JSON.stringify('<section class="pdf-source-page" data-source-page="9"><p id="a">Prima propoziție.</p><p id="b">A doua pe <a href="https://ScriptaHub.com">site</a>.</p></section>'));
 const runs=[{paragraphs:['#a','#b'],counts:[2]}];
 const result=await browser.evaluate(`(${applyDomRepairs.toString()})(${JSON.stringify([{kind:'resegment_run',language:'ro',runs}])})`);
 assert.equal(result.changes.filter(c=>c.kind==='resegment_run').length,1);
 assert.equal(await browser.evaluate('document.querySelectorAll("p").length'),1);
 assert.equal(await browser.evaluate('document.querySelector("p a").getAttribute("href")'),'https://ScriptaHub.com');
 assert.equal(await browser.evaluate('document.getElementById("a").tagName.toLowerCase()'),'span');
});

test('resegment splits one translated paragraph into the canonical paragraph count',{skip:!process.env.VALIDATEBOOK_INTEGRATION},async t=>{
 const browser=await openBrowser(process.env.VALIDATEBOOK_CHROMIUM);t.after(()=>browser.close());
 await browser.evaluate('document.body.innerHTML='+JSON.stringify('<section class="pdf-source-page" data-source-page="9"><p id="page_9">Unu, doi și trei.</p></section>'));
 const runs=[{paragraphs:['#page_9'],counts:[1,1]}];
 const result=await browser.evaluate(`(${applyDomRepairs.toString()})(${JSON.stringify([{kind:'resegment_run',language:'ro',runs}])})`);
 assert.equal(result.changes.filter(c=>c.kind==='resegment_run').length,1);
 assert.equal(await browser.evaluate('document.querySelectorAll("p").length'),2);
 assert.equal(await browser.evaluate('document.getElementById("page_9").tagName.toLowerCase()'),'span');
 assert.equal(await browser.evaluate('Array.from(document.querySelectorAll("p"),p=>p.textContent.trim()).join(" | ")'),'Unu. | Doi și trei.');
});

test('localized cover dimensions match English through consolidation and both reader paths',{skip:!process.env.VALIDATEBOOK_INTEGRATION},async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'validatebook-images-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const en=path.join(dir,'en.html'),ro=path.join(dir,'ro.html'),style=path.join(dir,'reader.css');
 await fs.writeFile(style,'body{margin:0}figure{margin:0}img{display:block;width:100%;height:auto}.reader-html-content{width:100%;margin:0}');
 const markup=(height,label)=>'<!doctype html><html><head><link rel="stylesheet" href="reader.css"></head><body data-reader-content data-validatebook-root><figure id="page_1"><img src="data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="698" height="'+height+'"><text x="20" y="40">'+label+'</text></svg>')+'"></figure></body></html>';
 await fs.writeFile(en,markup(973,'English'));await fs.writeFile(ro,markup(793,'Română'));
 const browser=await openBrowser(process.env.VALIDATEBOOK_CHROMIUM);t.after(()=>browser.close());
 const master=await measure(browser,en),before=await measure(browser,ro),src=before.records[0].src;
 assert(compareImageStyles(master,before,'ro').findings.some(f=>f.category==='image_style_difference'));
 let previousCss;
 for(let pass=0;pass<2;pass++){
  const target=await measure(browser,ro);
  await browser.evaluate(`(${applyDomRepairs.toString()})(${JSON.stringify(compareImageStyles(master,target,'ro').actions)})`);
  const saved=await browser.evaluate(`(${applyDomRepairs.toString()})(${JSON.stringify([{kind:'consolidate_styles',href:'validatebook-layout.css',previousCss}])})`);
  previousCss=saved.stylesheet.css;await fs.writeFile(ro,saved.html);await fs.writeFile(path.join(dir,'validatebook-layout.css'),previousCss);
  const contract={generic:true,managed:true,readerCss:pathToFileURL(style).href,booksRoot:pathToFileURL(dir).href,defaultRem:1};
  for(const settings of [null,{importedArticle:contract}]){
   const source=await measure(browser,en,settings),result=await measure(browser,ro,settings);
   for(let i=0;i<3;i++)assert.deepEqual(compareImageStyles(source.layouts[i],result.layouts[i],'ro').findings,[]);
   assert.equal(result.records[0].src,src);
  }
 }
});

test('authorized publisher restoration uses PDF evidence and preserves other prose',{skip:!process.env.VALIDATEBOOK_INTEGRATION},async t=>{
 const browser=await openBrowser(process.env.VALIDATEBOOK_CHROMIUM);t.after(()=>browser.close());
 const source=[{page:3,text:'Copyright © [2026] Source Publisher\nAvailable for free on Source website (www.source.example).'}];
 for(const lang of ['en','ro']){
  await browser.evaluate('document.body.innerHTML='+JSON.stringify('<section><p><strong>Copyright © [2026] LocalBrand</strong></p><p>LocalBrand website (<a href="https://localbrand.example">LocalBrand.example</a>).</p><p>Research by LocalBrand.</p></section><p id="narrative">LocalBrand outside copyright stays unchanged.</p>'));
  const changes=await browser.evaluate(`(${restorePublisherIdentity.toString()})(${JSON.stringify(source)})`);
  assert.equal(changes.length,3);
  assert.equal(await browser.evaluate('document.querySelector("strong").textContent'),'Copyright © [2026] Source Publisher');
  assert.equal(await browser.evaluate('document.querySelector("a").href'),'https://www.source.example/');
  assert.equal(await browser.evaluate('document.querySelector("#narrative").textContent'),'LocalBrand outside copyright stays unchanged.');
  assert.deepEqual(await browser.evaluate(`(${restorePublisherIdentity.toString()})(${JSON.stringify(source)})`),[]);
 }
 await browser.evaluate('document.body.innerHTML='+JSON.stringify('<p><strong>Copyright © [2026] LocalBrand All rights reserved.</strong></p><p>Available for free on LocalBrand website (<a href="https://localbrand.example">LocalBrand.example</a>).</p><h2 id="page_4">Next page</h2><p id="narrative">LocalBrand narrative stays unchanged.</p>'));
 const changes=await browser.evaluate(`(${restorePublisherIdentity.toString()})(${JSON.stringify(source)})`);
 assert.equal(changes.length,2);
 assert.equal(await browser.evaluate('document.querySelector("strong").textContent'),'Copyright © [2026] Source Publisher All rights reserved.');
 assert.equal(await browser.evaluate('document.querySelector("a").href'),'https://www.source.example/');
 assert.equal(await browser.evaluate('document.querySelector("#narrative").textContent'),'LocalBrand narrative stays unchanged.');
});

test('measurement visits all viewports, inspects fonts and never captures a screenshot',async()=>{
  const calls=[];
  const browser={async send(method){calls.push(method);if(method==='DOM.getDocument')return {root:{nodeId:1}};if(method==='DOM.querySelector')return {nodeId:2};if(method==='CSS.getPlatformFontsForNode')return {fonts:[{familyName:'Test font',glyphCount:10}]};return {};},async evaluate(expression){if(expression.startsWith('(function inspectLayout'))return {records:[{selector:'#p',text:'Visible text',tag:'p'}],height:2000};return true;}};
  const result=await measure(browser,'/tmp/fixture.html');assert.equal(result.layouts.length,3);assert.equal(result.platformFonts.length,3);assert(!calls.some(c=>/Screenshot|printToPDF/.test(c)));
});

test('font collection retries one transient timeout and fails if evidence remains unavailable',async()=>{
 let calls=0,persistent=false;
 const browser={async send(method){
   if(method==='DOM.getDocument')return {root:{nodeId:1}};
   if(method==='DOM.querySelector')return {nodeId:2};
   if(method==='CSS.getPlatformFontsForNode'){
     if(++calls===1||persistent)throw Error('CDP timeout: CSS.getPlatformFontsForNode');
     return {fonts:[{familyName:'Verified face',glyphCount:10}]};
   }return {};
 },async evaluate(expression){return expression.startsWith('(function inspectLayout')?{records:[{selector:'#p',text:'Text',tag:'p'}]}:true;}};
 const result=await measure(browser,'/tmp/fixture.html');
 assert.equal(result.platformFonts.length,3);assert.equal(calls,4);
 persistent=true;calls=0;
 await assert.rejects(measure(browser,'/tmp/fixture.html'),/CDP timeout/);assert.equal(calls,2);
});

test('native layout, repair text preservation, table headers and blocked scripts', {skip:!process.env.VALIDATEBOOK_INTEGRATION},async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'layout-browser-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const file=path.join(dir,'book.html');await fs.writeFile(file,'<!doctype html><html lang="ro"><head><title>Fixture</title></head><body><h2 id="title">Titlu</h2><p id="p" style="height:2px;overflow:hidden">Un paragraf lung<br>cu o a doua linie.</p><table id="t"><tr><td>Coloană</td></tr></table><script>document.body.innerHTML="MUTATED"</script></body></html>');
  const browser=await openBrowser(process.env.VALIDATEBOOK_CHROMIUM);try{
    const original=await measure(browser,file);assert(original.records.find(r=>r.id==='p').clipped);assert(!original.text.includes('MUTATED'));
    const actions=[{kind:'tag',selector:'#title',expectedTag:'h2',tag:'h1'},{kind:'table_headers',selector:'#t',rows:[[{tag:'th',colspan:1,rowspan:1}]]},{kind:'presentation',selector:'#p',properties:{height:'auto'}}];
    const repair=await browser.evaluate(`(${applyDomRepairs.toString()})(${JSON.stringify(actions)})`);assert(repair.html.includes('<h1 id="title">Titlu</h1>'));assert(repair.html.includes('<th>Coloană</th>'));assert(repair.html.includes('Un paragraf lung'));assert.equal(repair.changes.length,3);
    const repeated=await browser.evaluate(`(${applyDomRepairs.toString()})(${JSON.stringify([actions[0]])})`);assert.equal(repeated.changes.length,0);
    await assert.rejects(browser.evaluate(`(${applyDomRepairs.toString()})(${JSON.stringify([{kind:'rewrite',selector:'#p',text:'Changed'}])})`));
    assert(!(await fs.readdir(dir)).some(f=>f.endsWith('.png')));
  }finally{await browser.close();}
});

test('managed CSS replaces inline declarations without altering computed typography and survives reruns',{skip:!process.env.VALIDATEBOOK_INTEGRATION},async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'presentation-css-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const file=path.join(root,'book.html');
  await fs.writeFile(file,'<!doctype html><html><head><style>body{font-size:20px}p{color:blue!important}</style></head><body style="font-size:14.6667px;line-height:1.4"><p style="color:red;font-size:inherit"><em style="font-style:italic">Short dialogue.</em></p><p style="color:red;font-size:inherit">Longer prose uses precisely the same size.</p></body></html>');
  const browser=await openBrowser(process.env.VALIDATEBOOK_CHROMIUM);t.after(()=>browser.close());
  const before=await measure(browser,file);
  let previousCss;
  for(let i=0;i<2;i++){
    const result=await browser.evaluate(`(${applyDomRepairs.toString()})(${JSON.stringify([{kind:'consolidate_styles',href:'validatebook-layout.css',previousCss}])})`);
    if(previousCss)assert.equal(result.stylesheet.css,previousCss,'Managed selector priority must be stable across reruns');
    previousCss=result.stylesheet.css;
    assert(!/\sstyle=/.test(result.html));assert(result.stylesheet.css.includes('font-style: italic'));
    await fs.writeFile(path.join(root,result.stylesheet.href),result.stylesheet.css);await fs.writeFile(file,result.html);
    const after=await measure(browser,file);
    assert.deepEqual(after.records.map(r=>r.font),before.records.map(r=>r.font));
    assert.deepEqual(after.records.map(r=>r.text),before.records.map(r=>r.text));
    assert.equal(await browser.evaluate('getComputedStyle(document.querySelector("p")).color'),'rgb(0, 0, 255)');
  }
});

test('managed CSS accepts browser subpixel rounding during consolidation',{skip:!process.env.VALIDATEBOOK_INTEGRATION},async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'presentation-rounding-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const file=path.join(root,'book.html');
  await fs.writeFile(file,'<!doctype html><html><body><h2 style="margin-top:375.635px">How the Story Is Organized</h2><h3 style="margin-top:0.000008px">Scientific notation margin</h3></body></html>');
  const browser=await openBrowser(process.env.VALIDATEBOOK_CHROMIUM);t.after(()=>browser.close());
  await measure(browser,file);
  const result=await browser.evaluate(`(${applyDomRepairs.toString()})(${JSON.stringify([{kind:'consolidate_styles',href:'validatebook-layout.css'}])})`);
  assert(result.stylesheet.css.includes('margin-top: 375.635px'));
  assert(result.stylesheet.css.includes('margin-top: 8e-06px'));
});

test('managed CSS keeps inline repairs above source :is id specificity',{skip:!process.env.VALIDATEBOOK_INTEGRATION},async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'presentation-specificity-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const file=path.join(root,'book.html');
  await fs.writeFile(file,'<!doctype html><html><head><style>[data-pdf-fidelity="ai-agents"]{font-size:14.6667px}[data-pdf-fidelity="ai-agents"] :is(#page_3,#page_4,.source-front-title){font-size:1.882353em}</style></head><body data-pdf-fidelity="ai-agents"><h2 class="source-front-title" style="font-size:29.3333px">How the Story Is Organized</h2></body></html>');
  const browser=await openBrowser(process.env.VALIDATEBOOK_CHROMIUM);t.after(()=>browser.close());
  await measure(browser,file);
  const result=await browser.evaluate(`(${applyDomRepairs.toString()})(${JSON.stringify([{kind:'consolidate_styles',href:'validatebook-layout.css'}])})`);
  await fs.writeFile(path.join(root,'validatebook-layout.css'),result.stylesheet.css);await fs.writeFile(file,result.html);await measure(browser,file);
  const size=await browser.evaluate('getComputedStyle(document.querySelector(".source-front-title")).fontSize');
  assert.equal(size,'29.3333px');
});

test('managed source units stay equal when an article host changes the root rem size',{skip:!process.env.VALIDATEBOOK_INTEGRATION},async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'reader-units-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const file=path.join(root,'book.html');
  await fs.writeFile(file,'<!doctype html><html><head><style>:root{font-size:16px;--standalone-size:1.16rem}</style></head><body style="font-size:calc(var(--reader-font-size, var(--standalone-size,18.56px))*0.7902298850574713)"><p>Short dialogue.</p><p style="font-size:calc(var(--reader-font-size, var(--standalone-size,18.56px))*0.7902298850574713)">Longer prose.</p></body></html>');
  const browser=await openBrowser(process.env.VALIDATEBOOK_CHROMIUM);t.after(()=>browser.close());await measure(browser,file);
  const result=await browser.evaluate('('+applyDomRepairs.toString()+')('+JSON.stringify([{kind:'consolidate_styles',href:'validatebook-layout.css',importedFontRatio:16/19.84,standaloneSizeRem:1.16}])+')');
  assert(result.stylesheet.css.includes('--standalone-size:1.16rem'));
  await fs.writeFile(path.join(root,'validatebook-layout.css'),result.stylesheet.css);await fs.writeFile(file,result.html);await measure(browser,file);
  await browser.evaluate('document.documentElement.style.fontSize="19.84px";document.documentElement.style.setProperty("--reader-font-size","1.16rem");document.body.classList.add("reader-html-content")');
  const sizes=await browser.evaluate('Array.from(document.querySelectorAll("p"),n=>parseFloat(getComputedStyle(n).fontSize))');assert(sizes.every(size=>Math.abs(size-44/3)<.001));
});

test('reader page geometry detects a source stylesheet overriding the centered host container',{skip:!process.env.VALIDATEBOOK_INTEGRATION},async t=>{
  const {checkDisplay}=await import('../src/layout-checks.mjs');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'reader-centered-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const file=path.join(root,'book.html');
  const html='<!doctype html><html lang="en"><head><style>body{margin:0}.reader-html-content{width:min(calc(100% - 48px),72ch);margin:0 auto;padding:30px 22px;box-sizing:border-box}[data-pdf-fidelity]{width:100%;padding:0}</style></head><body><article class="reader-html-content" data-pdf-fidelity="test"><p>Centered reading page.</p></article></body></html>';
  await fs.writeFile(file,html);const browser=await openBrowser(process.env.VALIDATEBOOK_CHROMIUM);t.after(()=>browser.close());
  let result=await measure(browser,file);assert(result.layouts.every(l=>checkDisplay(l,'en').some(f=>f.category==='reader_page_geometry_override')));
  await fs.writeFile(file,html.replace('[data-pdf-fidelity]{width:100%;padding:0}',''));result=await measure(browser,file);assert(result.layouts.every(l=>!checkDisplay(l,'en').some(f=>f.category==='reader_page_geometry_override')));
});
