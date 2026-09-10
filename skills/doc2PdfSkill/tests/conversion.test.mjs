import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {convert,validate,metadata,lossless} from '../src/core.mjs';
import {sourceInfo,run} from '../src/runtime.mjs';
import {validateReference,ppm,difference} from '../src/qa.mjs';
const fixture=new URL('./fixtures/book.docx',import.meta.url);
function temp(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'doc2pdf-node-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
test('source formats and raster integrity',t=>{const dir=temp(t),bad=path.join(dir,'bad.docx');fs.writeFileSync(bad,'not a zip');assert.throws(()=>sourceInfo(bad));const doc=path.join(dir,'book.doc');fs.writeFileSync(doc,Buffer.from('D0CF11E0A1B11AE1','hex'));assert.equal(sourceInfo(doc).links,null);const image=ppm(Buffer.concat([Buffer.from('P6\n1 1\n255\n'),Buffer.from([255,255,255])]));assert.equal(difference(image,image),0);assert.throws(()=>ppm(Buffer.from('P6\n2 2\n255\n')));});
test('missing native dependency fails before output creation',t=>{const dir=temp(t),source=path.join(dir,'book.docx');fs.copyFileSync(fixture,source);const old=process.env.SCRIPTA_QPDF;process.env.SCRIPTA_QPDF='/missing/qpdf';try{assert.throws(()=>convert(source,path.join(dir,'nested/book.pdf')),/Missing runtime/);assert.equal(fs.existsSync(path.join(dir,'nested')),false);}finally{if(old===undefined)delete process.env.SCRIPTA_QPDF;else process.env.SCRIPTA_QPDF=old;}});
for(const profile of ['fidelity','balanced','compact'])test(`Word conversion and independent validation: ${profile}`,t=>{const dir=temp(t),source=path.join(dir,'book.docx'),output=path.join(dir,'book.pdf');fs.copyFileSync(fixture,source);const before=fs.readFileSync(source),result=convert(source,output,{profile});assert.notEqual(result.status,'failed');assert.equal(result.metrics.textCoverage,1);assert.equal(result.metrics.textOrder,1);assert.equal(result.metrics.visualValidation,true);assert.equal(metadata(output)['/ScriptaSkill'],'u:doc2pdf-skill');assert.deepEqual(fs.readFileSync(source),before);assert.throws(()=>convert(source,output),/overwrite/);assert.notEqual(validate(source,output).status,'failed');
 const unrelated=path.join(dir,'unowned.pdf');run('qpdf',['--empty','--pages',output,'--',unrelated]);assert.throws(()=>convert(source,unrelated,{overwrite:true}),/not owned/);
 const removed=path.join(dir,'removed.pdf');run('qpdf',[output,'--pages','.', '1','--',removed]);const qa=validateReference(output,removed,{profile,renderDir:path.join(dir,'bad-renders')});assert.equal(qa.status,'failed');assert.ok(qa.findings.some(f=>f.code==='page-count'));
});
test('failed image compression falls back to fidelity',t=>{
 const dir=temp(t),source=path.join(dir,'book.docx'),output=path.join(dir,'book.pdf'),tool=path.join(dir,'gs');
 fs.copyFileSync(fixture,source);
 fs.writeFileSync(tool,'#!/bin/sh\nif [ "$1" = "--version" ]; then echo 10.0; exit 0; fi\necho "fixture compression failure" >&2\nexit 1\n',{mode:0o755});
 const previous=process.env.SCRIPTA_GS;process.env.SCRIPTA_GS=tool;
 try{const result=convert(source,output,{profile:'balanced'});assert.equal(result.profile,'fidelity');assert.equal(result.requestedProfile,'balanced');assert.ok(result.warnings.some(w=>w.code==='profile-fallback'));assert.equal(result.metrics.textCoverage,1);}
 finally{if(previous===undefined)delete process.env.SCRIPTA_GS;else process.env.SCRIPTA_GS=previous;}
});
test('binary Word documents convert with preserved text',t=>{
 const dir=temp(t),source=path.join(dir,'book.docx'),docs=path.join(dir,'docs'),profile=path.join(dir,'lo-profile');fs.copyFileSync(fixture,source);fs.mkdirSync(docs);
 run('soffice',[`-env:UserInstallation=${new URL('file://'+profile).href}`,'--headless','--convert-to','doc:MS Word 97','--outdir',docs,source]);
 const doc=path.join(docs,'book.doc');assert.equal(sourceInfo(doc).links,null);const result=convert(doc);assert.notEqual(result.status,'failed');assert.equal(result.metrics.textCoverage,1);assert.ok(fs.statSync(result.artifact).size>1000);
});
