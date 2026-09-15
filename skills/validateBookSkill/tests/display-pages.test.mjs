import test from 'node:test';
import assert from 'node:assert/strict';
import {checkDisplayPages, displayPageProfiles, displayRowsCentered} from '../src/display-pages.mjs';

const profile={page:2,groups:[{size:26,leading:40,gapBefore:0,bold:true,italic:false,lines:[{}, {}, {}]},{size:15,leading:23,gapBefore:10,bold:false,italic:false,lines:[{},{}]}]};
const record=(g,i)=>({page:'2',displayGroup:String(i),displayLines:g.lines.length,font:{size:String(g.size*96/72),weight:g.bold?'700':'400',style:g.italic?'italic':'normal'},style:{lineHeight:String(g.leading*96/72),textAlign:'center',marginTop:g.gapBefore*96/72}});
test('centered title pages survive one off-axis line',()=>{
  const rows=[
    {left:146,width:156},
    {left:105,width:229},
    {left:135,width:169},
    {left:86,width:270},
    {left:121,width:216},
    {left:144,width:155}
  ];
  assert.equal(displayRowsCentered(rows,432),true);
  assert.equal(displayRowsCentered([{left:52,width:336},{left:52,width:318}],432),false);
});

test('matching HTML delivery modes cannot hide merged source display groups',()=>{
  assert.equal(checkDisplayPages([profile],[{width:1440,records:[]}])[0].page,2);
});
test('source display checks enforce size, emphasis, spacing and line grouping at each viewport',()=>{
  const records=profile.groups.map(record);
  assert.deepEqual(checkDisplayPages([profile],[{width:1440,records},{width:390,records}]),[]);
  for(const change of [{font:{...records[0].font,size:'19px'}},{style:{...records[0].style,textAlign:'left'}},{style:{...records[0].style,marginTop:20}},{displayLines:1}]){
    assert.equal(checkDisplayPages([profile],[{width:1440,records:[{...records[0],...change},records[1]]}]).length,1);
  }
});

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {openBrowser} from '../src/browser.mjs';
import {navigate,applyDomRepairs,measure} from '../src/layout-browser.mjs';
import {inspectLayout} from '../src/layout-checks.mjs';
import {repairDisplayPages} from '../src/display-pages.mjs';

const titleXml=`<pdf2xml><page number="2" width="432" height="648">
<fontspec id="1" size="34" family="AAAAAA+Inter" color="#173346"/>
<fontspec id="2" size="17" family="BBBBBB+EBGaramond" color="#33424b"/>
<fontspec id="3" size="9" family="AAAAAA+Inter" color="#007c82"/>
<fontspec id="4" size="8" family="AAAAAA+Inter" color="#52616a"/>
<text top="50" left="56" width="197" height="41" font="1"><b>ARTIFICIAL​</b></text>
<text top="101" left="56" width="252" height="41" font="1"><b>IMPOSSIBILITY</b></text>
<text top="213" left="73" width="312" height="22" font="2"><i>How Finance, Institutions, Biology, and Culture</i></text>
<text top="239" left="56" width="220" height="22" font="2"><i>Make Feasible Futures Unbuildable</i></text>
<text top="294" left="73" width="277" height="11" font="3"><b>AN OUTFINITIST MAP FOR SCIENCE FICTION, PUBLIC DEBATE,</b></text>
<text top="307" left="56" width="192" height="11" font="3"><b>AND THE AGE OF SCALABLE INTELLIGENCE</b></text>
<text top="411" left="73" width="145" height="10" font="4"><b>ENGLISH EDITION | AUGUST 2026</b></text>
</page></pdf2xml>`;

