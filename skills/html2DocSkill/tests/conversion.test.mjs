import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {convert,validate,owned} from '../src/core.mjs';
import {unzipSync,zipSync,strFromU8,strToU8,xml,all,xtext,html,select} from '../src/runtime.mjs';
import {StyleResolver,points,color} from '../src/css.mjs';
async function setup(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'html2doc-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));await fs.cp(new URL('./fixtures/book',import.meta.url),path.join(dir,'book'),{recursive:true});return {dir,source:path.join(dir,'book/index.html'),target:path.join(dir,'out.docx')};}
test('DOCX preserves reference semantic structure, notes, links and page numbering',async t=>{const {source,target}=await setup(t),bytes=await fs.readFile(source);const report=await convert(source,target);assert.equal(report.status,'passed');assert.equal(report.metrics.textCoverage,1);assert.equal(report.metrics.textOrder,1);assert.deepEqual(await fs.readFile(source),bytes);assert.equal(await owned(target),true);
 const files=unzipSync(await fs.readFile(target)),reference=unzipSync(await fs.readFile(new URL('./fixtures/reference.docx',import.meta.url)));
 for(const name of ['word/document.xml','word/footnotes.xml','word/endnotes.xml']){const a=xml(strFromU8(files[name])),b=xml(strFromU8(reference[name]));assert.equal(xtext(a).replace(/\s+/g,' ').trim(),xtext(b).replace(/\s+/g,' ').trim());for(const tag of ['w:hyperlink','w:drawing','w:tbl','w:footnoteReference','w:endnoteReference'])assert.equal(all(a,tag).length,all(b,tag).length,tag);}
 const doc=xml(strFromU8(files['word/document.xml']));assert.equal(all(doc,'w:sectPr').length,2);assert.equal(all(doc,'w:pgNumType').filter(n=>n.getAttribute('w:fmt')==='decimal'&&n.getAttribute('w:start')==='1').length,1);assert.equal(Object.keys(files).filter(n=>/^word\/header\d/.test(n)).length,0);
 const chapter=all(doc,'w:p').find(p=>xtext(p)==='Chapter Two'&&all(p,'w:pStyle')[0]?.getAttribute('w:val')==='Heading1');assert.equal(all(chapter,'w:spacing')[0].getAttribute('w:line'),'276');
 await assert.rejects(convert(source,target),/overwrite/);await convert(source,target,{overwrite:true});
 files['word/document.xml']=strToU8(strFromU8(files['word/document.xml']).replace('Second chapter links to','Removed prose'));const bad=path.join(path.dirname(target),'damaged.docx');await fs.writeFile(bad,zipSync(files));assert.equal((await validate(source,bad)).status,'failed');
});
test('input boundary, remote resources and unrelated outputs are rejected',async t=>{const {source,target}=await setup(t);await fs.writeFile(source,'<html><body><p>Text</p></body></html>');await assert.rejects(convert(source,target),/data-reader-content/);await fs.writeFile(source,'<html><body><main data-reader-content><img src="https://example.com/image.png"></main></body></html>');await assert.rejects(convert(source,target),/Remote resources/);await fs.writeFile(target,'unrelated');await assert.rejects(convert(source,target,{overwrite:true}),/not owned/);});
test('CSS cascade, variables and dimensions',()=>{const doc=html.parseDocument('<html><style>:root{--base:12pt}p{font-size:var(--base);color:#abc}.lead{font-size:2em}</style><body><p class="lead" style="text-align:center">Text</p></body></html>'),resolver=new StyleResolver(doc,'/tmp/index.html'),p=select.selectOne('p',doc);assert.equal(resolver.resolve(p,'text-align'),'center');assert.equal(points(resolver.resolve(p,'font-size'),12),24);assert.equal(color(resolver.resolve(p,'color')),'AABBCC');assert.equal(points('96px'),72);assert.equal(color('rgb(1, 2, 255)'),'0102FF');});
test('metadata overrides and contents insertion preserve the editorial sequence',async t=>{
 const {source,target}=await setup(t);let markup=await fs.readFile(source,'utf8');markup=markup.replace(/<section class="source-page" id="page_2">[\s\S]*?<\/section>/,'');await fs.writeFile(source,markup);
 await convert(source,target,{title:'Override Title',author:'New Author',language:'ro'});const files=unzipSync(await fs.readFile(target)),meta=xml(strFromU8(files['docProps/core.xml'])),doc=xml(strFromU8(files['word/document.xml']));
 assert.equal(all(meta,'dc:title')[0].textContent,'Override Title');assert.equal(all(meta,'dc:creator')[0].textContent,'New Author');assert.equal(all(meta,'dc:language')[0].textContent,'ro');
 const text=all(doc,'w:p').map(xtext);assert.ok(text.indexOf('A Sample Book')<text.indexOf('Contents'));assert.ok(text.indexOf('Contents')<text.indexOf('Chapter One'));
 const heading=all(doc,'w:p').find(p=>xtext(p)==='Chapter Two'&&all(p,'w:pStyle')[0]?.getAttribute('w:val')==='Heading1');assert.equal(all(heading,'w:b')[0].getAttribute('w:val'),'0');
});
test('front matter page boundaries and documents without headings',async t=>{
 const {source,target}=await setup(t);await fs.writeFile(source,`<html><body><main data-reader-content>
 <section class="source-page"><p>Copyright page</p></section>
 <section class="source-page"><h1>Book Title</h1><p>Book subtitle</p></section>
 <section class="source-page"><h1>A Note</h1><p>Note body.</p></section>
 <section class="source-page" aria-label="PDF page 4"><h1>Contents</h1><p>Prologue</p></section>
 <section class="source-page"><h1>Prologue</h1><p>Body text.</p></section>
 </main></body></html>`);
 await convert(source,target);let doc=xml(strFromU8(unzipSync(await fs.readFile(target))['word/document.xml']));
 for(const label of ['Book Title','A Note','Contents'])assert.equal(all(all(doc,'w:p').find(p=>xtext(p)===label),'w:pageBreakBefore').length,1,label);
 await fs.writeFile(source,'<html><body><main data-reader-content><p>Plain document body.</p></main></body></html>');const result=await convert(source,target,{overwrite:true});assert.equal(result.status,'passed_with_warnings');doc=xml(strFromU8(unzipSync(await fs.readFile(target))['word/document.xml']));const texts=all(doc,'w:p').map(xtext);assert.equal(texts[0],'Contents');assert.equal(texts.at(-1),'Plain document body.');
});
test('disabled raster formats and malformed OOXML are rejected',async()=>{
 const {imageSize}=await import('../src/runtime.mjs');assert.throws(()=>imageSize(Buffer.from('69636e730000000869636e7300000000','hex')));
 assert.throws(()=>xml('<!DOCTYPE foo [<!ENTITY x "text">]><foo>&x;</foo>'),/entities/);
 assert.throws(()=>xml('<a><b></a>'),/Invalid XML/);
});
