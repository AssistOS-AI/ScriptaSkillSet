import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compareEnglish, compareStructure, checkDisplay, comparePdfFonts, comparePdfGeometry } from '../src/layout-checks.mjs';
import { discover, collectAssets, doctor } from '../src/audit.mjs';
import { textReport, layoutReport } from '../src/layout-report.mjs';
import { planComplete, completeStatus } from '../src/complete.mjs';
import { fileHash, writeJson } from '../src/storage.mjs';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'layout-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const lang of ['en','ro']) { await fs.mkdir(path.join(root,lang)); await fs.writeFile(path.join(root,lang,'full_content.html'),`<html lang="${lang}"><p id="p1">Fixture paragraph.</p></html>`); }
  await fs.writeFile(path.join(root,'en/book.pdf'),'fixture');
  await writeJson(path.join(root,'manifest.json'),{editions:{en:{fullContent:'en/full_content.html'},ro:{fullContent:'ro/full_content.html'},fr:{book:'fr/book.html'}}});
  return root;
}
const record=(id,text='A paragraph.',extra={})=>({id,selector:'#'+id,tag:'p',classes:'',text,font:{family:'Garamond'},...extra});
const document=records=>({records,text:records.map(r=>r.text).join('\n'),language:'en',duplicates:[],brokenLinks:[],fontFaces:[],scrollWidth:390,width:390});

test('all PDF pages compared; omission is localized without rewriting',()=>{
  const pages=[{page:1,text:'This first paragraph appears in both documents.'},{page:2,text:'This second paragraph was lost during conversion.'}];
  const result=compareEnglish(pages,document([record('p1',pages[0].text)]));
  assert.equal(result.coverage.length,2);assert.equal(result.findings.filter(f=>f.category==='source_text_unmatched').length,1);assert.match(result.findings[0].location,/page 2/);
});
test('source page folios are not treated as translated structural counterparts',()=>{
  const en=document([{...record('page_13','CHAPTER 1'),tag:'h2'}]);
  const ro=document([record('page_13','Un paragraf tradus.')]);
  const findings=compareStructure(en,ro,'ro').findings;
  assert(!findings.some(f=>f.category==='structural_tag'));
  assert(!findings.some(f=>f.category==='missing_structural_anchor'));
});
test('missing translated paragraph and equal-count anchor substitution are detected structurally',()=>{
  const en=document([record('p1'),record('p2')]);
  const missing=compareStructure(en,document([record('p1','Traducere.')]),'ro');
  assert(missing.findings.some(f=>f.category==='block_sequence_difference'));assert(missing.findings.some(f=>f.location==='id:p2'));
  const substitute=compareStructure(en,document([record('p1'),record('different')]),'ro');assert(substitute.findings.some(f=>f.location==='id:p2'));
  assert(!missing.findings.some(f=>f.repair?.text));
});
test('only unambiguous table header differences have an automatic repair',()=>{
  const en=document([record('table','',{tag:'table',rows:[[{tag:'th',colspan:1,rowspan:1}]]})]);
  const ro=document([record('table','',{tag:'table',rows:[[{tag:'td',colspan:1,rowspan:1}]]})]);
  assert.equal(compareStructure(en,ro,'ro').findings.find(f=>f.category==='table_structure').repair.kind,'table_headers');
  ro.records[0].rows[0][0].colspan=2;
  assert.equal(compareStructure(en,ro,'ro').findings.find(f=>f.category==='table_structure').repair,undefined);
});
test('local display detects hidden/clipped text, corruption, failed fonts, broken links and images',()=>{
  const d=document([record('bad','Broken \uFFFD',{hidden:true,clipped:true}),record('image','',{tag:'img',broken:true,src:'missing.png'})]);d.fontFaces=[{family:'BookFont',status:'error'}];d.brokenLinks=['#absent'];d.scrollWidth=900;
  const kinds=checkDisplay(d,'en').map(f=>f.category);for(const name of ['hidden_content','clipped_content','suspect_character','font_load_failed','broken_anchor','broken_image','horizontal_overflow'])assert(kinds.includes(name));
});
test('actual rendered fonts compared with PDF subset names',()=>{
  const source='ABCDEF+EBGaramond-Regular TrueType yes yes yes 1 0';
  assert.equal(comparePdfFonts(source,[{fonts:[{familyName:'EB Garamond',glyphCount:40}]}]).length,0);
  assert.equal(comparePdfFonts(source,[{fonts:[{familyName:'Arial',glyphCount:40}]}])[0].category,'source_font_family_unmatched');
  assert.equal(comparePdfFonts(source,[{fonts:[{familyName:'pdf-font-9e82528ffc0c',glyphCount:40}]}],[{source_name:'ABCDEF+EBGaramond-Regular',css_family:'pdf-font-9e82528ffc0c'}]).length,0);
});
test('new coordinator has only layout stages and discovers no absent readers',async t=>{
  const root=await fixture(t),d=await discover(root);assert.deepEqual(d.documents.map(d=>d.language),['en','ro']);
  const p=await planComplete(root);assert.equal(p.status,'incomplete');assert(!p.stages.join(' ').match(/humanis|summar|metadata|translation rewriting/i));
  assert.equal((await completeStatus(p.stateFile)).auditDirectory,p.auditDirectory);
  const cli=fileURLToPath(new URL('../scripts/validatebook.mjs',import.meta.url));
  const run=spawnSync(process.execPath,[cli,'complete-status',p.stateFile],{encoding:'utf8'});assert.equal(run.status,3);assert.equal(JSON.parse(run.stdout).scope,'layout_and_structure');
});
test('CLI rejects removed external repair-plan input',()=>{
  const cli=fileURLToPath(new URL('../scripts/validatebook.mjs',import.meta.url));
  const run=spawnSync(process.execPath,[cli,'prepare','/book','--patches','plan.json'],{encoding:'utf8'});
  assert.equal(run.status,2);assert.match(run.stderr,/Unknown option '--patches'/);
});
test('CSS imports/fonts are in the hash closure, remote scripts only warn',async t=>{
  const root=await fixture(t);await fs.writeFile(path.join(root,'a.css'),'@import "b.css";');await fs.writeFile(path.join(root,'b.css'),'@font-face{src:url(font.ttf)}');await fs.writeFile(path.join(root,'font.ttf'),'font');
  const result=await collectAssets({language:'en',resources:[{tag:'link',url:new URL('file://'+root+'/a.css').href},{tag:'script',url:'https://example.test/script.js'}],loadedResources:[]});
  assert.equal(result.inputs.length,3);assert.equal(result.findings[0].severity,'warning');
});
test('report has only text/JSON, remains stale after source mutation',async t=>{
  const root=await fixture(t),file=path.join(root,'en/full_content.html');
  const result={scope:'layout_and_structure',status:'passed',documents:[{language:'en'}],pageCoverage:[{page:1}],corrections:[],findings:[],initialFindings:[],limitations:['No semantic translation review.'],backups:[]};
  await writeJson(path.join(root,'job.json'),{scope:'layout_and_structure',inputs:[{file,sha256:await fileHash(file)}],artifacts:[],result});
  await layoutReport(root);const files=await fs.readdir(root);assert(files.includes('report.txt'));assert(!files.includes('repair-tasks.json'));assert(!files.some(f=>/\.png$|report\.html$/.test(f)));assert(!textReport(result).includes('<img'));
  await fs.appendFile(file,'changed');await assert.rejects(layoutReport(root),/Stale input/);
});
test('preflight missing tools fails before creating output',async()=>{await assert.rejects(doctor({chromium:'/definitely-missing-layout-browser'}),/ENOENT/);});

