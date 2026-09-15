import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokens } from '../src/pdf2html/common.mjs';
import { coverage, orderScore, segmentRanges, validateAssets } from '../src/pdf2html/validation.mjs';
import { inspectSource, emphasis } from '../src/pdf2html/source.mjs';
import { captionIsBelow } from '../src/pdf2html/images.mjs';
import { parseHtml } from '../src/pdf2html/dom.mjs';
import { inferLanguage, expandInputs, convertMany } from '../src/pdf2html/batch.mjs';
import { ensureBookTarget, installBook, prepareDestination, exists } from '../src/pdf2html/publication.mjs';
async function temporary(t) {const path=await realpath(await mkdtemp(join(tmpdir(),'pdf2html-test-')));t.after(()=>rm(path,{recursive:true,force:true}));return path;}
async function generated(path,content='new') {await mkdir(join(path,'assets'),{recursive:true});await writeFile(join(path,'index.html'),`<html><head><meta name="generator" content="pdf2html-skill"></head><body>${content}</body></html>`);await writeFile(join(path,'assets/styles.css'),content);}
test('text metrics preserve repeated occurrences, ligatures and Romanian text',()=>{
  assert.equal(coverage(tokens('Știință, co-operare și AI.'),tokens('ȘTIINȚĂ co operare și AI plus')),1);
  assert.deepEqual(tokens('diﬃcult Straße co\u00adoperate'),['difficult','strasse','cooperate']);
  assert.equal(coverage(['a','a','b'],['a','b']),2/3);
  assert.equal(orderScore(['a','b','c'],['c','b','a']),0);
});
test('screenshot segments cover a long document within pixel limits',()=>{
  const ranges=segmentRanges(166375,1440);assert.equal(ranges[0][0],0);assert.equal(ranges.reduce((sum,[,height])=>sum+height,0),166375);
  assert.ok(ranges.every(([,height])=>height<=12000 && height*1440<=20000000));
});
test('source extraction preserves words, emphasis, strokes, fills and image regions',async()=>{
  const {evidence}=await inspectSource(fileURLToPath(new URL('fixtures/semantic.pdf',import.meta.url))), expected=JSON.parse(await readFile(new URL('fixtures/semantic-evidence.json',import.meta.url),'utf8'));
  assert.deepEqual(evidence.typography,expected.typography);
  const page=evidence.pages[0],reference=expected.pages[0];
  assert.equal(page.words.length,reference.words.length);
  for(let index=0;index<page.words.length;index++) {
    for(const key of ['text','token','bold','italic','font_name','font_family','color']) assert.equal(page.words[index][key],reference.words[index][key],`${key} at word ${index}`);
    for(const key of ['x0','x1','top','bottom','size_pt']) assert.ok(Math.abs(page.words[index][key]-reference.words[index][key])<.1,`${key} at word ${index}`);
  }
  assert.equal(page.images.length,1);assert.equal(page.rectangles[0].fill_color,'#d3d3d3');assert.equal(page.strokes.length,6);
  assert.deepEqual(emphasis('Subset+ArialMT',[.75,0,.1875,.75,10,20]),{bold:false,italic:true});
});
test('caption position uses source lines',()=>{
  assert.equal(captionIsBelow([{text:'Figure 1. A diagram',top:80}],'Figure 1. A diagram',100,300),false);
  assert.equal(captionIsBelow([{text:'Figure 1. A diagram',top:310}],'Figure 1. A diagram',100,300),true);
  assert.equal(captionIsBelow([],'Figure 1',100,300),null);
});
test('input discovery respects default PDF, nested editions, deduplication and language precedence',async t=>{
  const root=await temporary(t);await mkdir(join(root,'en'));await mkdir(join(root,'ro'));
  const a=join(root,'en/book.pdf'),b=join(root,'ro/edition.PDF');await writeFile(a,'%PDF-');await writeFile(b,'%PDF-');
  assert.deepEqual(await expandInputs([],join(root,'en')),[a]);assert.deepEqual(await expandInputs([root,a],root),[a,b]);
  assert.equal(inferLanguage(join(root,'en/title_RO.pdf'),'fr'),'ro');assert.equal(inferLanguage(b),'ro');assert.equal(inferLanguage(join(root,'unknown.pdf'),'DE'),'de');
});
test('in-place publication preserves source and unrelated files and rejects foreign ownership',async t=>{
  const root=await temporary(t),destination=join(root,'book'),source=join(root,'new');await generated(destination,'old');await generated(source);
  await writeFile(join(destination,'book.pdf'),'%PDF-');await writeFile(join(destination,'notes.txt'),'keep');
  await assert.rejects(installBook(source,destination,false),/already exist/);await installBook(source,destination,true);
  assert.equal(await readFile(join(destination,'book.pdf'),'utf8'),'%PDF-');assert.equal(await readFile(join(destination,'notes.txt'),'utf8'),'keep');assert.equal(await readFile(join(destination,'assets/styles.css'),'utf8'),'new');
  await writeFile(join(destination,'index.html'),'foreign');await writeFile(join(destination,'assets/.pdf2html-skill'),'pdf2html-skill');
  await assert.rejects(ensureBookTarget(destination,true),/not owned/);
});
test('publication rolls back both files if installation fails',async t=>{
  const root=await temporary(t),destination=join(root,'book'),source=join(root,'new');await generated(destination,'old');await mkdir(source);await writeFile(join(source,'index.html'),'new');
  await assert.rejects(installBook(source,destination,true));
  assert.match(await readFile(join(destination,'index.html'),'utf8'),/old/);assert.equal(await readFile(join(destination,'assets/styles.css'),'utf8'),'old');
});
test('output checks reject unknown files and accept owned incomplete assets',async t=>{
  const root=await temporary(t);await writeFile(join(root,'user.txt'),'keep');
  await assert.rejects(prepareDestination(root,false),/not empty/);await assert.rejects(prepareDestination(root,true),/not identified/);
  await mkdir(join(root,'assets/images'),{recursive:true});await ensureBookTarget(root,true);
  await writeFile(join(root,'assets/user.css'),'keep');await assert.rejects(ensureBookTarget(root,true),/not owned/);
  await writeFile(join(root,'assets/.pdf2html-skill'),'pdf2html-skill');await ensureBookTarget(root,true);
});
test('batch rejects collisions before conversion begins',async t=>{
  const root=await temporary(t);await writeFile(join(root,'one.pdf'),'%PDF-');await writeFile(join(root,'two.pdf'),'%PDF-');
  await assert.rejects(convertMany([root]),/same folder/);await generated(root);
  await assert.rejects(convertMany([join(root,'one.pdf')]),/already exist/);
});
test('asset checks resolve temporary-directory aliases and reject remote or escaped images',async t=>{
  const root=await temporary(t),html=join(root,'index.html');await writeFile(html,'');await writeFile(join(root,'image.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>');
  assert.deepEqual(await validateAssets(parseHtml('<img src="image.svg">'),html),[]);
  const outside=await temporary(t);await writeFile(join(outside,'image.svg'),'<svg/>');await symlink(join(outside,'image.svg'),join(root,'linked.svg'));
  const findings=await validateAssets(parseHtml('<img src="https://example.com/a.png"><img src="linked.svg">'),html);
  assert.deepEqual(findings.map(item=>item.code),['remote-image','image-outside-output']);
});
