import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { analyze, status, build, extract, synonyms, readJson } from '../src/core.mjs';
test('complete multilingual workflow, source references, synonyms and atomic output', async t => {
 const dir = await fs.mkdtemp(path.join(os.tmpdir(),'keywords-')); t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const source=path.join(dir,'book.html'); const html='<html lang="ro"><body><nav>Skip navigation</nav><main><h1>Inteligență artificială</h1><p>IA și educație.</p></main></body></html>';
 await fs.writeFile(source,html); const dictionary=path.join(dir,'synonyms.json'); await fs.writeFile(dictionary,JSON.stringify({language:'ro',groups:[{canonical:'inteligență artificială',variants:['IA']}]}));
 const prepared=await analyze(source,{count:2,synonyms:dictionary}); const job=await readJson(path.join(prepared.job,'job.json'));
 await assert.rejects(build(prepared.job),/Complete every batch/);
 for(const name of job.batches){const b=await readJson(path.join(prepared.job,'batches',name));await fs.writeFile(path.join(prepared.job,'analyses',name),JSON.stringify({reviewed:true,keywords:[{keyword:'IA',unitIds:[b.units[0].id]}]}));}
 const final=path.join(prepared.job,'selection.json'); await fs.writeFile(final,JSON.stringify({reviewed:true,keywords:[{keyword:'IA',unitIds:[job.units[0].id]}]}));
 assert.equal((await status(prepared.job)).remainingBatches,0);
 assert.deepEqual((await build(prepared.job)).keywords,['inteligență artificială']);
 assert.equal(await fs.readFile(source,'utf8'),html); assert.equal(await fs.readFile(job.output,'utf8'),'inteligență artificială\n');
 await fs.writeFile(final,JSON.stringify({reviewed:true,keywords:[{keyword:'Other',unitIds:['missing']}]}));await assert.rejects(build(prepared.job),/valid source unit/);
 await fs.writeFile(source,html+'changed');await assert.rejects(status(prepared.job),/Source changed/);
});
test('extract omits hidden prose and bibliography and preserves following chapter',()=>{
 const result=extract('<html lang="en"><body><p hidden>Hidden</p><h1>Chapter</h1><p>Evidence</p><h2>References</h2><p>Citation</p><h1>Conclusion</h1><p>Final</p></body></html>');
 assert.equal(result.units.map(u=>u.text).join(' '),'Chapter Evidence Conclusion Final');
 assert.throws(()=>synonyms({groups:[{canonical:'A',variants:['a']}]}),/overlapping/);
});
test('contents exclusion resumes at headings inside following page containers',()=>{
 const result=extract('<html lang="ro"><body><main><section><h1>Cuprins</h1><p>Entry</p></section><section><h1>Capitol</h1><p>Text integral.</p></section><section><h1>Referințe</h1><p>Citation</p></section><section><h1>Concluzie</h1><p>Final.</p></section></main></body></html>');
 assert.equal(result.units.map(u=>u.text).join(' '),'Capitol Text integral. Concluzie Final.');
});
test('complete multi-batch review, language context and configuration isolation',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'keywords-batches-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const source=path.join(dir,'book.html');await fs.writeFile(source,'<html><body><main><p>'+('Educație și cercetare. '.repeat(3500))+'</p></main></body></html>');
 const prepared=await analyze(source,{count:3}),job=await readJson(path.join(prepared.job,'job.json'));assert.ok(job.batches.length>1);assert.equal((await analyze(source,{count:3})).job,prepared.job);
 await assert.rejects(analyze(source,{count:2,jobDir:prepared.job}),/another input or configuration/);
 for(const name of job.batches)await fs.writeFile(path.join(prepared.job,'analyses',name),JSON.stringify({reviewed:true,keywords:[]}));
 await fs.writeFile(path.join(prepared.job,'selection.json'),JSON.stringify({reviewed:true,keywords:[{keyword:'educație',unitIds:[job.units[0].id]}]}));await assert.rejects(build(prepared.job),/Set the source language/);
 await fs.writeFile(path.join(prepared.job,'context.json'),JSON.stringify({language:'ro',notes:'Terminology reviewed.'}));assert.equal((await build(prepared.job)).count,1);
 await fs.writeFile(path.join(prepared.job,'analyses',job.batches[0]),JSON.stringify({reviewed:false,keywords:[]}));await assert.rejects(build(prepared.job),/review is incomplete/);
});