test('source bounds expose a body paragraph incorrectly enlarged as a heading',()=>{
  const prose='This is a source body paragraph with enough text to establish its normal line height and compare the HTML presentation.';
  const second=prose+' Additional source context.';
  const block=text=>({text,lines:[{bottom:20,top:10}],left:10,right:300,top:10,bottom:20});
  const d=document([record('p',prose,{font:{size:'16px'}}),record('wrong',second,{tag:'h2',font:{size:'32px'}})]);
  const result=comparePdfGeometry([{page:1,blocks:[block(prose),block(second)]}],d);
  assert.equal(result.mappings.length,2);assert(result.findings.some(f=>f.location==='#wrong' && f.category==='source_type_scale_difference'));
});

test('status rejects unrelated or malformed jobs without overwriting evidence',async t=>{
  const root=await fixture(t),file=path.join(root,'job.json');
  for(const job of [{scope:'complete_book',inputs:[],artifacts:[],result:{status:'passed'}},{scope:'layout_and_structure',inputs:[],artifacts:[],result:{scope:'complete_book'}},{scope:'layout_and_structure',result:{scope:'layout_and_structure'}}]){
    await writeJson(file,job);
    await assert.rejects(layoutReport(root),/Invalid layout job contract/);
    assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')),job);
  }
  const coordinator=path.join(root,'complete.json');
  for(const state of [{scope:'complete_book'},{scope:'layout_and_structure',root,auditDirectory:root,documents:[],identity:'wrong'}]){
    await writeJson(coordinator,state);
    await assert.rejects(completeStatus(coordinator),/Invalid layout coordinator contract/);
    assert.deepEqual(JSON.parse(await fs.readFile(coordinator,'utf8')),state);
  }
});
