import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {openBrowser} from '../src/browser.mjs';
import {navigate,importReaderArticle} from '../src/layout-browser.mjs';
import {semanticTemplate,resolveTemplateFonts} from '../src/semantic-template.mjs';
import {pathToFileURL} from 'node:url';

test('semantic template reuses translation, grows pages and is repeatable; ambiguous input stays untouched', {skip:!process.env.VALIDATEBOOK_INTEGRATION},async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'semantic-template-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const browser=await openBrowser(process.env.VALIDATEBOOK_CHROMIUM);t.after(()=>browser.close());
  const source=path.join(dir,'en.html'),target=path.join(dir,'ro.html');
  await fs.writeFile(source,`<!doctype html><html lang="en"><style>main{width:600px;max-width:100%;margin:auto} section{min-height:160px;padding:20px} p{font:16px/24px serif;margin:0 0 12px} td{border:1px solid black;background:#ddd} img{width:80px}</style><main><section class="pdf-source-page" data-reader-page="1"><h1 id="title">Title</h1><p id="para">A <strong>bold</strong> sentence.</p><table><tr><td>Cell.</td></tr></table></section><section class="pdf-source-page" data-reader-page="2"><p id="end">The end.</p></section></main></html>`);
  const long='Această traducere este mai lungă '+ 'și păstrează toate cuvintele '.repeat(45);
  const input=`<!doctype html><html lang="ro"><style>p{font:9px monospace}.emphasis{font-weight:bold;font-style:italic}</style><main><h1 id="title">Titlu</h1><p id="para">${long}<span class="emphasis">accentuate</span> și <a href="#end"><em>legate</em></a>.</p><table><tr><td>Celulă.</td></tr></table><p id="end">Sfârșitul.</p></main></html>`;
  await fs.writeFile(target,input);
  await navigate(browser,source);const template=await browser.evaluate(`(${semanticTemplate.toString()})()`);
  await navigate(browser,target);
  const run=async apply=>browser.evaluate(`(${semanticTemplate.toString()})(${JSON.stringify({template,language:'ro',apply})})`);
  const audit=await run(false);assert.deepEqual(audit.issues,[]);assert.equal(audit.changed,true);
  assert.equal(await fs.readFile(target,'utf8'),input);
  const result=await run(true);assert.deepEqual(result.issues,[]);
  assert.match(result.html,/accentuate/);assert.match(result.html,/font-weight: 700/);assert.match(result.html,/href="#end"/);
  await fs.writeFile(target,result.html);await fs.writeFile(path.join(dir,'validatebook-layout.css'),result.expectedCss);
  await navigate(browser,target);
  const repeat=await run(false);assert.deepEqual(repeat.issues,[]);assert.equal(repeat.changed,false);assert.equal(repeat.expectedCss,result.expectedCss);
  for(const width of [1440,1024,390]){
    await browser.send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
    const geometry=await browser.evaluate(`(()=>{const pages=[...document.querySelectorAll('[data-semantic-page]')].map(n=>n.getBoundingClientRect());return {pages:pages.map(n=>({top:n.top,bottom:n.bottom,height:n.height})),overflow:document.documentElement.scrollWidth>innerWidth+1,font:getComputedStyle(document.querySelector('#para')).fontSize}})()`);
    assert.equal(geometry.overflow,false);assert.equal(geometry.font,'16px');assert.ok(geometry.pages[0].height>160);assert.ok(geometry.pages[1].top>=geometry.pages[0].bottom);
  }
  await fs.writeFile(path.join(dir,'reader.css'),'.reader-html-content p{font-size:32px}');
  await browser.evaluate(`(${importReaderArticle.toString()})(${JSON.stringify({readerCss:pathToFileURL(path.join(dir,'reader.css')).href,managed:true,defaultRem:1})})`);
  await browser.evaluate('Promise.all([...document.querySelectorAll("link[rel=stylesheet]")].map(link=>link.sheet?Promise.resolve():new Promise((resolve,reject)=>{link.onload=resolve;link.onerror=reject}))).then(()=>document.fonts.ready)');
  assert.equal(await browser.evaluate('getComputedStyle(document.querySelector("#para")).fontSize'),'16px');
  await fs.writeFile(target,input.replace('Sfârșitul.','Sfârșitul. O propoziție suplimentară.'));await navigate(browser,target);
  const tolerant=await run(false);
  assert.ok(!tolerant.issues.some(i=>(i.severity||'error')==='error'&&i.blocking!==false));
  assert.ok(tolerant.issues.some(i=>i.code==='translation_sentence_count_difference'));
  const applied=await run(true);assert.ok(!applied.issues.some(i=>(i.severity||'error')==='error'&&i.blocking!==false));assert.match(applied.html,/O propoziție suplimentară/);
  await fs.writeFile(target,input.replace('<td>','<td colspan="2">'));await navigate(browser,target);
  assert.ok((await run(false)).issues.some(i=>i.code==='translation_alignment_ambiguous'));
  await fs.writeFile(target,input.replace('<p id="end">','<p id="para">'));await navigate(browser,target);
  assert.ok((await run(false)).issues.some(i=>i.code==='translation_duplicate_identity'));
});

