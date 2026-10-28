import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectSource } from '../src/pdf2html/source.mjs';
import { paragraphBorders } from '../src/pdf2html/decorations.mjs';
import { renderHtml } from '../src/pdf2html/renderer.mjs';
import { parseHtml } from '../src/pdf2html/dom.mjs';

test('native PDF strokes survive semantic HTML rendering without rasterization', { skip: process.env.VALIDATEBOOK_INTEGRATION !== '1' }, async t => {
  const root=await mkdtemp(join(tmpdir(),'pdf-border-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const stream='BT /F1 10 Tf 50 510 Td (Body paragraph.) Tj ET\n0.48 0.48 0.48 RG 2 w 65 500 m 65 484 l S 65 485 m 65 468 l S\nBT /F1 10 Tf 74 488 Td (A quotation) Tj 0 -14 Td (continues here.) Tj ET\nBT /F1 10 Tf 56 430 Td (1. First item.) Tj 0 -18 Td (2. Second item.) Tj ET\nBT /F1 10 Tf 50 390 Td (After list.) Tj ET\n';
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 600] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`];
  let pdf='%PDF-1.4\n';const offsets=[0];
  objects.forEach((value,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${value}\nendobj\n`;});
  const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const file=join(root,'book.pdf');await writeFile(file,pdf);
  const source=await inspectSource(file), profile=paragraphBorders(source.evidence);
  assert.equal(profile.borders.length,1);assert.equal(profile.unresolved.length,0);
  const output=renderHtml('<html><body><section class="source-page" data-source-page="1" id="page_1"><p>Body paragraph.</p><p>A quotation continues here.</p><p>1. First item. 2. Second item. After list.</p></section></body></html>',source.evidence,{title:'Border fixture',language:'en'});
  const $=parseHtml(output.html);assert.equal($('li').length,2,'Source list must survive rendering');assert.equal($('section > p').last().text(),'After list.');
  assert.match($('p').filter((_,n)=>$(n).text()==='A quotation continues here.').attr('style'),/border-left:/);
  const body=$('p').filter((_,n)=>$(n).text()==='Body paragraph.');
  assert.equal(body.length,1);assert.equal((body.attr('style') || '').includes('border-left'),false);
});
