import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { sourceDecorations } from '../src/decorations.mjs';
import { runCorrections, discardTemporaryWork, isDisposableJobDirectory } from '../src/complete.mjs';
import { readingPages, compareEnglish } from '../src/layout-checks.mjs';

test('page furniture does not interrupt paragraphs and reference numbers remain content',()=>{
  const pages=[{page:1,text:'BOOK TITLE\nA paragraph continues\n1'},{page:2,text:'BOOK TITLE\nacross two source pages.\n1649.\n2'},{page:3,text:'BOOK TITLE\nOther content.\n3'}];
  assert(readingPages(pages)[1].text.includes('1649.'));
  const result=compareEnglish(pages,{text:'A paragraph continues across two source pages. 1649. Other content.',records:[{tag:'p',text:'A paragraph continues across two source pages.'}]});
  assert.equal(result.findings.length,0);
  const offset=[{page:10,text:'TITLE\nreview labor will become automatable.\n1'}];
  assert.equal(readingPages(offset)[0].text,'TITLE\nreview labor will become automatable.');
  assert.equal(compareEnglish(offset,{text:'review labor will become automatable.',records:[{tag:'p',text:'review labor will become automatable.'}]}).findings.length,0);
});

test('PDF extraction uses the declared executable and rejects stale evidence', async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'validatebook-provider-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const launcher=path.join(root,'provider.mjs');
  await fs.writeFile(launcher,`#!${process.execPath}\nif(process.argv[2]!=='decorations'||process.argv[3]!==${JSON.stringify(path.join(root,'book.pdf'))})process.exit(2);\nconsole.error('provider diagnostic');\nconsole.log(JSON.stringify({sourceSha256:'expected',borders:[],lists:[],tables:[],unresolved:[]}));\n`,{mode:0o755});
  const result=await sourceDecorations(path.join(root,'book.pdf'),'expected',launcher);
  assert.deepEqual(result.warnings,['provider diagnostic']);
  await assert.rejects(sourceDecorations(path.join(root,'book.pdf'),'stale',launcher),/stale/);
  await assert.rejects(sourceDecorations('book.pdf','expected'),/Configure --pdf2html/);
});

test('completion executes beyond three passes even when error counts stay equal',async()=>{
  const result=await runCorrections(async i=>({inputs:[{file:'book',sha256:String(i)}],result:{findings:i<5?[{severity:'error',category:'layout-'+i}]:[]}}));
  assert.equal(result.passes.length,6);
  assert.equal(result.failure,undefined);
});

test('unchanged installed bytes with unresolved errors are a failure, not passed',async()=>{
  const result=await runCorrections(async()=>({inputs:[{file:'book',sha256:'same'}],result:{findings:[{severity:'error',category:'missing_paragraph'}]}}));
  assert.equal(result.passes.length,2);
  assert.equal(result.failure.code,'unchanged_installed_files');
  assert.equal(result.failure.findings[0].category,'missing_paragraph');
});

test('complete discards job directories and leftover atomic temps, never the book root',async t=>{
  const book=await fs.mkdtemp(path.join(os.tmpdir(),'validatebook-book-'));
  const job=path.join(book,'..',path.basename(book)+'-job');
  t.after(()=>fs.rm(book,{recursive:true,force:true}));
  t.after(()=>fs.rm(job,{recursive:true,force:true}));
  await fs.mkdir(job,{recursive:true});
  await fs.writeFile(path.join(job,'job.json'),'{}\n');
  await fs.mkdir(path.join(book,'.validatebook-layout'));
  await fs.writeFile(path.join(book,'en.full_content.html.validatebook-abc123def0.tmp'),'tmp');
  await fs.writeFile(path.join(book,'RAPORT-CORECTII.txt'),'keep');
  assert.equal(isDisposableJobDirectory(job,book),true);
  assert.equal(isDisposableJobDirectory(book,book),false);
  assert.equal(isDisposableJobDirectory(path.join(book,'.validatebook-layout'),book),false);
  assert.equal(isDisposableJobDirectory(path.dirname(book),book),false);
  await discardTemporaryWork(job,book);
  assert.equal(await fs.access(job).then(()=>true,()=>false),false);
  assert.equal(await fs.access(path.join(book,'.validatebook-layout')).then(()=>true,()=>false),false);
  assert.equal(await fs.access(path.join(book,'en.full_content.html.validatebook-abc123def0.tmp')).then(()=>true,()=>false),false);
  assert.equal(await fs.readFile(path.join(book,'RAPORT-CORECTII.txt'),'utf8'),'keep');
});
