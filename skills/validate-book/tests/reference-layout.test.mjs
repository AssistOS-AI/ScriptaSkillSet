import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {compareReferenceSpacing} from '../src/reference-layout.mjs';
import {measure} from '../src/layout-browser.mjs';
import {openBrowser} from '../src/browser.mjs';
const source=gap=>[{page:1,width:432,blocks:[{lines:[{words:[{text:'One',left:40,right:60},{text:'two',left:60+gap,right:80+gap}]}]}]}];
const reference=gap=>({measurementKind:'pdf-reference',geometryFindings:[],records:[{page:'1',selector:'#p',spacing:{lines:[{complete:true,words:['One','two'],gaps:[gap]}]}}]});
test('word gaps compare with the original PDF line, not an absolute em threshold',()=>{
 assert.equal(compareReferenceSpacing(source(20),reference(20*96/72)).findings.length,0);
 const bad=compareReferenceSpacing(source(3),reference(30));
 assert.equal(bad.findings[0].category,'source_word_spacing_difference');
 assert.equal(bad.measurements.length,1);
 assert.equal(compareReferenceSpacing(source(3),reference(4.5)).findings.length,0);
});
test('responsive measurements cannot certify source spacing and different wrapping is not a mismatch',()=>{
 assert.throws(()=>compareReferenceSpacing(source(3),{...reference(30),measurementKind:'responsive'}),/reference measurement/);
 const d=reference(30);d.records[0].spacing.lines[0].words=['Different','line'];
 assert.deepEqual(compareReferenceSpacing(source(3),d).findings,[]);
 d.geometryFindings=[{category:'reference_page_width_difference'}];
 assert.equal(compareReferenceSpacing(source(3),d).findings[0].category,'reference_page_width_difference');
});
test('native reference selects the original PDF width while preserving responsive checks and document styles',{skip:!process.env.VALIDATEBOOK_INTEGRATION},async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'pdf-reference-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const file=path.join(root,'index.html');
 await fs.writeFile(file,'<!doctype html><html lang="en"><head><style>p{font-size:16px;text-align:justify}</style></head><body><section class="pdf-source-page" data-reader-page="1"><p>One complete source paragraph with unchanged styling and reading order.</p></section></body></html>');
 const browser=await openBrowser(process.env.VALIDATEBOOK_CHROMIUM);t.after(()=>browser.close());
 const result=await measure(browser,file,null,[{page:1,width:432,height:648}]);
 assert.deepEqual(result.layouts.map(layout=>layout.width),[1440,1024,390]);
 assert.equal(result.measurementKind,'pdf-reference');
 assert.ok(Math.abs(result.referencePages[0].width-576)<=1);
 assert.equal(result.referencePages[0].expectedWidth,576);
 assert.deepEqual(result.geometryFindings,[]);
 assert.equal(result.records[0].font.size,'16px');
 assert.equal(await browser.evaluate('document.querySelector("section").getAttribute("style")'),null);
 await fs.writeFile(file,'<!doctype html><html lang="en"><head><style>section{width:300px}</style></head><body><section class="pdf-source-page" data-reader-page="1"><p>Fixed wrong page width.</p></section></body></html>');
 const wrong=await measure(browser,file,null,[{page:1,width:432,height:648}]);
 assert.equal(wrong.geometryFindings[0].category,'reference_page_width_difference');
});

test('visual fidelity accepts reasonable absolute and source-relative spacing variation',()=>{
 assert.equal(compareReferenceSpacing(source(3),reference(6)).findings.length,0);
 assert.equal(compareReferenceSpacing(source(3),reference(6.1)).findings.length,1);
 assert.equal(compareReferenceSpacing(source(15),reference(25)).findings.length,0);
 assert.equal(compareReferenceSpacing(source(15),reference(26)).findings.length,1);
 const accepted=compareReferenceSpacing(source(3),reference(5.5));
 assert.deepEqual(accepted.tolerance,{absoluteCssPx:2,relative:.25});
 assert.equal(accepted.measurements[0].gaps[0].toleranceCssPx,2);
});

test('natural rendering differences are advisory while forced spacing remains an error',()=>{
 const d=reference(10);d.records[0].style={wordSpacing:'normal',letterSpacing:'normal'};
 assert.equal(compareReferenceSpacing(source(3),d).findings[0].severity,'warning');
 d.records[0].style.wordSpacing='6px';
 assert.equal(compareReferenceSpacing(source(3),d).findings[0].severity,'error');
 d.records[0].style.wordSpacing='normal';d.records[0].style.letterSpacing='2px';
 assert.equal(compareReferenceSpacing(source(3),d).findings[0].severity,'error');
});
