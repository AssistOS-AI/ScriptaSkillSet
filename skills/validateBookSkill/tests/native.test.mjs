import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { prepare, report } from '../src/audit.mjs';

function pdfFixture() {
  const stream='BT /F1 12 Tf 72 720 Td (A complete synthetic paragraph for layout testing.) Tj ET';
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Arial >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let pdf='%PDF-1.4\n';const offsets=[0];for(const [i,o] of objects.entries()){offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${o}\nendobj\n`;}
  const offset=Buffer.byteLength(pdf);pdf+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`;return pdf;
}

test('native full audit/repair has zero screenshots, preserves translation and verifies recovery', {skip:!process.env.VALIDATEBOOK_INTEGRATION}, async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'layout-e2e-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  for(const lang of ['en','ro'])await fs.mkdir(path.join(root,lang));
  await fs.writeFile(path.join(root,'en/book.pdf'),pdfFixture());
  const en='<!doctype html><html lang="en"><head><style>body{font-family:Arial}p{font-size:12px}</style></head><body><p id="p1">A complete synthetic paragraph for layout testing.</p></body></html>';
  const ro='<!doctype html><html lang="wrong"><body><p id="p1">Un paragraf sintetic complet pentru verificarea afișării.</p></body></html>';
  await fs.writeFile(path.join(root,'en/full_content.html'),en);await fs.writeFile(path.join(root,'ro/full_content.html'),ro);
  const result=await prepare(root,{autoCorrect:true,languages:'ro',jobDir:path.join(root,'job')});
  assert.equal(result.coverage.screenshots,0);assert.equal(result.coverage.pdfPages,1);assert.equal(result.documents.length,2);
  const fixed=await fs.readFile(path.join(root,'ro/full_content.html'),'utf8');assert(fixed.includes('lang="ro"'));assert(fixed.includes('Un paragraf sintetic complet pentru verificarea afișării.'));assert(result.corrections.some(c=>c.kind==='language_tag'));assert(result.corrections.some(c=>c.kind==='inherit_styles' && c.language==='ro'));assert(fixed.includes('font-family:Arial'));
  // The synthetic PDF has no embedded font. Safe presentation repairs install,
  // but a translated source-font role cannot be certified from this fixture.
  assert.equal(result.status,'needs_attention');
  assert.deepEqual(result.findings.map(f=>[f.language,f.category]),[['ro','translation_style_unmapped']]);
  assert.equal(await fs.readFile(path.join(root,'job/recovery/ro/full_content.html'),'utf8'),ro);
  assert.equal((await report(path.join(root,'job'))).status,result.status);
  const files=await fs.readdir(path.join(root,'job'),{recursive:true});assert(!files.some(f=>/\.(png|jpg|jpeg)$|report\.html$/.test(f)));
  await assert.rejects(prepare(root,{autoCorrect:false,languages:'ro',jobDir:path.join(root,'job')}),/another book or request/);
  await fs.appendFile(path.join(root,'ro/full_content.html'),'changed');await assert.rejects(report(path.join(root,'job')),/Stale input/);
});