test('numbered headings anchor across languages and translated extras keep their place', {skip:!process.env.VALIDATEBOOK_INTEGRATION},async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'semantic-anchors-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const browser=await openBrowser(process.env.VALIDATEBOOK_CHROMIUM);t.after(()=>browser.close());
  const source=path.join(dir,'en.html'),target=path.join(dir,'ro.html');
  await fs.writeFile(source,`<!doctype html><html lang="en"><style>main{width:600px;max-width:100%;margin:auto} section{padding:12px} p,h1,h2{font:16px/24px serif;margin:0 0 8px}</style><main><section class="pdf-source-page" data-reader-page="1"><h1 id="title">Title</h1></section><section class="pdf-source-page" data-reader-page="2"><h2>1 . First Chapter</h2><p>Alpha one. Alpha two.</p></section><section class="pdf-source-page" data-reader-page="3"><h2>2 . Second Chapter</h2><p>Beta one.</p></section></main></html>`);
  const input=`<!doctype html><html lang="ro"><style>p,h1,h2{font:9px monospace}</style><main><h1 id="title">Titlu</h1><p>Cuprins: primul, al doilea.</p><h2>1. Primul capitol</h2><p>Alfa unu. Alfa doi. Alfa trei.</p><p>Paragraf suplimentar.</p><h2>2. Al doilea capitol</h2><p>Beta unu.</p></main></html>`;
  await fs.writeFile(target,input);
  await navigate(browser,source);const template=await browser.evaluate(`(${semanticTemplate.toString()})()`);
  await navigate(browser,target);
  const run=async apply=>browser.evaluate(`(${semanticTemplate.toString()})(${JSON.stringify({template,language:'ro',apply})})`);
  const audit=await run(false);
  assert.ok(!audit.issues.some(i=>(i.severity||'error')==='error'&&i.blocking!==false),JSON.stringify(audit.issues));
  assert.ok(audit.issues.some(i=>i.code==='translation_sentence_count_difference'));
  assert.ok(audit.issues.some(i=>i.code==='extra_translation_block'));
  assert.equal(await fs.readFile(target,'utf8'),input);
  const result=await run(true);
  for(const text of ['Cuprins: primul, al doilea.','Alfa unu. Alfa doi. Alfa trei.','Paragraf suplimentar.','Beta unu.'])assert.match(result.html,new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.ok(result.html.indexOf('Cuprins: primul')<result.html.indexOf('Primul capitol'));
  assert.ok(result.html.indexOf('Paragraf suplimentar')>result.html.indexOf('Primul capitol'));
  await fs.writeFile(target,result.html);await fs.writeFile(path.join(dir,'validatebook-layout.css'),result.expectedCss);
  await navigate(browser,target);
  const pages=await browser.evaluate('document.querySelectorAll("[data-semantic-page]").length');
  assert.equal(pages,3);
  const repeat=await run(false);assert.ok(!repeat.issues.some(i=>(i.severity||'error')==='error'&&i.blocking!==false));
});

test('font assets are resolved from local stylesheets and imports without changing source files',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'semantic-fonts-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  await fs.writeFile(path.join(dir,'style.css'),'@import "fonts.css";');
  const css='@font-face{font-family:Book;src:url("face.woff2")}';await fs.writeFile(path.join(dir,'fonts.css'),css);
  const result=await resolveTemplateFonts({sourceUrl:pathToFileURL(path.join(dir,'en.html')).href,stylesheets:[{href:pathToFileURL(path.join(dir,'style.css')).href}]});
  assert.equal(result.fontFaces.length,1);assert.ok(result.fontFaces[0].includes(pathToFileURL(path.join(dir,'face.woff2')).href));
  assert.equal(await fs.readFile(path.join(dir,'fonts.css'),'utf8'),css);
});
