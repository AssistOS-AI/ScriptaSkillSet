import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openBrowser } from '../src/browser.mjs';
import { measure, applyDomRepairs } from '../src/layout-browser.mjs';

test('measurement visits all viewports, inspects fonts and never captures a screenshot',async()=>{
  const calls=[];
  const browser={async send(method){calls.push(method);if(method==='DOM.getDocument')return {root:{nodeId:1}};if(method==='DOM.querySelector')return {nodeId:2};if(method==='CSS.getPlatformFontsForNode')return {fonts:[{familyName:'Test font',glyphCount:10}]};return {};},async evaluate(expression){if(expression.startsWith('(function inspectLayout'))return {records:[{selector:'#p',text:'Visible text',tag:'p'}],height:2000};return true;}};
  const result=await measure(browser,'/tmp/fixture.html');assert.equal(result.layouts.length,3);assert.equal(result.platformFonts.length,3);assert(!calls.some(c=>/Screenshot|printToPDF/.test(c)));
});

test('native layout, repair text preservation, table headers and blocked scripts', {skip:!process.env.VALIDATEBOOK_INTEGRATION},async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'layout-browser-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const file=path.join(dir,'book.html');await fs.writeFile(file,'<!doctype html><html lang="ro"><head><title>Fixture</title></head><body><h2 id="title">Titlu</h2><p id="p" style="height:2px;overflow:hidden">Un paragraf lung<br>cu o a doua linie.</p><table id="t"><tr><td>Coloană</td></tr></table><script>document.body.innerHTML="MUTATED"</script></body></html>');
  const browser=await openBrowser(process.env.VALIDATEBOOK_CHROMIUM);try{
    const original=await measure(browser,file);assert(original.records.find(r=>r.id==='p').clipped);assert(!original.text.includes('MUTATED'));
    const actions=[{kind:'tag',selector:'#title',expectedTag:'h2',tag:'h1'},{kind:'table_headers',selector:'#t',rows:[[{tag:'th',colspan:1,rowspan:1}]]},{kind:'presentation',selector:'#p',properties:{height:'auto'}}];
    const repair=await browser.evaluate(`(${applyDomRepairs.toString()})(${JSON.stringify(actions)})`);assert(repair.html.includes('<h1 id="title">Titlu</h1>'));assert(repair.html.includes('<th>Coloană</th>'));assert(repair.html.includes('Un paragraf lung'));assert.equal(repair.changes.length,3);
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
    previousCss=result.stylesheet.css;
    assert(!/\sstyle=/.test(result.html));assert(result.stylesheet.css.includes('font-style: italic'));
    await fs.writeFile(path.join(root,result.stylesheet.href),result.stylesheet.css);await fs.writeFile(file,result.html);
    const after=await measure(browser,file);
    assert.deepEqual(after.records.map(r=>r.font),before.records.map(r=>r.font));
    assert.deepEqual(after.records.map(r=>r.text),before.records.map(r=>r.text));
    assert.equal(await browser.evaluate('getComputedStyle(document.querySelector("p")).color'),'rgb(0, 0, 255)');
  }
});

test('managed source units stay equal when an article host changes the root rem size',{skip:!process.env.VALIDATEBOOK_INTEGRATION},async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'reader-units-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const file=path.join(root,'book.html');
  await fs.writeFile(file,'<!doctype html><html><head><style>:root{font-size:16px;--standalone-size:1.16rem}</style></head><body style="font-size:calc(var(--reader-font-size, var(--standalone-size,18.56px))*0.7902298850574713)"><p>Short dialogue.</p><p style="font-size:calc(var(--reader-font-size, var(--standalone-size,18.56px))*0.7902298850574713)">Longer prose.</p></body></html>');
  const browser=await openBrowser(process.env.VALIDATEBOOK_CHROMIUM);t.after(()=>browser.close());await measure(browser,file);
  const result=await browser.evaluate('('+applyDomRepairs.toString()+')('+JSON.stringify([{kind:'consolidate_styles',href:'validatebook-layout.css',importedFontRatio:16/19.84}])+')');
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
