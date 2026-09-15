import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {readerTypographyRepairs,readerGeometryCss} from '../src/reader-repairs.mjs';
import {openBrowser} from '../src/browser.mjs';
import {navigate} from '../src/layout-browser.mjs';

const record=(selector,size,tag='p')=>({selector,tag,text:tag==='img'?'':'Text',font:{size:size+'px',family:'serif'},style:{lineHeight:size*1.4+'px'}});
test('responsive typography and image inheritance do not block independent reader repairs',()=>{
  const source={layouts:[{records:[record('#image',20,'img'),record('#responsive',20),record('#stable',16)]},{records:[record('#image',12,'img'),record('#responsive',12),record('#stable',16)]}]};
  const target={layouts:source.layouts.map(l=>({records:l.records.map(r=>record(r.selector,18,r.tag))}))};
  const actions=readerTypographyRepairs(source,target,16);
  assert.deepEqual(actions.map(a=>a.selector),['#stable']);
});

test('host geometry remains responsive despite source root padding and width', {skip:!process.env.VALIDATEBOOK_INTEGRATION},async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'reader-geometry-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const host=path.join(dir,'reader.css'),file=path.join(dir,'book.html');
  await fs.writeFile(host,'body{margin:0}.reader-html-content{box-sizing:border-box;width:80%;max-width:900px;margin:0 auto;padding:24px}@media(max-width:600px){.reader-html-content{width:100%;padding:0}}');
  await fs.writeFile(file,'<html><head><link rel="stylesheet" href="reader.css"><style>[data-pdf-fidelity]{padding:32px;width:50%}p{margin:17px}</style></head><body><article class="reader-html-content" data-pdf-fidelity data-validatebook-root><p>Text</p></article></body></html>');
  const browser=await openBrowser(process.env.VALIDATEBOOK_CHROMIUM);t.after(()=>browser.close());await navigate(browser,file);
  const css=await browser.evaluate(`(${readerGeometryCss.toString()})(${JSON.stringify(await fs.readFile(host,'utf8'))})`);
  await browser.evaluate(`{const s=document.createElement('style');s.textContent=${JSON.stringify(css)};document.head.append(s);}`);
  for(const width of [1440,1024,390]){
    await browser.send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
    const actual=await browser.evaluate(`{const a=document.querySelector('article');({width:a.getBoundingClientRect().width,padding:getComputedStyle(a).paddingTop,paragraph:getComputedStyle(a.firstChild).marginTop})}`);
    assert(Math.abs(actual.width-(width<600?width:Math.min(900,width*.8)))<.1);
    assert.equal(actual.padding,width<600?'0px':'24px');assert.equal(actual.paragraph,'17px');
  }
});
