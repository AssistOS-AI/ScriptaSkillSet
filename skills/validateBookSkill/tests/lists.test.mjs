import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openBrowser} from '../src/browser.mjs';
import {navigate} from '../src/layout-browser.mjs';
import {recoverLists} from '../src/lists.mjs';

test('native list recovery preserves text, bold labels, page anchor, numbering and trailing prose', {skip:process.env.VALIDATEBOOK_INTEGRATION!=='1'},async t=>{
 const root=await fs.mkdtemp(join(tmpdir(),'validate-list-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const file=join(root,'index.html');await fs.writeFile(file,'<html><body><section data-source-page="2"><p id="page_2">4. First question? 5. <em>Second</em> question? Following prose.</p></section></body></html>');
 const browser=await openBrowser(process.env.VALIDATEBOOK_CHROMIUM);t.after(()=>browser.close());await navigate(browser,file);
 const profile=[{page:2,kind:'ol',start:4,bodyLeft:50,items:[{text:'4. First question?',number:4,size:10.5,leading:14.8,gap:3.2,left:56,textLeft:70,boldLabel:'First'},{text:'5. Second question?',number:5,size:10.5,leading:14.8,gap:3.2,left:56,textLeft:70,boldLabel:''}]}];
 const call=repair=>browser.evaluate(`(${recoverLists.toString()})(${JSON.stringify(profile)},${repair})`);
 assert.equal((await call(false)).findings[0].kind,'source_list_flattened');assert.equal((await call(true)).changes.length,1);
 assert.equal((await call(false)).findings.length,0);assert.equal((await call(true)).changes.length,0);
 const actual=await browser.evaluate('({start:document.querySelector("ol").start,items:document.querySelectorAll("li").length,strong:document.querySelector("li strong").textContent,em:document.querySelector("li em").textContent,tail:document.querySelector("section > p").textContent,ids:document.querySelectorAll("#page_2").length,markers:document.querySelectorAll(".source-list-marker").length})');
 assert.deepEqual(actual,{start:4,items:2,strong:'First',em:'Second',tail:'Following prose.',ids:1,markers:2});
});