test('left display pages preserve mixed fonts, source rule and text through two native passes', {skip:!process.env.VALIDATEBOOK_INTEGRATION}, async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'display-pages-'));
 t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const browser=await openBrowser(process.env.VALIDATEBOOK_CHROMIUM);t.after(()=>browser.close());
 const file=path.join(directory,'index.html');
  const html='<html lang="en"><head><style>html{--standalone-size:23.0144px}body{margin:0;width:min(100vw,576px)}section{box-sizing:border-box;padding:12%}p,h1{margin:0}#page_2{font-family:"ShouldNotWin",sans-serif}[data-reader-page="2"] > p:nth-of-type(1){line-height:1.5;text-indent:16.5pt}</style></head><body data-validatebook-root><section class="pdf-source-page" data-reader-page="2" data-source-page="2"><h2 id="page_2">ARTIFICIAL IMPOSSIBILITY</h2><p><em>How Finance, Institutions, Biology, and Culture Make Feasible Futures Unbuildable</em></p><p>AN OUTFINITIST MAP FOR SCIENCE FICTION, PUBLIC DEBATE, AND THE AGE OF SCALABLE INTELLIGENCE</p><p>ENGLISH EDITION | AUGUST 2026</p></section></body></html>';
 await fs.writeFile(file,html);await navigate(browser,file);
 const profiles=await browser.evaluate(`(${displayPageProfiles.toString()})(${JSON.stringify(titleXml)},${JSON.stringify({horizontalRules:[{page:2,x0:56,x1:384,top:192,bottom:192,width:1.5,color:'#007c82'}]})})`);
 assert.equal(profiles.length,1);assert.equal(profiles[0].groups.length,4);assert.equal(profiles[0].groups[0].align,'left');assert.equal(profiles[0].groups[0].rule.color,'#007c82');assert.equal(profiles[0].groups[1].italic,true);
  const fonts={inter:'Arial, sans-serif',ebgaramond:'Georgia, serif'};
  let css=null;
 for(let pass=0;pass<2;pass++){
  await browser.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  const before=await browser.evaluate('document.body.textContent.replace(/\\s+/g, "")');
  await assert.rejects(browser.evaluate(`(${repairDisplayPages.toString()})(${JSON.stringify(profiles)},${JSON.stringify({inter:'Arial'})},23.0144)`),/every group/);
  assert.equal(await browser.evaluate('document.body.textContent.replace(/\\s+/g, "")'),before);
  await browser.evaluate(`(${repairDisplayPages.toString()})(${JSON.stringify(profiles)},${JSON.stringify(fonts)},23.0144)`);
  const result=await browser.evaluate(`(${applyDomRepairs.toString()})(${JSON.stringify([{kind:'consolidate_styles',href:'validatebook-layout.css',previousCss:css}])})`);
  await fs.writeFile(file,result.html);await fs.writeFile(path.join(directory,'validatebook-layout.css'),result.stylesheet.css);css=result.stylesheet.css;
  await navigate(browser,file);
  assert.equal(await browser.evaluate('document.body.textContent.replace(/\\s+/g, "")'),before);
  for(const width of [1440,390]){
   await browser.send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
   const layout=await browser.evaluate(`(${inspectLayout.toString()})()`);
   assert.deepEqual(checkDisplayPages(profiles,[layout],fonts),[]);
   assert.equal(layout.records.filter(r=>r.displayGroup!==null).length,4);
  }
 }
 const readerCss=path.join(directory,'reader.css');
 await fs.writeFile(readerCss,'body{margin:0}.reader-html-content{width:min(100vw,576px)}section{box-sizing:border-box;padding:12%}');
 const imported=await measure(browser,file,{importedArticle:{readerCss:pathToFileURL(readerCss).href,managed:true,defaultRem:1.4384}});
 assert.deepEqual(checkDisplayPages(profiles,imported.layouts,fonts),[]);
 // Detection depends on geometry, not the literal title.
 const renamed=titleXml.replaceAll('ARTIFICIAL','DIFFERENT').replaceAll('IMPOSSIBILITY','TITLE');
 assert.equal((await browser.evaluate(`(${displayPageProfiles.toString()})(${JSON.stringify(renamed)})`)).length,1);
});
