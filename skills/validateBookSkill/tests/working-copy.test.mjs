import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {workingCopy,installWorkingCopy} from '../src/working-copy.mjs';

test('candidate work and rejected typography never alter the book or host',async t=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'book-transaction-'));t.after(()=>fs.rm(temp,{recursive:true,force:true}));
 const root=path.join(temp,'docs/books/book');await fs.mkdir(path.join(root,'en'),{recursive:true});
 await fs.mkdir(path.join(temp,'docs/reader'));await fs.writeFile(path.join(temp,'docs/reader/reader.js'),'original host');
 await fs.writeFile(path.join(root,'en/full_content.html'),'original prose');
 const dir=path.join(root,'.validatebook-layout/transaction');await fs.mkdir(dir,{recursive:true});
 const copy=await workingCopy(root,dir);
 await fs.writeFile(path.join(copy.stagedRoot,'en/full_content.html'),'candidate prose');
 await fs.writeFile(path.join(copy.tree,'reader/reader.js'),'candidate host');
 assert.equal(await fs.readFile(path.join(root,'en/full_content.html'),'utf8'),'original prose');
 assert.equal(await fs.readFile(path.join(temp,'docs/reader/reader.js'),'utf8'),'original host');
 await assert.rejects(installWorkingCopy(copy,dir,{status:'needs_attention',findings:[{severity:'error',category:'absolute_font_size_difference'}]}),/Unverified/);
 assert.equal(await fs.readFile(path.join(root,'en/full_content.html'),'utf8'),'original prose');
 await assert.rejects(installWorkingCopy(copy,dir,{status:'passed',findings:[]}),/changed the host/);
 await fs.writeFile(path.join(copy.tree,'reader/reader.js'),'original host');
 const installed=await installWorkingCopy(copy,dir,{status:'passed',findings:[]});
 assert.equal(installed.length,1);
 assert.equal(await fs.readFile(installed[0].backup,'utf8'),'original prose');
 assert.equal(await fs.readFile(path.join(root,'en/full_content.html'),'utf8'),'candidate prose');
});

test('a concurrent edit blocks installation before any original replacement',async t=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'book-concurrent-'));t.after(()=>fs.rm(temp,{recursive:true,force:true}));
 const root=path.join(temp,'book'),dir=path.join(temp,'job');await fs.mkdir(root);await fs.mkdir(dir);
 await fs.writeFile(path.join(root,'a.html'),'first');await fs.writeFile(path.join(root,'b.html'),'second');
 const copy=await workingCopy(root,dir);await fs.writeFile(path.join(copy.stagedRoot,'a.html'),'candidate');
 await fs.writeFile(path.join(root,'b.html'),'user edit');
 await assert.rejects(installWorkingCopy(copy,dir,{status:'passed',findings:[]}),/Stale input/);
 assert.equal(await fs.readFile(path.join(root,'a.html'),'utf8'),'first');
 assert.equal(await fs.readFile(path.join(root,'b.html'),'utf8'),'user edit');
});

test('verified corrections can install while unresolved validation errors remain reported',async t=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'book-partial-'));t.after(()=>fs.rm(temp,{recursive:true,force:true}));
 const root=path.join(temp,'book'),dir=path.join(temp,'job');await fs.mkdir(root);await fs.mkdir(dir);
 await fs.writeFile(path.join(root,'book.html'),'before');
 const copy=await workingCopy(root,dir);await fs.writeFile(path.join(copy.stagedRoot,'book.html'),'after');
 const installed=await installWorkingCopy(copy,dir,{status:'completed_with_errors',findings:[{severity:'error',category:'unresolved_source_mapping'}]});
 assert.equal(installed.length,1);
 assert.equal(await fs.readFile(path.join(root,'book.html'),'utf8'),'after');
});
